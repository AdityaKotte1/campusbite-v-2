import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { encryptApiKey } from '@/lib/encryption';

export async function GET(_: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });

  const service = createServiceClient();

  // Verify admin role
  const { data: profile, error: profileError } = await service
    .from('users')
    .select('role, is_active')
    .eq('id', user.id)
    .single();

  const ADMIN_ROLES = ['super_admin', 'canteen_admin', 'staff'];
  if (profileError || !profile || !ADMIN_ROLES.includes(profile.role) || !profile.is_active) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } },
      { status: 403 }
    );
  }
  const { data, error } = await service
    .from('kiosks')
    .select('*, canteens(id, name, location)')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });

  // Strip encrypted api_key from response
  const sanitized = (data ?? []).map(({ api_key_encrypted: _, ...kiosk }) => kiosk);

  return NextResponse.json({ success: true, data: sanitized });
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });

  {
    const service = createServiceClient();
    const { data: profile, error: profileError } = await service
      .from('users')
      .select('role, is_active')
      .eq('id', user.id)
      .single();

    const ADMIN_ROLES = ['super_admin', 'canteen_admin', 'staff'];
    if (profileError || !profile || !ADMIN_ROLES.includes(profile.role) || !profile.is_active) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } },
        { status: 403 }
      );
    }
  }

  const body = await request.json();
  const { name, canteen_id, location, device_id } = body;

  if (!name || !canteen_id || !device_id) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_INPUT', message: 'name, canteen_id and device_id are required' } },
      { status: 400 }
    );
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
    user_id: user.id,
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
