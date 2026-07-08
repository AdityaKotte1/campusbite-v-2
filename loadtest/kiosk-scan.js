// Kiosk scan-throughput test.
//
// Exercises the HMAC-authenticated POST /api/v1/kiosk/scan path on the admin app:
// signature verify + kiosk lookup + token lookup + per-kiosk rate limit. Tokens
// are fake, so scans return "token not found" — that's expected; we're loading
// the auth + DB-lookup path, not collecting real orders.
//
// Needs a TEST kiosk: register one in the admin app and paste its one-time API key.
// Each kiosk is rate-limited to 120 scans/min (2/s) by design — a single kiosk
// caps there. To simulate a multi-lane canteen, register several test kiosks and
// run one k6 process per kiosk id.
//
//   k6 run --env APP_URL=https://<admin-domain> \
//          --env KIOSK_ID=<uuid> --env KIOSK_API_KEY=<plaintext key> \
//          loadtest/kiosk-scan.js

import http from 'k6/http';
import crypto from 'k6/crypto';
import { check } from 'k6';
import { Rate } from 'k6/metrics';

const APP_URL = __ENV.APP_URL;
const KIOSK_ID = __ENV.KIOSK_ID;
const KIOSK_API_KEY = __ENV.KIOSK_API_KEY;
const PATH = '/api/v1/kiosk/scan';

const rateLimited = new Rate('rate_limited_429');

export const options = {
  scenarios: {
    scan: {
      // Sustained ~2 scans/sec = the per-kiosk ceiling. Bump `rate` above 2 to
      // watch the 120/min limiter start returning 429 (expected, by design).
      executor: 'constant-arrival-rate',
      rate: 2,
      timeUnit: '1s',
      duration: '3m',
      preAllocatedVUs: 10,
      maxVUs: 30,
    },
  },
  thresholds: {
    // The endpoint should stay healthy: 401/500 are failures; 429 (rate limit) and
    // 404 (token not found) are EXPECTED and not counted as transport errors.
    http_req_failed: [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '20s' }],
  },
};

function signAndScan() {
  if (!APP_URL || !KIOSK_ID || !KIOSK_API_KEY) {
    throw new Error('Set APP_URL, KIOSK_ID and KIOSK_API_KEY.');
  }
  const body = JSON.stringify({ token: `LOADTEST-${Date.now()}-${Math.random().toString(36).slice(2)}` });
  const ts = Math.floor(Date.now() / 1000).toString();
  const bodyHash = crypto.sha256(body, 'hex');
  // HMAC payload: METHOD\n/path\n{timestamp}\n{sha256(body)}
  const payload = `POST\n${PATH}\n${ts}\n${bodyHash}`;
  const signature = crypto.hmac('sha256', KIOSK_API_KEY, payload, 'hex');

  return http.post(`${APP_URL}${PATH}`, body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Kiosk-ID': KIOSK_ID,
      'X-Kiosk-Timestamp': ts,
      'X-Kiosk-Signature': signature,
    },
    tags: { name: 'kiosk_scan' },
    // Treat 404 (fake token) and 429 (rate limit) as non-errors for http_req_failed.
    responseCallback: http.expectedStatuses(200, 400, 404, 409, 429),
  });
}

export default function () {
  const res = signAndScan();
  rateLimited.add(res.status === 429);
  check(res, {
    'not an auth failure (401)': (r) => r.status !== 401,
    'not a server error (5xx)': (r) => r.status < 500,
  });
}
