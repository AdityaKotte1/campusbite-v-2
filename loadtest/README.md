# MunchAdda load testing

Goal: gain confidence the student app + kiosk survive a campus-scale burst
(500–600 students) — and find exactly where they break first.

> **Verdict up front:** on **Supabase Free + Vercel Hobby**, you will hit hard
> platform ceilings *well below* 600 concurrent — most importantly Supabase
> Free's **~200 concurrent Realtime connections**. These tests are designed to
> *prove where the wall is* so you can size an upgrade (Supabase Pro + compute
> add-on, Vercel Pro). Do not expect Free to serve 600 concurrent students.

## ⚠️ You are testing PRODUCTION. Read this first.
- **Run off-hours** (e.g. 3 AM) when no real students are on.
- Every script **auto-aborts at 5% error rate** to protect real users. Don't remove that threshold.
- These tests are **read / auth / Realtime only** — they never place orders or
  touch Razorpay, so no real data or payments are affected.
- Use **dedicated test accounts** with a distinct email prefix so cleanup is one command.
- Watch the **Supabase dashboard** (Database → CPU/RAM, Realtime → connections,
  Auth → rate limits, Reports → egress) the entire time.

## Prerequisites
- [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) installed (`winget install k6` / `brew install k6`).
- Node 18+ (for the seed script).
- Your Supabase URL, anon key, and **service-role key** (from `apps/student-app/.env.local`).

## Environment
Create `loadtest/.env` (or export these) — never commit real keys:

```
SUPABASE_URL=https://apvtshlkhekwrwswhdze.supabase.co
SUPABASE_ANON_KEY=<NEXT_PUBLIC_SUPABASE_ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<service role key>   # seed script only
USER_COUNT=50
TEST_PASSWORD=LoadTest!2026
EMAIL_PREFIX=loadtest
EMAIL_DOMAIN=example.com
INSTITUTE_ID=1d3fd388-1fda-4495-aa1d-95c8761ed596   # an institute with active canteens/menu
```

## Step 1 — Seed test users (once)
Creates `USER_COUNT` confirmed student accounts (`loadtest+0@…`, `loadtest+1@…`, …)
in the target institute. These are the only accounts the tests log in as.

```bash
node loadtest/seed-users.mjs create
# ... run your tests ...
node loadtest/seed-users.mjs cleanup   # deletes every loadtest+*@… account
```

## Step 2 — Student backend load (the main test)
Measures the ceiling that actually limits you on Free: **Auth (GoTrue) + Postgres
reads** (canteens, menus, order-status polling) under a ramp to 600 virtual users.
It hits Supabase directly with real per-user JWTs — the same queries your API runs
under the hood — so it can't silently mis-authenticate and give false-green results.

```bash
k6 run --env SUPABASE_URL=$SUPABASE_URL --env SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY \
       --env USER_COUNT=$USER_COUNT --env TEST_PASSWORD=$TEST_PASSWORD \
       --env EMAIL_PREFIX=$EMAIL_PREFIX --env EMAIL_DOMAIN=$EMAIL_DOMAIN \
       loadtest/student-load.js
```

Read the ramp output: find the VU level where `read_latency p(95)` climbs past
~1.5s or `http_req_failed` starts rising. That's your knee.

## Step 3 — Realtime connection cap (the Free-tier wall)
Opens concurrent Realtime websockets and holds them, ramping past 200. On Free you
should see connections start failing around the cap — confirming the limit and the
number of *simultaneously-active-order* students you can support before live status
updates degrade (your polling fallback should take over — verify it does).

```bash
k6 run --env SUPABASE_URL=$SUPABASE_URL --env SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY \
       loadtest/realtime-probe.js
```

## Step 4 — Kiosk scan throughput
Exercises the HMAC-authenticated `/api/v1/kiosk/scan` path (auth verify + DB lookup
+ per-kiosk rate limit). Needs a **test kiosk**: register one in the admin app and
paste its one-time API key. Tokens are fake, so scans return "not found" — that's
fine; we're loading the auth + lookup path, not collecting real orders.

```bash
k6 run --env APP_URL=https://<admin-app-domain> \
       --env KIOSK_ID=<kiosk uuid> --env KIOSK_API_KEY=<plaintext api key> \
       loadtest/kiosk-scan.js
```
Note: each kiosk is rate-limited to **120 scans/min** (2/s) by design, so a single
kiosk caps there. To test many lanes, register several test kiosks and run one k6
instance per kiosk id.

## Interpreting results → what to do
| Symptom in the test | Meaning | Fix |
|---|---|---|
| Realtime conns fail ~200 | Free Realtime cap | Upgrade Supabase (Pro raises this); verify polling fallback covers the gap |
| DB CPU pinned at 100% in dashboard | Shared micro Postgres saturated | Supabase Pro + compute add-on |
| `read_latency` p95 climbs with VUs | Postgres/PostgREST throughput | Add DB indexes for the hot queries; upgrade compute |
| GoTrue 429s on login burst | Supabase auth rate limit (per-IP) | Raise auth limits with Supabase; stagger logins |
| Egress spikes in Reports | 5 GB/mo Free cap | Upgrade; cache/optimize image payloads |

## What these tests deliberately DON'T cover
- **Order placement + payment** (writes + live Razorpay). Test that only in a
  **staging** Supabase project with Razorpay **test** keys — never against prod.
- The authenticated Next.js API routes end-to-end (they use cookie sessions). This
  suite tests the Supabase layer directly, which is your true ceiling on Free. To
  test the Vercel/Next layer under auth, capture a logged-in `sb-…-auth-token`
  cookie from your browser and replay it (single-user, expires hourly).
