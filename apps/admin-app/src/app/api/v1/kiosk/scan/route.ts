import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { decryptApiKey } from '@/lib/encryption';
import { verifyKioskHmac, isTimestampValid } from '@/lib/kiosk-auth';
import { kioskScanLimiter } from '@/lib/rate-limit';

/**
 * POST /api/v1/kiosk/scan
 *
 * Auth headers:
 *   X-Kiosk-ID        – kiosk UUID
 *   X-Kiosk-Timestamp – Unix epoch seconds (string)
 *   X-Kiosk-Signature – HMAC-SHA256 hex
 *
 * Body: { token: string, firmware_version?: string }
 *
 * HMAC payload: METHOD\n/path\n{timestamp}\n{sha256(body)}
 */
export async function POST(request: NextRequest) {
  // ─── 1. Extract auth headers ────────────────────────────────────────────────
  const kioskId = request.headers.get('X-Kiosk-ID');
  const timestamp = request.headers.get('X-Kiosk-Timestamp');
  const signature = request.headers.get('X-Kiosk-Signature');

  if (!kioskId || !timestamp || !signature) {
    return NextResponse.json(
      { success: false, error: { code: 'MISSING_AUTH_HEADERS', message: 'Missing kiosk authentication headers' } },
      { status: 401 }
    );
  }

  // ─── 2. Validate timestamp (replay prevention) ───────────────────────────────
  if (!isTimestampValid(timestamp)) {
    return NextResponse.json(
      { success: false, error: { code: 'TIMESTAMP_INVALID', message: 'Request timestamp is outside the valid window' } },
      { status: 401 }
    );
  }

  // ─── 3. Read body (we need raw bytes for HMAC verification) ─────────────────
  const rawBody = await request.text();
  let body: { token?: string; firmware_version?: string };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_BODY', message: 'Invalid JSON body' } },
      { status: 400 }
    );
  }

  const service = createServiceClient();

  // ─── 4. Fetch kiosk from DB ──────────────────────────────────────────────────
  const { data: kiosk, error: kioskError } = await service
    .from('kiosks')
    .select('id, canteen_id, api_key_encrypted, is_active')
    .eq('id', kioskId)
    .single();

  if (kioskError || !kiosk) {
    return NextResponse.json(
      { success: false, error: { code: 'KIOSK_NOT_FOUND', message: 'Kiosk not found' } },
      { status: 401 }
    );
  }

  if (!kiosk.is_active) {
    return NextResponse.json(
      { success: false, error: { code: 'KIOSK_INACTIVE', message: 'Kiosk is deactivated' } },
      { status: 401 }
    );
  }

  // ─── 5. Decrypt stored API key ───────────────────────────────────────────────
  let apiKey: string;
  try {
    apiKey = await decryptApiKey(kiosk.api_key_encrypted);
  } catch (err) {
    console.error('[kiosk/scan] decryption failed', err);
    return NextResponse.json(
      { success: false, error: { code: 'AUTH_ERROR', message: 'Authentication error' } },
      { status: 500 }
    );
  }

  // ─── 6. Verify HMAC ──────────────────────────────────────────────────────────
  const path = '/api/v1/kiosk/scan';
  const hmacValid = await verifyKioskHmac({
    method: 'POST',
    path,
    timestamp,
    body: rawBody,
    signature,
    apiKey,
  });

  if (!hmacValid) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_SIGNATURE', message: 'HMAC signature verification failed' } },
      { status: 401 }
    );
  }

  // ─── 6b. Rate limit per kiosk ───────────────────────────────────────────────
  const scanLimit = await kioskScanLimiter(kioskId);
  if (!scanLimit.allowed) {
    return NextResponse.json(
      { success: false, error: { code: 'RATE_LIMITED', message: 'Scan rate limit exceeded' } },
      { status: 429 }
    );
  }

  // ─── 7. Validate token field ─────────────────────────────────────────────────
  const { token, firmware_version } = body;
  if (!token || typeof token !== 'string') {
    return NextResponse.json(
      { success: false, error: { code: 'MISSING_TOKEN', message: 'token is required' } },
      { status: 400 }
    );
  }

  // Defense-in-depth: the QR scheme is munchadda://qr/{uuid}, so a valid token is
  // ALWAYS a UUID. Reject anything else BEFORE it reaches the DB. The kiosk app
  // already validates this, but the endpoint must not trust the client — anyone
  // holding kiosk HMAC creds (or a tampered scanner) could POST an arbitrary
  // string. The RPC is parameterised (no SQL injection), but this bounds input
  // length and rejects injected/garbage payloads early.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(token)) {
    return NextResponse.json(
      { success: false, error_code: 'INVALID_TOKEN', message: 'Malformed QR token' },
      { status: 400 }
    );
  }

  // firmware_version is attacker-controllable and gets persisted — keep it sane.
  const safeFirmware =
    typeof firmware_version === 'string' && firmware_version.length <= 40
      ? firmware_version
      : null;

  // ─── 7b. Defense-in-depth: token's order must belong to THIS kiosk's canteen ─
  // Prevents kiosk A from redeeming canteen B's order QR even if the DB RPC
  // check were bypassed. We never mark a cross-canteen token collected.
  const { data: tokenRow } = await service
    .from('qr_tokens')
    .select('order_id, orders!inner(canteen_id)')
    .eq('token', token)
    .maybeSingle();

  if (tokenRow) {
    const order = tokenRow.orders as unknown as { canteen_id: string };
    if (order?.canteen_id && order.canteen_id !== kiosk.canteen_id) {
      return NextResponse.json(
        { success: false, error_code: 'WRONG_CANTEEN', message: 'This order belongs to a different canteen' },
        { status: 403 }
      );
    }
  }

  // ─── 8. Call Supabase RPC to atomically validate and use the QR token ───────
  // The RPC handles kiosk_scans insertion internally and returns a full receipt JSON.
  type RpcSuccess = {
    success: true;
    token_number: number;
    order_number: string;
    canteen_name: string;
    student_name: string;
    items: { name: string; quantity: number; unit_price_paise: number; total_price_paise: number }[];
    subtotal_paise: number;
    tax_paise: number;
    discount_paise: number;
    total_paise: number;
    collected_at: string;
  };
  type RpcFailure = { success: false; error_code: string; message: string };
  type RpcResult = RpcSuccess | RpcFailure;

  let rpcResult: RpcResult;
  try {
    const { data: rpcData, error: rpcError } = await service.rpc('validate_and_use_qr_token', {
      p_token: token,
      p_kiosk_id: kioskId,
      p_kiosk_meta: { firmware_version: safeFirmware },
    });

    if (rpcError) {
      rpcResult = { success: false, error_code: 'RPC_ERROR', message: rpcError.message };
    } else {
      rpcResult = rpcData as RpcResult;
    }
  } catch (err) {
    console.error('[kiosk/scan] rpc error', err);
    rpcResult = { success: false, error_code: 'RPC_ERROR', message: 'RPC call failed' };
  }

  // ─── 9. Update kiosk last_scan timestamp ────────────────────────────────────
  await service
    .from('kiosks')
    .update({
      last_heartbeat: new Date().toISOString(),
      ...(safeFirmware ? { firmware_version: safeFirmware } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', kioskId);

  // ─── 10. Return response ─────────────────────────────────────────────────────
  // Pass the RPC result through directly — it already has the right shape for
  // both the Python kiosk client (receipt fields on success, error_code on failure).
  if (!rpcResult.success) {
    return NextResponse.json(rpcResult, { status: 400 });
  }

  return NextResponse.json(rpcResult);
}
