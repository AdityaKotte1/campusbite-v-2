import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

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
    .select('role, is_active, institute_id, assigned_canteen_id')
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

  // Determine which canteens this user can see
  let allowedCanteenIds: string[] | null = null; // null = no restriction (super_admin)

  if (profile.role === 'staff') {
    if (!profile.assigned_canteen_id) {
      return NextResponse.json({
        success: true,
        data: [],
        pagination: { page, limit, total: 0, total_pages: 0 },
      });
    }
    allowedCanteenIds = [profile.assigned_canteen_id];
  } else if (profile.role === 'canteen_admin') {
    if (!profile.institute_id) {
      return NextResponse.json({
        success: true,
        data: [],
        pagination: { page, limit, total: 0, total_pages: 0 },
      });
    }
    const { data: canteens } = await service
      .from('canteens')
      .select('id')
      .eq('institute_id', profile.institute_id);
    allowedCanteenIds = (canteens ?? []).map((c: { id: string }) => c.id);
    if (allowedCanteenIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        pagination: { page, limit, total: 0, total_pages: 0 },
      });
    }
  }

  let query = service
    .from('orders')
    .select('*, users(id, full_name, email, phone), canteens(id, name, code), order_items(*)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  // Apply role-based canteen restriction
  if (allowedCanteenIds !== null) {
    query = query.in('canteen_id', allowedCanteenIds);
  }

  // Apply explicit filters (but only within the allowed scope)
  if (status) query = query.eq('status', status);
  if (canteenId && (allowedCanteenIds === null || allowedCanteenIds.includes(canteenId))) {
    query = query.eq('canteen_id', canteenId);
  }
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
