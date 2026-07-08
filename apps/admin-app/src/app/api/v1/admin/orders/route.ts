import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import {
  requireAdmin,
  allowedCanteenIds,
  canAccessCanteen,
  forbidden,
  resolveCanteenScope,
  type CallerProfile,
} from '@/lib/auth';

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

  // Hide unpaid orders from the admin listing unconditionally — even an
  // explicit ?status=payment_pending must return nothing (rows stay in the DB).
  query = query.not('status', 'in', '("payment_pending","payment_failed")');

  // Soft-hidden orders (a canteen admin cleared them from their history) are
  // invisible to canteen admins / staff, but super admins still see every row
  // (the UI badges the hidden ones). Rows are never removed from the DB.
  if (profile.role !== 'super_admin') {
    query = query.is('hidden_at', null);
  }

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

// Soft-hide order history. NON-destructive: rows (and all financial data) stay
// in the DB — this only stamps hidden_at/hidden_by so the orders drop out of the
// canteen admin's history view. Super admins still see every row (badged). The
// admin UI gates this behind a CSV export so there's always an offline copy
// first. canteen_admin ONLY (super admins are view-only for history; staff
// cannot), and every targeted order must fall inside the caller's canteen scope.
const MAX_DELETE_BATCH = 1000;

export async function DELETE(request: NextRequest) {
  const { profile, response } = await requireAdmin(['canteen_admin']);
  if (response) return response;

  let body: { ids?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.filter((v): v is string => typeof v === 'string' && v.length > 0))]
    : [];

  if (ids.length === 0) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_INPUT', message: 'No order ids supplied' } },
      { status: 400 }
    );
  }
  if (ids.length > MAX_DELETE_BATCH) {
    return NextResponse.json(
      { success: false, error: { code: 'INVALID_INPUT', message: `Cannot delete more than ${MAX_DELETE_BATCH} orders at once` } },
      { status: 400 }
    );
  }

  const service = createServiceClient();

  // Load every targeted order first and enforce tenant scoping before any write.
  const { data: rows, error: fetchError } = await service
    .from('orders')
    .select('id, canteen_id')
    .in('id', ids);

  if (fetchError) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: fetchError.message } },
      { status: 500 }
    );
  }

  const found = rows ?? [];
  if (found.length === 0) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'No matching orders found' } },
      { status: 404 }
    );
  }

  const allowed = await allowedCanteenIds(profile);
  const outOfScope = found.some((o: { canteen_id: string }) => !canAccessCanteen(o.canteen_id, allowed));
  if (outOfScope) {
    return forbidden('Cannot hide orders outside your canteen scope');
  }

  // Soft-hide: stamp hidden_at/hidden_by. Paid orders are fine to hide because
  // nothing is destroyed — the rows (and financials) remain, and super admins
  // still see them. Only the rows we verified are touched.
  const hiddenIds = found.map((o: { id: string }) => o.id);
  const { error: hideError } = await service
    .from('orders')
    .update({ hidden_at: new Date().toISOString(), hidden_by: profile.id })
    .in('id', hiddenIds);

  if (hideError) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: hideError.message } },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, hidden: hiddenIds.length });
}
