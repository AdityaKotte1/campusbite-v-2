import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

// GET /api/v1/admin/institutes
// Returns institutes with canteen count, today's order count, and admin info.
// super_admin: all institutes
// canteen_admin / staff: their own institute only

export async function GET(_: NextRequest) {
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
    .select('role, is_active, institute_id')
    .eq('id', user.id)
    .single();

  const ALLOWED_ROLES = ['super_admin', 'canteen_admin', 'staff'];
  if (profileError || !profile || !ALLOWED_ROLES.includes(profile.role) || !profile.is_active) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } },
      { status: 403 }
    );
  }

  let instituteQuery = service
    .from('institutes')
    .select('id, name, short_name, city, state, is_active, logo_url, created_at')
    .order('name');

  if (profile.role !== 'super_admin') {
    if (!profile.institute_id) {
      return NextResponse.json({ success: true, data: [] });
    }
    instituteQuery = instituteQuery.eq('id', profile.institute_id);
  }

  const { data: institutes, error: instituteError } = await instituteQuery;

  if (instituteError) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: instituteError.message } },
      { status: 500 }
    );
  }

  if (!institutes || institutes.length === 0) {
    return NextResponse.json({ success: true, data: [] });
  }

  const instituteIds = institutes.map((i: { id: string }) => i.id);

  // Fetch canteen counts per institute
  const { data: canteens } = await service
    .from('canteens')
    .select('id, institute_id')
    .in('institute_id', instituteIds);

  const canteenCountMap: Record<string, number> = {};
  (canteens ?? []).forEach((c: { id: string; institute_id: string }) => {
    canteenCountMap[c.institute_id] = (canteenCountMap[c.institute_id] ?? 0) + 1;
  });

  // Today's orders per institute
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const allCanteenIds = (canteens ?? []).map((c: { id: string }) => c.id);
  const ordersCountMap: Record<string, number> = {};

  if (allCanteenIds.length > 0) {
    const { data: todayOrders } = await service
      .from('orders')
      .select('canteen_id')
      .in('canteen_id', allCanteenIds)
      .gte('created_at', todayStart.toISOString());

    (todayOrders ?? []).forEach((o: { canteen_id: string }) => {
      // Map canteen -> institute
      const canteen = (canteens ?? []).find((c: { id: string }) => c.id === o.canteen_id) as
        | { id: string; institute_id: string }
        | undefined;
      if (canteen) {
        ordersCountMap[canteen.institute_id] = (ordersCountMap[canteen.institute_id] ?? 0) + 1;
      }
    });
  }

  // Fetch canteen_admin per institute (first one found)
  const { data: admins } = await service
    .from('users')
    .select('id, full_name, email, institute_id')
    .eq('role', 'canteen_admin')
    .in('institute_id', instituteIds);

  const adminByInstitute: Record<string, { full_name: string | null; email: string } | null> = {};
  (admins ?? []).forEach((a: { id: string; full_name: string | null; email: string; institute_id: string }) => {
    if (!adminByInstitute[a.institute_id]) {
      adminByInstitute[a.institute_id] = { full_name: a.full_name, email: a.email };
    }
  });

  const result = (institutes as Array<{
    id: string;
    name: string;
    short_name: string;
    city: string | null;
    state: string | null;
    is_active: boolean;
    logo_url: string | null;
    created_at: string;
  }>).map((inst) => ({
    ...inst,
    code: inst.short_name, // alias for frontend compatibility
    canteen_count: canteenCountMap[inst.id] ?? 0,
    today_orders: ordersCountMap[inst.id] ?? 0,
    admin: adminByInstitute[inst.id] ?? null,
  }));

  return NextResponse.json({ success: true, data: result });
}

// ─── POST /api/v1/admin/institutes ────────────────────────────────────────────
// super_admin only — create a new institute

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

  const { data: profile } = await service
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'super_admin') {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Super admin only' } },
      { status: 403 }
    );
  }

  const body = await request.json();
  const { name, short_name, city, state, pincode, address, logo_url } = body;

  if (!name || !short_name || !city || !state) {
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION', message: 'name, short_name, city, and state are required' } },
      { status: 400 }
    );
  }

  const { data, error } = await service
    .from('institutes')
    .insert({
      name,
      short_name,
      city,
      state,
      pincode: pincode || null,
      address: address || null,
      logo_url: logo_url || null,
      country: 'IN',
      is_active: true,
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
