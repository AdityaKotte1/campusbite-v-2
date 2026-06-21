import { createHash, createHmac, timingSafeEqual } from 'crypto';

interface VerifyKioskHmacParams {
  method: string;
  path: string;
  timestamp: string;
  body: string;
  signature: string;
  apiKey: string;
}

/**
 * Verify HMAC signature for kiosk requests.
 *
 * Payload format:
 *   METHOD\n/path\n{timestamp}\n{sha256(body)}
 */
export async function verifyKioskHmac({
  method,
  path,
  timestamp,
  body,
  signature,
  apiKey,
}: VerifyKioskHmacParams): Promise<boolean> {
  try {
    const bodyHash = createHash('sha256').update(body, 'utf8').digest('hex');
    const payload = `${method.toUpperCase()}\n${path}\n${timestamp}\n${bodyHash}`;

    const expected = createHmac('sha256', apiKey)
      .update(payload, 'utf8')
      .digest('hex');

    const expectedBuf = Buffer.from(expected, 'hex');
    const signatureBuf = Buffer.from(signature, 'hex');

    if (expectedBuf.length !== signatureBuf.length) {
      return false;
    }

    return timingSafeEqual(expectedBuf, signatureBuf);
  } catch {
    return false;
  }
}

/**
 * Check if a request timestamp is within the replay window.
 *
 * The window is intentionally tight (30 seconds) to limit how long a captured,
 * correctly-signed request can be replayed.
 *
 * TODO (production hardening): a timestamp window alone is not a true replay
 * guard — a captured request can still be replayed within the window. Add a
 * per-request nonce that is recorded and rejected on reuse, backed by a SHARED
 * store (e.g. Upstash/Redis). The current rate limiter in `rate-limit.ts` is
 * in-memory per serverless instance, so it cannot enforce a cross-instance
 * nonce/replay guard on its own.
 */
const REPLAY_WINDOW_SECONDS = 30;

export function isTimestampValid(timestamp: string): boolean {
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - ts) <= REPLAY_WINDOW_SECONDS;
}
