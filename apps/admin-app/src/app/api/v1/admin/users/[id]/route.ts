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

  const { data, error } = await service.from('users').select('*').eq('id', params.id).single();
  if (error || !data) return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } }, { status: 404 });
  return NextResponse.json({ success: true, data });
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

  // Only allow updating safe fields
  const allowedFields = ['role', 'is_active', 'full_name', 'assigned_canteen_id', 'institute_id'];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowedFields) {
    if (key in body) updates[key] = body[key];
  }

  const { data, error } = await service
    .from('users')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });

  // Audit log
  await service.from('audit_logs').insert({
    user_id: user.id,
    action: 'user.update',
    entity_type: 'user',
    entity_id: params.id,
    metadata: { fields: Object.keys(updates) },
  });

  return NextResponse.json({ success: true, data });
}
