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
 * Check if timestamp is within the replay window (300 seconds).
 */
export function isTimestampValid(timestamp: string): boolean {
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - ts) <= 30; // 30-second window
}
