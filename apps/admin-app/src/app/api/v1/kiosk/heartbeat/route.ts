import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyKioskHmac, isTimestampValid } from '@/lib/kiosk-auth';
import { decryptApiKey } from '@/lib/encryption';

/**
 * POST /api/v1/kiosk/heartbeat
 *
 * Auth headers: X-Kiosk-ID, X-Kiosk-Timestamp, X-Kiosk-Signature
 * Body: { printer_status?: string, app_version?: string, stats?: Record<string, unknown> }
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
  let body: { printer_status?: string; app_version?: string; firmware_version?: string; stats?: Record<string, unknown> } = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    // Allow empty body
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
    path: '/api/v1/kiosk/heartbeat',
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

  const now = new Date().toISOString();
  const heartbeatData = {
    printer_status: body.printer_status ?? 'unknown',
    app_version: body.app_version ?? null,
    stats: body.stats ?? {},
    reported_at: now,
  };

  await service
    .from('kiosks')
    .update({
      last_heartbeat: now,
      heartbeat_data: heartbeatData,
      firmware_version: body.firmware_version ?? undefined,
      updated_at: now,
    })
    .eq('id', kioskId);

  return NextResponse.json({ success: true, data: { acknowledged_at: now } });
}
