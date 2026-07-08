// Student backend load test — Auth (GoTrue) + Postgres reads under a ramp to 600 VUs.
//
// Hits Supabase directly with real per-user JWTs, running the same queries the
// student API runs under the hood (canteens list, a canteen's menu, active-order
// polling). On Supabase Free, this backend layer IS your ceiling, so this is the
// test that matters. It CANNOT silently run unauthenticated (setup() fails loudly
// if the test users can't log in).
//
// SAFETY: read-only. Auto-aborts at 5% error rate to protect production.
//
//   k6 run --env SUPABASE_URL=... --env SUPABASE_ANON_KEY=... \
//          --env USER_COUNT=50 --env TEST_PASSWORD=... \
//          --env EMAIL_PREFIX=loadtest --env EMAIL_DOMAIN=example.com \
//          loadtest/student-load.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const SUPABASE_URL = __ENV.SUPABASE_URL;
const ANON = __ENV.SUPABASE_ANON_KEY;
const USER_COUNT = parseInt(__ENV.USER_COUNT || '50', 10);
const PASSWORD = __ENV.TEST_PASSWORD || 'LoadTest!2026';
const PREFIX = __ENV.EMAIL_PREFIX || 'loadtest';
const DOMAIN = __ENV.EMAIL_DOMAIN || 'example.com';

const readLatency = new Trend('read_latency', true);
const errorRate = new Rate('errors');

export const options = {
  scenarios: {
    ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      // Hold at each step so you can watch the Supabase dashboard settle before
      // the next jump. Lower the final targets if you only want to probe partway.
      stages: [
        { duration: '1m', target: 50 },
        { duration: '2m', target: 50 },
        { duration: '1m', target: 150 },
        { duration: '2m', target: 150 },
        { duration: '1m', target: 300 },
        { duration: '2m', target: 300 },
        { duration: '1m', target: 600 },
        { duration: '3m', target: 600 },
        { duration: '1m', target: 0 },
      ],
      gracefulStop: '10s',
    },
  },
  thresholds: {
    // ABORT the whole run if the backend starts failing — protects real users on prod.
    http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '20s' }],
    errors: ['rate<0.05'],
    read_latency: ['p(95)<1500'],
  },
};

// Log in every test user once. Runs on a single VU before the ramp.
export function setup() {
  if (!SUPABASE_URL || !ANON) throw new Error('Set SUPABASE_URL and SUPABASE_ANON_KEY.');
  const tokens = [];
  for (let i = 0; i < USER_COUNT; i++) {
    const res = http.post(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      JSON.stringify({ email: `${PREFIX}+${i}@${DOMAIN}`, password: PASSWORD }),
      { headers: { apikey: ANON, 'Content-Type': 'application/json' }, tags: { name: 'auth_login' } }
    );
    if (res.status === 200 && res.json('access_token')) tokens.push(res.json('access_token'));
    else console.error(`login failed for ${PREFIX}+${i}@${DOMAIN}: ${res.status} ${res.body}`);
  }
  if (tokens.length === 0) {
    throw new Error('No test users could log in. Run `node loadtest/seed-users.mjs create` and check env vars.');
  }
  console.log(`Authenticated ${tokens.length}/${USER_COUNT} test users.`);
  return { tokens };
}

function authHeaders(token) {
  return { apikey: ANON, Authorization: `Bearer ${token}` };
}

export default function (data) {
  const token = data.tokens[Math.floor(Math.random() * data.tokens.length)];
  const h = { headers: authHeaders(token) };

  // 1) Browse canteens (mirrors the app's canteens query, incl. the billing_state gate).
  let r = http.get(
    `${SUPABASE_URL}/rest/v1/canteens?select=id,name,is_open&is_active=eq.true&billing_state=eq.active&order=name&limit=20`,
    { ...h, tags: { name: 'canteens_list' } }
  );
  readLatency.add(r.timings.duration);
  errorRate.add(r.status !== 200);
  check(r, { 'canteens 200': (x) => x.status === 200 });
  const canteens = r.status === 200 ? r.json() : [];

  sleep(Math.random() * 2 + 1); // think time

  // 2) Open a random canteen's menu.
  if (Array.isArray(canteens) && canteens.length) {
    const c = canteens[Math.floor(Math.random() * canteens.length)];
    r = http.get(
      `${SUPABASE_URL}/rest/v1/menu_items?select=id,name,price_paise,is_available&canteen_id=eq.${c.id}&is_available=eq.true&limit=50`,
      { ...h, tags: { name: 'menu_items' } }
    );
    readLatency.add(r.timings.duration);
    errorRate.add(r.status !== 200);
    check(r, { 'menu 200': (x) => x.status === 200 });
    sleep(Math.random() * 3 + 1);
  }

  // 3) Poll own active orders (mirrors the 30s active-order status poll).
  r = http.get(
    `${SUPABASE_URL}/rest/v1/orders?select=id,status,order_number&status=in.(confirmed,preparing,ready)&order=created_at.desc&limit=5`,
    { ...h, tags: { name: 'orders_poll' } }
  );
  readLatency.add(r.timings.duration);
  errorRate.add(r.status !== 200);
  check(r, { 'orders 200': (x) => x.status === 200 });

  sleep(Math.random() * 5 + 2); // between browse cycles
}
