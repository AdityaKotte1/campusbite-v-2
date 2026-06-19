import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { resolveCanteenScope, type CallerProfile } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
  }

  const service = createServiceClient();

  // Verify role and get profile for scoping
  const { data: profile, error: profileError } = await service
    .from('users')
    .select('id, role, is_active, institute_id, assigned_canteen_id')
    .eq('id', user.id)
    .single();

  const ALLOWED_ROLES = ['super_admin', 'canteen_admin', 'staff'];
  if (profileError || !profile || !ALLOWED_ROLES.includes(profile.role) || !profile.is_active) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const canteenId = searchParams.get('canteen_id');
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');
  const search = searchParams.get('search');
  const page = parseInt(searchParams.get('page') ?? '1');
  const limit = parseInt(searchParams.get('limit') ?? '50');

  // Determine which canteens this user can see, honoring optional narrowing
  // filters. `null` = no restriction (super_admin, no filter); `[]` = nothing
  // in scope (the .in('canteen_id', []) below then yields zero rows).
  const instituteId = searchParams.get('institute_id');
  const scope = await resolveCanteenScope(profile as CallerProfile, {
    instituteId,
    canteenId,
  });

  let query = service
    .from('orders')
    .select('*, user:users(id, full_name, email, phone), canteen:canteens(id, name, code), order_items(*)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  // Apply the resolved canteen restriction (never widens the caller's scope).
  if (scope !== null) {
    query = query.in('canteen_id', scope);
  }

  // Apply explicit filters
  if (status) query = query.eq('status', status);
  if (dateFrom) query = query.gte('created_at', dateFrom);
  if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59');
  if (search) query = query.ilike('order_number', `%${search}%`);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    data: data ?? [],
    pagination: { page, limit, total: count ?? 0, total_pages: Math.ceil((count ?? 0) / limit) },
  });
}
