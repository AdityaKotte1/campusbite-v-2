import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';
import { encryptApiKey } from '@/lib/encryption';
import { requireAdmin, allowedCanteenIds, canAccessCanteen, forbidden, resolveCanteenScope } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const { profile, response } = await requireAdmin(['super_admin', 'canteen_admin']);
  if (response) return response;

  const service = createServiceClient();

  // Tenant scoping: super_admin (null) sees all; others only their canteens.
  // Optional institute_id / canteen_id narrow within the caller's scope.
  const { searchParams } = new URL(request.url);
  const scope = await resolveCanteenScope(profile, {
    instituteId: searchParams.get('institute_id'),
    canteenId: searchParams.get('canteen_id'),
  });

  let query = service
    .from('kiosks')
    .select('*, canteens(id, name, location)')
    .order('created_at', { ascending: false });

  // Restrict to in-scope canteens (never widens). `[]` → zero rows.
  if (scope !== null) {
    query = query.in('canteen_id', scope);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });

  // Strip encrypted api_key from response
  const sanitized = (data ?? []).map(({ api_key_encrypted: _, ...kiosk }) => kiosk);

  return NextResponse.json({ success: true, data: sanitized });
}

export async function POST(request: NextRequest) {
  const { profile, response } = await requireAdmin(['super_admin', 'canteen_admin']);
  if (response) return response;

  const body = await request.json();
  const { name, canteen_id, location, device_id } = body;

  if (!name || !canteen_id || !device_id) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_INPUT', message: 'name, canteen_id and device_id are required' } },
      { status: 400 }
    );
  }

  // Tenant scoping: caller may only register a kiosk for a canteen they own.
  const allowed = await allowedCanteenIds(profile);
  if (!canAccessCanteen(canteen_id, allowed)) {
    return forbidden('This canteen does not belong to your institute');
  }

  // Generate cryptographically secure API key (48 bytes = 96 hex chars)
  const plainApiKey = randomBytes(48).toString('hex');

  // Encrypt for storage
  const apiKeyEncrypted = await encryptApiKey(plainApiKey);

  const service = createServiceClient();
  const { data, error } = await service
    .from('kiosks')
    .insert({
      name,
      canteen_id,
      location: location ?? null,
      device_id,
      api_key_encrypted: apiKeyEncrypted,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id, name, canteen_id, location, device_id, is_active, created_at')
    .single();

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }

  // Audit log
  await service.from('audit_logs').insert({
    user_id: profile.id,
    action: 'kiosk.register',
    entity_type: 'kiosk',
    entity_id: data.id,
    metadata: { name, canteen_id, device_id },
  });

  // Return the plain API key ONCE — never stored in plain text
  return NextResponse.json({
    success: true,
    data: {
      kiosk_id: data.id,
      api_key: plainApiKey,
      kiosk: data,
    },
    message: 'Kiosk registered. Save the API key — it will not be shown again.',
  }, { status: 201 });
}
