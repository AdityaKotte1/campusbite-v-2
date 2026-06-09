import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// Staff AND admins can manage stock
const STOCK_ROLES = ['super_admin', 'canteen_admin', 'staff'];

async function authorise(supabase: ReturnType<typeof createClient>, service: ReturnType<typeof createServiceClient>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null, error: 'UNAUTHORIZED' };

  const { data: profile } = await service
    .from('users')
    .select('role, is_active')
    .eq('id', user.id)
    .single();

  if (!profile || !STOCK_ROLES.includes(profile.role) || !profile.is_active) {
    return { user, profile, error: 'FORBIDDEN' };
  }
  return { user, profile, error: null };
}

// GET — return current stock info for one item
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const service = createServiceClient();
  const { error } = await authorise(supabase, service);
  if (error) return NextResponse.json({ success: false, error: { code: error } }, { status: error === 'UNAUTHORIZED' ? 401 : 403 });

  const { data, error: dbErr } = await service
    .from('menu_items')
    .select('id, name, stock_enabled, stock_count, is_available')
    .eq('id', params.id)
    .single();

  if (dbErr || !data) return NextResponse.json({ success: false, error: { code: 'NOT_FOUND' } }, { status: 404 });
  return NextResponse.json({ success: true, data });
}

// PATCH — update stock settings or refill
// Body options:
//   { action: 'refill', count: 50 }       → set new stock count (re-enables tracking)
//   { action: 'disable' }                  → disable stock tracking (unlimited)
//   { action: 'toggle_available', is_available: bool } → manual toggle without touching stock
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const service = createServiceClient();
  const { error: authErr } = await authorise(supabase, service);
  if (authErr) return NextResponse.json({ success: false, error: { code: authErr } }, { status: authErr === 'UNAUTHORIZED' ? 401 : 403 });

  const body = await request.json();
  const { action } = body;

  if (action === 'refill') {
    const count = parseInt(body.count, 10);
    if (isNaN(count) || count < 0) {
      return NextResponse.json({ success: false, error: { code: 'INVALID_COUNT', message: 'Count must be 0 or more' } }, { status: 400 });
    }

    const { data, error: dbErr } = await service
      .from('menu_items')
      .update({
        stock_enabled: true,
        stock_count: count,
        is_available: count > 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .select('id, name, stock_enabled, stock_count, is_available')
      .single();

    if (dbErr) return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: dbErr.message } }, { status: 500 });
    return NextResponse.json({ success: true, data });
  }

  if (action === 'disable') {
    const { data, error: dbErr } = await service
      .from('menu_items')
      .update({ stock_enabled: false, stock_count: null, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select('id, name, stock_enabled, stock_count, is_available')
      .single();

    if (dbErr) return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: dbErr.message } }, { status: 500 });
    return NextResponse.json({ success: true, data });
  }

  if (action === 'toggle_available') {
    const { is_available } = body;
    if (typeof is_available !== 'boolean') {
      return NextResponse.json({ success: false, error: { code: 'INVALID_BODY' } }, { status: 400 });
    }

    const { data, error: dbErr } = await service
      .from('menu_items')
      .update({ is_available, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select('id, name, stock_enabled, stock_count, is_available')
      .single();

    if (dbErr) return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: dbErr.message } }, { status: 500 });
    return NextResponse.json({ success: true, data });
  }

  return NextResponse.json({ success: false, error: { code: 'UNKNOWN_ACTION' } }, { status: 400 });
}
