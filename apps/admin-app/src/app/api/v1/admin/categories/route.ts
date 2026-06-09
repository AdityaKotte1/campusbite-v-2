import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

async function getProfile(userId: string, service: ReturnType<typeof createServiceClient>) {
  return service
    .from('users')
    .select('role, is_active, institute_id, assigned_canteen_id')
    .eq('id', userId)
    .single();
}

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const filterCanteenId = searchParams.get('canteen_id');

  const service = createServiceClient();
  const { data: profile, error: profileError } = await getProfile(user.id, service);

  const ALLOWED_ROLES = ['super_admin', 'canteen_admin', 'staff'];
  if (profileError || !profile || !ALLOWED_ROLES.includes(profile.role) || !profile.is_active) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } },
      { status: 403 }
    );
  }

  let query = service
    .from('categories')
    .select('*, canteens(id, name)')
    .order('sort_order')
    .order('name');

  if (profile.role === 'staff') {
    if (!profile.assigned_canteen_id) {
      return NextResponse.json({ success: true, data: [] });
    }
    query = query.eq('canteen_id', profile.assigned_canteen_id);
  } else if (profile.role === 'canteen_admin') {
    if (!profile.institute_id) {
      return NextResponse.json({ success: true, data: [] });
    }
    // Get canteens in their institute first
    const { data: canteens } = await service
      .from('canteens')
      .select('id')
      .eq('institute_id', profile.institute_id);
    const canteenIds = (canteens ?? []).map((c: { id: string }) => c.id);
    if (canteenIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }
    query = query.in('canteen_id', canteenIds);
    if (filterCanteenId) {
      // Further narrow by the requested canteen (only if it's in their institute)
      if (canteenIds.includes(filterCanteenId)) {
        query = query.eq('canteen_id', filterCanteenId);
      } else {
        return NextResponse.json({ success: true, data: [] });
      }
    }
  } else {
    // super_admin: optional filter
    if (filterCanteenId) {
      query = query.eq('canteen_id', filterCanteenId);
    }
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
      { status: 401 }
    );
  }

  const service = createServiceClient();
  const { data: profile, error: profileError } = await getProfile(user.id, service);

  // Only canteen_admin and super_admin can create categories
  const CREATE_ROLES = ['super_admin', 'canteen_admin'];
  if (profileError || !profile || !CREATE_ROLES.includes(profile.role) || !profile.is_active) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Only admins can create categories' } },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { canteen_id, name, description, icon, sort_order } = body;

  if (!canteen_id || !name) {
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'canteen_id and name are required' } },
      { status: 400 }
    );
  }

  // For canteen_admin: verify the canteen belongs to their institute
  if (profile.role === 'canteen_admin') {
    if (!profile.institute_id) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'No institute assigned' } },
        { status: 403 }
      );
    }
    const { data: canteen } = await service
      .from('canteens')
      .select('id, institute_id')
      .eq('id', canteen_id)
      .eq('institute_id', profile.institute_id)
      .single();
    if (!canteen) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Canteen not in your institute' } },
        { status: 403 }
      );
    }
  }

  const { data, error } = await service
    .from('categories')
    .insert({
      canteen_id,
      name,
      description: description ?? null,
      icon: icon ?? null,
      sort_order: sort_order ?? 0,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data }, { status: 201 });
}
