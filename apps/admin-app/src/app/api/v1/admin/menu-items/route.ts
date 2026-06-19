import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { resolveCanteenScope, type CallerProfile } from '@/lib/auth';

async function getProfile(userId: string, service: ReturnType<typeof createServiceClient>) {
  return service
    .from('users')
    .select('id, role, is_active, institute_id, assigned_canteen_id')
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

  const service = createServiceClient();
  const { data: profile, error: profileError } = await getProfile(user.id, service);

  const ALLOWED_ROLES = ['super_admin', 'canteen_admin', 'staff'];
  if (profileError || !profile || !ALLOWED_ROLES.includes(profile.role) || !profile.is_active) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const scope = await resolveCanteenScope(profile as CallerProfile, {
    instituteId: searchParams.get('institute_id'),
    canteenId: searchParams.get('canteen_id'),
  });

  let query = service
    .from('menu_items')
    .select(
      'id, canteen_id, category_id, name, description, price_paise, image_url, is_available, is_veg, prep_time_minutes, sort_order, stock_enabled, stock_count, created_at, updated_at, categories(id, name), canteens(id, name)'
    )
    .order('sort_order')
    .order('name');

  // Restrict to in-scope canteens (never widens). `[]` → zero rows.
  if (scope !== null) {
    query = query.in('canteen_id', scope);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }

  // Normalise joined relations to match existing shape expected by the page
  const items = (data ?? []).map((row: Record<string, unknown>) => {
    const { categories, canteens, ...rest } = row as {
      categories: { id: string; name: string } | null;
      canteens: { id: string; name: string } | null;
      [key: string]: unknown;
    };
    return { ...rest, category: categories, canteen: canteens };
  });

  return NextResponse.json({ success: true, data: items });
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

  const CREATE_ROLES = ['super_admin', 'canteen_admin'];
  if (profileError || !profile || !CREATE_ROLES.includes(profile.role) || !profile.is_active) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { canteen_id, name, price_paise } = body;

  if (!canteen_id) {
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'canteen_id is required' } },
      { status: 400 }
    );
  }

  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 120) {
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'name is required (max 120 chars)' } },
      { status: 400 }
    );
  }

  if (!Number.isInteger(price_paise) || price_paise < 0) {
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'price_paise must be a non-negative integer' } },
      { status: 400 }
    );
  }

  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== 'string' || body.description.length > 1000) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'description must be a string (max 1000 chars)' } },
        { status: 400 }
      );
    }
  }

  // canteen_admin: verify the canteen belongs to their institute
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

  // Explicit column whitelist — never spread the raw body (mass-assignment).
  const insertRow: Record<string, unknown> = {
    canteen_id,
    name: name.trim(),
    price_paise,
    description: body.description ?? null,
    category_id: body.category_id ?? null,
    image_url: body.image_url ?? null,
    is_veg: typeof body.is_veg === 'boolean' ? body.is_veg : false,
    is_available: typeof body.is_available === 'boolean' ? body.is_available : true,
    prep_time_minutes: Number.isInteger(body.prep_time_minutes) ? body.prep_time_minutes : null,
    sort_order: Number.isInteger(body.sort_order) ? body.sort_order : 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await service
    .from('menu_items')
    .insert(insertRow)
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
