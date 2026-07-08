import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// ─── GET /api/v1/admin/canteens ───────────────────────────────────────────────
// super_admin: all canteens, optionally filtered by ?institute_id=xxx
// canteen_admin: only canteens under their institute_id
// staff: only their assigned_canteen_id

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

  // Optional narrowing filter — applied ONLY for super_admin (see below).
  // For canteen_admin/staff this param is ignored so it can never widen scope.
  const instituteId = new URL(request.url).searchParams.get('institute_id');

  let query = service
    .from('canteens')
    .select('id, name, code, institute_id, is_active, billing_state, location, building, floor, opens_at, closes_at, is_open, description, cash_payments_enabled, gst_enabled, tax_percentage')
    .order('name');

  if (profile.role === 'staff') {
    if (!profile.assigned_canteen_id) {
      return NextResponse.json({ success: true, data: [] });
    }
    query = query.eq('id', profile.assigned_canteen_id).neq('billing_state', 'pending_payment');
  } else if (profile.role === 'canteen_admin') {
    if (!profile.institute_id) {
      return NextResponse.json({ success: true, data: [] });
    }
    // Include pending_payment canteens so the admin can resume/discard them
    // (rendered as a "Payment pending" card). Staff (above) still never see them.
    query = query.eq('institute_id', profile.institute_id);
  } else {
    // super_admin — unrestricted listing, optionally NARROWED by ?institute_id=xxx
    if (instituteId) {
      query = query.eq('institute_id', instituteId);
    }
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }

  const canteens = data ?? [];

  // Attach today's order count + revenue per canteen
  if (canteens.length > 0) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const canteenIds = canteens.map((c: { id: string }) => c.id);

    const { data: todayOrders } = await service
      .from('orders')
      .select('canteen_id, total_paise, payment_status')
      .in('canteen_id', canteenIds)
      .gte('created_at', todayStart.toISOString());

    const statsByCanteen: Record<string, { today_orders: number; today_revenue_paise: number }> = {};
    (todayOrders ?? []).forEach((o: { canteen_id: string; total_paise: number; payment_status: string }) => {
      if (!statsByCanteen[o.canteen_id]) {
        statsByCanteen[o.canteen_id] = { today_orders: 0, today_revenue_paise: 0 };
      }
      statsByCanteen[o.canteen_id].today_orders += 1;
      if (o.payment_status === 'paid') {
        statsByCanteen[o.canteen_id].today_revenue_paise += o.total_paise;
      }
    });

    const enriched = canteens.map((c: { id: string }) => ({
      ...c,
      today_orders: statsByCanteen[c.id]?.today_orders ?? 0,
      today_revenue_paise: statsByCanteen[c.id]?.today_revenue_paise ?? 0,
    }));

    return NextResponse.json({ success: true, data: enriched });
  }

  return NextResponse.json({ success: true, data: canteens });
}

// ─── POST /api/v1/admin/canteens ─────────────────────────────────────────────
// super_admin only — create a canteen (used from the Institutes page).
// canteen_admin adds canteens via the paid add-on flow (/canteens/add-on).
// Body: { institute_id, name, location, description?, opening_time, closing_time }

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
      { status: 401 }
    );
  }

  const service = createServiceClient();

  const { data: profile, error: profileError } = await service
    .from('users')
    .select('role, is_active, institute_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || profile.role !== 'super_admin' || !profile.is_active) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Canteen admins must add canteens from Billing (paid add-on). Only super admins create canteens here.' } },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { institute_id, name, location, description, opening_time, closing_time, image_url } = body;

  if (!institute_id || !name || !location || !opening_time || !closing_time) {
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION', message: 'institute_id, name, location, opening_time, closing_time are required' } },
      { status: 400 }
    );
  }

  // Generate a simple code from the name
  const code = (name as string)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);

  const { data, error } = await service
    .from('canteens')
    .insert({
      institute_id,
      name,
      code,
      location,
      description: description || null,
      opens_at: opening_time,
      closes_at: closing_time,
      image_url: image_url || null,
      is_active: true,
      // Super-admin provisioning is authoritative (no paid add-on gate), so the
      // canteen is live immediately. Without this it inherits the column default
      // (`pending_payment`), which hides it from the canteen_admin listing and
      // desyncs it from the billing count.
      billing_state: 'active',
      is_open: false,
      rating: 0,
      total_reviews: 0,
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
