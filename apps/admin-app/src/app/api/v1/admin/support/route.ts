import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

const ADMIN_ROLES = ['super_admin', 'canteen_admin', 'staff'];

async function requireAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 }) };
  const service = createServiceClient();
  const { data: profile } = await service.from('users').select('role, is_active').eq('id', user.id).single();
  if (!profile || !ADMIN_ROLES.includes(profile.role) || !profile.is_active) {
    return { error: NextResponse.json({ success: false, error: { code: 'FORBIDDEN' } }, { status: 403 }) };
  }
  return { user, service };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { service } = auth;

  const status = new URL(request.url).searchParams.get('status');
  let q = service.from('support_tickets').select('*').order('created_at', { ascending: false }).limit(200);
  if (status) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });
  return NextResponse.json({ success: true, data: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;
  const { user, service } = auth;

  const body = await request.json();
  const { id, status, admin_response } = body as { id?: string; status?: string; admin_response?: string };
  if (!id) return NextResponse.json({ success: false, error: { code: 'INVALID_INPUT', message: 'id required' } }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status) updates.status = status;
  if (admin_response !== undefined) {
    updates.admin_response = admin_response;
    updates.responded_by = user.id;
  }

  const { data, error } = await service.from('support_tickets').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });
  return NextResponse.json({ success: true, data });
}
