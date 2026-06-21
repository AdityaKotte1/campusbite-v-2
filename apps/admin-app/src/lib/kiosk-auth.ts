import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { decryptApiKey } from '@/lib/encryption';

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

/** Authenticated kiosk context returned on success. */
export interface AuthenticatedKiosk {
  id: string;
  canteen_id: string;
}

/**
 * Result of `authenticateKiosk`. Either an authenticated kiosk plus the raw
 * request body (needed by POST handlers that want to parse JSON), or a
 * ready-to-return error `response`.
 */
export type AuthenticateKioskResult =
  | { kiosk: AuthenticatedKiosk; rawBody: string }
  | { response: NextResponse };

/**
 * Perform the full kiosk-HMAC authentication sequence shared by every kiosk
 * endpoint:
 *   1. read X-Kiosk-ID / X-Kiosk-Timestamp / X-Kiosk-Signature headers
 *   2. validate the timestamp (replay window)
 *   3. read the raw request body (needed verbatim for HMAC verification)
 *   4. fetch the kiosk row (id, canteen_id, api_key_encrypted, is_active)
 *   5. decrypt the stored API key
 *   6. verify the HMAC signature
 *
 * `path` MUST be the exact request path the kiosk client signed (including any
 * dynamic id segments), and `method` the HTTP method. On success returns the
 * `kiosk` (id + canteen_id) and the `rawBody`; on any failure returns a fully
 * formed `NextResponse` with the appropriate status (401, or 500 on a
 * decryption error) — never throws for the normal failure paths.
 */
export async function authenticateKiosk(
  request: NextRequest,
  path: string,
  method: string
): Promise<AuthenticateKioskResult> {
  // ─── 1. Extract auth headers ───────────────────────────────────────────────
  const kioskId = request.headers.get('X-Kiosk-ID');
  const timestamp = request.headers.get('X-Kiosk-Timestamp');
  const signature = request.headers.get('X-Kiosk-Signature');

  if (!kioskId || !timestamp || !signature) {
    return {
      response: NextResponse.json(
        { success: false, error: { code: 'MISSING_AUTH_HEADERS', message: 'Missing kiosk authentication headers' } },
        { status: 401 }
      ),
    };
  }

  // ─── 2. Validate timestamp (replay prevention) ─────────────────────────────
  if (!isTimestampValid(timestamp)) {
    return {
      response: NextResponse.json(
        { success: false, error: { code: 'TIMESTAMP_INVALID', message: 'Request timestamp is outside the valid window' } },
        { status: 401 }
      ),
    };
  }

  // ─── 3. Read raw body (verbatim bytes are required for HMAC verification) ───
  const rawBody = await request.text();

  const service = createServiceClient();

  // ─── 4. Fetch kiosk from DB ────────────────────────────────────────────────
  const { data: kiosk, error: kioskError } = await service
    .from('kiosks')
    .select('id, canteen_id, api_key_encrypted, is_active')
    .eq('id', kioskId)
    .single();

  if (kioskError || !kiosk) {
    return {
      response: NextResponse.json(
        { success: false, error: { code: 'KIOSK_NOT_FOUND', message: 'Kiosk not found' } },
        { status: 401 }
      ),
    };
  }

  if (!kiosk.is_active) {
    return {
      response: NextResponse.json(
        { success: false, error: { code: 'KIOSK_INACTIVE', message: 'Kiosk is deactivated' } },
        { status: 401 }
      ),
    };
  }

  // ─── 5. Decrypt stored API key ─────────────────────────────────────────────
  let apiKey: string;
  try {
    apiKey = await decryptApiKey(kiosk.api_key_encrypted);
  } catch (err) {
    console.error('[kiosk-auth] decryption failed', err);
    return {
      response: NextResponse.json(
        { success: false, error: { code: 'AUTH_ERROR', message: 'Authentication error' } },
        { status: 500 }
      ),
    };
  }

  // ─── 6. Verify HMAC ────────────────────────────────────────────────────────
  const hmacValid = await verifyKioskHmac({
    method,
    path,
    timestamp,
    body: rawBody,
    signature,
    apiKey,
  });

  if (!hmacValid) {
    return {
      response: NextResponse.json(
        { success: false, error: { code: 'INVALID_SIGNATURE', message: 'HMAC signature verification failed' } },
        { status: 401 }
      ),
    };
  }

  return { kiosk: { id: kiosk.id, canteen_id: kiosk.canteen_id }, rawBody };
}
