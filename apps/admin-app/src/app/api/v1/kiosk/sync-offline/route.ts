import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyKioskHmac, isTimestampValid } from '@/lib/kiosk-auth';
import { decryptApiKey } from '@/lib/encryption';

interface OfflineScan {
  token: string;
  scanned_at_local: string;
  kiosk_order_data?: Record<string, unknown>;
}

/**
 * POST /api/v1/kiosk/sync-offline
 * Body: { scans: OfflineScan[] }
 *
 * Processes each offline scan atomically. Returns results per scan.
 */
export async function POST(request: NextRequest) {
  const kioskId = request.headers.get('X-Kiosk-ID');
  const timestamp = request.headers.get('X-Kiosk-Timestamp');
  const signature = request.headers.get('X-Kiosk-Signature');

  if (!kioskId || !timestamp || !signature) {
    return NextResponse.json(
      { success: false, error: { code: 'MISSING_AUTH_HEADERS', message: 'Missing authentication headers' } },
      { status: 401 }
    );
  }

  if (!isTimestampValid(timestamp)) {
    return NextResponse.json(
      { success: false, error: { code: 'TIMESTAMP_INVALID', message: 'Timestamp out of valid window' } },
      { status: 401 }
    );
  }

  const rawBody = await request.text();
  let body: { scans: OfflineScan[] };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_BODY', message: 'Invalid JSON body' } },
      { status: 400 }
    );
  }

  const service = createServiceClient();

  const { data: kiosk } = await service
    .from('kiosks')
    .select('id, canteen_id, api_key_encrypted, is_active')
    .eq('id', kioskId)
    .single();

  if (!kiosk?.is_active) {
    return NextResponse.json(
      { success: false, error: { code: 'KIOSK_NOT_FOUND', message: 'Kiosk not found or inactive' } },
      { status: 401 }
    );
  }

  let apiKey: string;
  try {
    apiKey = await decryptApiKey(kiosk.api_key_encrypted);
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'AUTH_ERROR', message: 'Authentication error' } },
      { status: 500 }
    );
  }

  const hmacValid = await verifyKioskHmac({
    method: 'POST',
    path: '/api/v1/kiosk/sync-offline',
    timestamp,
    body: rawBody,
    signature,
    apiKey,
  });

  if (!hmacValid) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_SIGNATURE', message: 'HMAC verification failed' } },
      { status: 401 }
    );
  }

  const scans = body.scans ?? [];

  // Bound the work per request — reject oversized batches.
  const MAX_OFFLINE_BATCH = 200;
  if (scans.length > MAX_OFFLINE_BATCH) {
    return NextResponse.json(
      { success: false, error: { code: 'BATCH_TOO_LARGE', message: `scans exceeds max batch of ${MAX_OFFLINE_BATCH}` } },
      { status: 400 }
    );
  }

  const results: Array<{ token: string; status: 'synced' | 'conflict' | 'error'; error?: string }> = [];

  for (const scan of scans) {
    try {
      // Defense-in-depth: the token's order must belong to THIS kiosk's canteen.
      // Reject cross-canteen tokens without ever marking them collected.
      const { data: tokenRow } = await service
        .from('qr_tokens')
        .select('order_id, orders!inner(canteen_id)')
        .eq('token', scan.token)
        .maybeSingle();

      if (tokenRow) {
        const order = tokenRow.orders as unknown as { canteen_id: string };
        if (order?.canteen_id && order.canteen_id !== kiosk.canteen_id) {
          results.push({ token: scan.token, status: 'error', error: 'WRONG_CANTEEN' });
          continue;
        }
      }

      // The RPC is the source of truth and logs kiosk_scans internally — do NOT
      // double-insert here.
      const { data: rpcData, error: rpcError } = await service.rpc('validate_and_use_qr_token', {
        p_token: scan.token,
        p_kiosk_id: kioskId,
        p_kiosk_meta: { offline: true, scanned_at_local: scan.scanned_at_local },
      });

      if (rpcError) {
        results.push({ token: scan.token, status: 'error', error: rpcError.message });
      } else {
        const result = rpcData as { success: boolean; error_code?: string; message?: string };
        if (result.success) {
          results.push({ token: scan.token, status: 'synced' });
        } else {
          results.push({ token: scan.token, status: 'conflict', error: result.message ?? result.error_code });
        }
      }
    } catch (err) {
      results.push({ token: scan.token, status: 'error', error: String(err) });
    }
  }

  // Update kiosk heartbeat
  await service
    .from('kiosks')
    .update({ last_heartbeat: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', kioskId);

  const synced = results.filter((r) => r.status === 'synced').length;
  const conflicts = results.filter((r) => r.status === 'conflict').length;

  return NextResponse.json({
    success: true,
    data: {
      total: scans.length,
      synced,
      conflicts,
      errors: results.filter((r) => r.status === 'error').length,
      results,
    },
  });
}
