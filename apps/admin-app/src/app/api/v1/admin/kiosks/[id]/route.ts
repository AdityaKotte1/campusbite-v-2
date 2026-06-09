import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
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

  const [kioskResult, scansResult] = await Promise.all([
    service
      .from('kiosks')
      .select('id, name, canteen_id, location, device_id, is_active, last_heartbeat, heartbeat_data, firmware_version, created_at, updated_at, canteens(id, name)')
      .eq('id', params.id)
      .single(),
    service
      .from('kiosk_scans')
      .select('*')
      .eq('kiosk_id', params.id)
      .order('scanned_at', { ascending: false })
      .limit(100),
  ]);

  if (kioskResult.error || !kioskResult.data) {
    return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Kiosk not found' } }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    data: {
      ...kioskResult.data,
      scans: scansResult.data ?? [],
    },
  });
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });

  const body = await request.json();
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

  const { error } = await service
    .from('kiosks')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', params.id);

  if (error) return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });

  await service.from('audit_logs').insert({
    user_id: user.id,
    action: 'kiosk.deactivate',
    entity_type: 'kiosk',
    entity_id: params.id,
    metadata: {},
  });

  return NextResponse.json({ success: true });
}
