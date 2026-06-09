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
    .select('id, api_key_encrypted, is_active')
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
  const results: Array<{ token: string; status: 'synced' | 'conflict' | 'error'; error?: string }> = [];

  for (const scan of scans) {
    try {
      const { data: rpcData, error: rpcError } = await service.rpc('validate_and_use_qr_token', {
        p_token: scan.token,
        p_kiosk_id: kioskId,
        p_metadata: { offline: true, scanned_at_local: scan.scanned_at_local },
      });

      if (rpcError) {
        results.push({ token: scan.token, status: 'error', error: rpcError.message });
      } else {
        const result = rpcData as { success: boolean; error?: string };
        if (result.success) {
          results.push({ token: scan.token, status: 'synced' });

          // Log scan
          await service.from('kiosk_scans').insert({
            kiosk_id: kioskId,
            token: scan.token,
            scanned_at: scan.scanned_at_local,
            result: 'success',
            failure_reason: null,
          });
        } else {
          results.push({ token: scan.token, status: 'conflict', error: result.error });

          await service.from('kiosk_scans').insert({
            kiosk_id: kioskId,
            token: scan.token,
            scanned_at: scan.scanned_at_local,
            result: result.error?.includes('already') ? 'already_used' : 'failure',
            failure_reason: result.error,
          });
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
