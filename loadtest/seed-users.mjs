// Seed / clean up load-test student accounts.
//
//   node loadtest/seed-users.mjs create    # create USER_COUNT confirmed students
//   node loadtest/seed-users.mjs cleanup   # delete every loadtest+*@EMAIL_DOMAIN account
//
// Reads config from loadtest/.env or process.env. Requires the SERVICE ROLE key.
// These accounts are the ONLY identities the k6 tests log in as — keep them on a
// distinct email prefix so cleanup is exact.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// Minimal .env loader (loadtest/.env), without adding a dependency.
try {
  const env = readFileSync(join(here, '.env'), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch { /* no .env file — rely on process.env */ }

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const COUNT = parseInt(process.env.USER_COUNT || '50', 10);
const PASSWORD = process.env.TEST_PASSWORD || 'LoadTest!2026';
const PREFIX = process.env.EMAIL_PREFIX || 'loadtest';
const DOMAIN = process.env.EMAIL_DOMAIN || 'example.com';
const INSTITUTE_ID = process.env.INSTITUTE_ID;

if (!URL || !SERVICE) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const admin = (path, init = {}) =>
  fetch(`${URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

const email = (i) => `${PREFIX}+${i}@${DOMAIN}`;

async function listTestUsers() {
  // GoTrue admin list is paginated; page through and filter by our prefix.
  const found = [];
  for (let page = 1; page <= 50; page++) {
    const res = await admin(`/auth/v1/admin/users?page=${page}&per_page=200`);
    if (!res.ok) break;
    const body = await res.json();
    const users = body.users ?? [];
    if (users.length === 0) break;
    for (const u of users) {
      if (typeof u.email === 'string' && u.email.startsWith(`${PREFIX}+`) && u.email.endsWith(`@${DOMAIN}`)) {
        found.push(u);
      }
    }
    if (users.length < 200) break;
  }
  return found;
}

async function create() {
  if (!INSTITUTE_ID) {
    console.error('Set INSTITUTE_ID to an institute that has active canteens + menu items.');
    process.exit(1);
  }
  let ok = 0;
  for (let i = 0; i < COUNT; i++) {
    const addr = email(i);
    // 1) Create a confirmed auth user (idempotent-ish: ignore "already registered").
    const res = await admin('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email: addr, password: PASSWORD, email_confirm: true }),
    });
    let userId;
    if (res.ok) {
      userId = (await res.json()).id;
    } else {
      const txt = await res.text();
      if (!/already been registered|already exists/i.test(txt)) {
        console.error(`create ${addr} failed: ${res.status} ${txt}`);
        continue;
      }
      // Already exists — look up the id.
      const existing = (await listTestUsers()).find((u) => u.email === addr);
      userId = existing?.id;
    }
    if (!userId) continue;

    // 2) Upsert the public.users profile row (role=student, in the target institute)
    //    so the app + RLS treat them as a normal student.
    const up = await admin('/rest/v1/users?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        id: userId,
        email: addr,
        role: 'student',
        institute_id: INSTITUTE_ID,
        is_active: true,
      }),
    });
    if (!up.ok && up.status !== 409) {
      console.error(`profile upsert ${addr} failed: ${up.status} ${await up.text()}`);
      continue;
    }
    ok++;
    if (ok % 25 === 0) console.log(`  ...${ok}/${COUNT}`);
  }
  console.log(`Seeded ${ok}/${COUNT} test students in institute ${INSTITUTE_ID}.`);
}

async function cleanup() {
  const users = await listTestUsers();
  let del = 0;
  for (const u of users) {
    const res = await admin(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' });
    if (res.ok) del++;
    else console.error(`delete ${u.email} failed: ${res.status}`);
  }
  console.log(`Deleted ${del}/${users.length} loadtest accounts.`);
}

const cmd = process.argv[2];
if (cmd === 'create') await create();
else if (cmd === 'cleanup') await cleanup();
else {
  console.log('Usage: node loadtest/seed-users.mjs <create|cleanup>');
  process.exit(1);
}
