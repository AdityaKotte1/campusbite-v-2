import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

type RouteContext = { params: { id: string } };

async function getCallerProfile(userId: string) {
  const service = createServiceClient();
  const { data } = await service
    .from('users')
    .select('role, is_active, institute_id, assigned_canteen_id')
    .eq('id', userId)
    .single();
  return data;
}

async function canManageCanteen(
  profile: { role: string; institute_id: string | null; assigned_canteen_id: string | null },
  canteen: { id: string; institute_id: string }
): Promise<boolean> {
  if (profile.role === 'super_admin') return true;
  if (profile.role === 'canteen_admin') return profile.institute_id === canteen.institute_id;
  return false;
}

// ─── GET /api/v1/admin/canteens/[id] ─────────────────────────────────────────

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
  if (!profile || !['super_admin', 'canteen_admin', 'staff'].includes(profile.role) || !profile.is_active) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } },
      { status: 403 }
    );
  }

  // staff can only view their assigned canteen
  if (profile.role === 'staff' && profile.assigned_canteen_id !== params.id) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } },
      { status: 403 }
    );
  }

  const service = createServiceClient();
  const { data: canteen, error } = await service
    .from('canteens')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !canteen) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Canteen not found' } },
      { status: 404 }
    );
  }

  // canteen_admin scope check
  if (profile.role === 'canteen_admin' && canteen.institute_id !== profile.institute_id) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } },
      { status: 403 }
    );
  }

  return NextResponse.json({ success: true, data: canteen });
}

// ─── PUT /api/v1/admin/canteens/[id] ─────────────────────────────────────────

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
  if (!profile || !['super_admin', 'canteen_admin'].includes(profile.role) || !profile.is_active) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } },
      { status: 403 }
    );
  }

  const service = createServiceClient();

  // Fetch canteen to verify ownership
  const { data: canteen } = await service
    .from('canteens')
    .select('id, institute_id')
    .eq('id', params.id)
    .single();

  if (!canteen) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Canteen not found' } },
      { status: 404 }
    );
  }

  if (!(await canManageCanteen(profile, canteen))) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Cannot manage this canteen' } },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { name, location, description, opening_time, closing_time, is_active, is_open, image_url } = body;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (location !== undefined) updates.location = location;
  if (description !== undefined) updates.description = description || null;
  if (opening_time !== undefined) updates.opens_at = opening_time;
  if (closing_time !== undefined) updates.closes_at = closing_time;
  if (is_active !== undefined) updates.is_active = is_active;
  if (is_open !== undefined) updates.is_open = is_open;
  if (image_url !== undefined) updates.image_url = image_url || null;

  const { data, error } = await service
    .from('canteens')
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

// ─── DELETE /api/v1/admin/canteens/[id] ──────────────────────────────────────
// Soft delete — set is_active = false

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
  if (!profile || !['super_admin', 'canteen_admin'].includes(profile.role) || !profile.is_active) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } },
      { status: 403 }
    );
  }

  const service = createServiceClient();

  const { data: canteen } = await service
    .from('canteens')
    .select('id, institute_id')
    .eq('id', params.id)
    .single();

  if (!canteen) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Canteen not found' } },
      { status: 404 }
    );
  }

  if (!(await canManageCanteen(profile, canteen))) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Cannot manage this canteen' } },
      { status: 403 }
    );
  }

  const { error } = await service
    .from('canteens')
    .update({ is_active: false })
    .eq('id', params.id);

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, message: 'Canteen deactivated' });
}
