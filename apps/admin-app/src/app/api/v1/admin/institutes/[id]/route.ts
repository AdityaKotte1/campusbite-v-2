import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

type RouteContext = { params: { id: string } };

async function getCallerProfile(userId: string) {
  const service = createServiceClient();
  const { data } = await service
    .from('users')
    .select('role, is_active, institute_id')
    .eq('id', userId)
    .single();
  return data;
}

// ─── GET /api/v1/admin/institutes/[id] ───────────────────────────────────────
// Returns single institute with its canteens list.

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
      { status: 401 }
    );
  }

  const profile = await getCallerProfile(user.id);
  if (!profile || !['super_admin', 'canteen_admin'].includes(profile.role) || !profile.is_active) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } },
      { status: 403 }
    );
  }

  // canteen_admin can only view their own institute
  if (profile.role === 'canteen_admin' && profile.institute_id !== params.id) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } },
      { status: 403 }
    );
  }

  const service = createServiceClient();

  const { data: institute, error } = await service
    .from('institutes')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !institute) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Institute not found' } },
      { status: 404 }
    );
  }

  const { data: canteens } = await service
    .from('canteens')
    .select('*')
    .eq('institute_id', params.id)
    .order('name');

  return NextResponse.json({ success: true, data: { ...institute, canteens: canteens ?? [] } });
}

// ─── PUT /api/v1/admin/institutes/[id] ───────────────────────────────────────
// super_admin only — update institute fields

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
      { status: 401 }
    );
  }

  const profile = await getCallerProfile(user.id);
  if (!profile || profile.role !== 'super_admin') {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Super admin only' } },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { name, short_name, city, state, pincode, address, logo_url, is_active } = body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (short_name !== undefined) updates.short_name = short_name;
  if (city !== undefined) updates.city = city;
  if (state !== undefined) updates.state = state;
  if (pincode !== undefined) updates.pincode = pincode || null;
  if (address !== undefined) updates.address = address || null;
  if (logo_url !== undefined) updates.logo_url = logo_url || null;
  if (is_active !== undefined) updates.is_active = is_active;

  const service = createServiceClient();

  const { data, error } = await service
    .from('institutes')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data });
}

// ─── DELETE /api/v1/admin/institutes/[id] ────────────────────────────────────
// super_admin only — soft delete (set is_active = false)

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
      { status: 401 }
    );
  }

  const profile = await getCallerProfile(user.id);
  if (!profile || profile.role !== 'super_admin') {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Super admin only' } },
      { status: 403 }
    );
  }

  const service = createServiceClient();

  const { error } = await service
    .from('institutes')
    .update({ is_active: false })
    .eq('id', params.id);

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, message: 'Institute deactivated' });
}
