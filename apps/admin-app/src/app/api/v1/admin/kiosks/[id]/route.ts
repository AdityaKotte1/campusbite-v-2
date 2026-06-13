import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import {
  requireAdmin,
  allowedCanteenIds,
  canAccessCanteen,
  forbidden,
  notFound,
} from '@/lib/auth';

/**
 * Load the kiosk's canteen_id and verify the caller may act on it.
 * Returns `{ canteenId }` on success or `{ response }` (404/403) to return.
 */
async function requireKioskAccess(
  service: ReturnType<typeof createServiceClient>,
  kioskId: string,
  profile: Parameters<typeof allowedCanteenIds>[0]
): Promise<{ canteenId: string; response?: undefined } | { canteenId?: undefined; response: NextResponse }> {
  const { data: kiosk } = await service
    .from('kiosks')
    .select('canteen_id')
    .eq('id', kioskId)
    .single();

  if (!kiosk) return { response: notFound('Kiosk not found') };

  const allowed = await allowedCanteenIds(profile);
  if (!canAccessCanteen(kiosk.canteen_id, allowed)) {
    return { response: forbidden('This kiosk does not belong to your institute') };
  }

  return { canteenId: kiosk.canteen_id };
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const { profile, response } = await requireAdmin(['super_admin', 'canteen_admin']);
  if (response) return response;

  const service = createServiceClient();

  const access = await requireKioskAccess(service, params.id, profile);
  if (access.response) return access.response;

  const [kioskResult, scansResult] = await Promise.all([
    service
      .from('kiosks')
      .select('id, name, canteen_id, location, device_id, is_active, last_heartbeat, heartbeat_data, firmware_version, created_at, updated_at, canteens(id, name)')
      .eq('id', params.id)
      .single(),
    service
      .from('kiosk_scans')
      .select('id, kiosk_id, raw_token_value, scan_result, scanned_at, offline_scan, qr_token_id, qr_tokens(order_id)')
      .eq('kiosk_id', params.id)
      .order('scanned_at', { ascending: false })
      .limit(100),
  ]);

  if (kioskResult.error || !kioskResult.data) {
    return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Kiosk not found' } }, { status: 404 });
  }

  // Map DB columns (raw_token_value/scan_result/qr_token_id) to the shape the
  // KioskScan type and detail page expect (token/result/order_id).
  const scans = (scansResult.data ?? []).map((s: Record<string, unknown>) => ({
    id: s.id,
    kiosk_id: s.kiosk_id,
    token: (s.raw_token_value as string | null) ?? '',
    order_id: (s.qr_tokens as { order_id: string } | null)?.order_id ?? null,
    result: s.scan_result,
    offline_scan: s.offline_scan,
    scanned_at: s.scanned_at,
  }));

  return NextResponse.json({
    success: true,
    data: {
      ...kioskResult.data,
      scans,
    },
  });
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const { profile, response } = await requireAdmin(['super_admin', 'canteen_admin']);
  if (response) return response;

  const service = createServiceClient();

  const access = await requireKioskAccess(service, params.id, profile);
  if (access.response) return access.response;

  const body = await request.json();

  const allowedFields = ['name', 'location', 'is_active'];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowedFields) {
    if (key in body) updates[key] = body[key];
  }

  const { data, error } = await service
    .from('kiosks')
    .update(updates)
    .eq('id', params.id)
    .select('id, name, canteen_id, location, device_id, is_active, updated_at')
    .single();

  if (error) return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });
  return NextResponse.json({ success: true, data });
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const { profile, response } = await requireAdmin(['super_admin', 'canteen_admin']);
  if (response) return response;

  const service = createServiceClient();

  const access = await requireKioskAccess(service, params.id, profile);
  if (access.response) return access.response;

  const { error } = await service
    .from('kiosks')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', params.id);

  if (error) return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });

  await service.from('audit_logs').insert({
    user_id: profile.id,
    action: 'kiosk.deactivate',
    entity_type: 'kiosk',
    entity_id: params.id,
    metadata: {},
  });

  return NextResponse.json({ success: true });
}
