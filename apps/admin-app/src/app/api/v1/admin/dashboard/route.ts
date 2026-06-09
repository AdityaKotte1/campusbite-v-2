import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { startOfDay, subDays, format } from 'date-fns';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });
  }

  const service = createServiceClient();

  const { data: profile, error: profileError } = await service
    .from('users')
    .select('role, is_active, institute_id, assigned_canteen_id')
    .eq('id', user.id)
    .single();

  const ADMIN_ROLES = ['super_admin', 'canteen_admin', 'staff'];
  if (profileError || !profile || !ADMIN_ROLES.includes(profile.role) || !profile.is_active) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } },
      { status: 403 }
    );
  }

  // Determine allowed canteen IDs based on role
  let allowedCanteenIds: string[] | null = null; // null = no restriction (super_admin)

  if (profile.role === 'staff') {
    allowedCanteenIds = profile.assigned_canteen_id ? [profile.assigned_canteen_id] : [];
  } else if (profile.role === 'canteen_admin') {
    if (profile.institute_id) {
      const { data: canteens } = await service
        .from('canteens')
        .select('id')
        .eq('institute_id', profile.institute_id);
      allowedCanteenIds = (canteens ?? []).map((c: { id: string }) => c.id);
    } else {
      allowedCanteenIds = [];
    }
  }

  // If no canteens accessible, return empty stats
  if (allowedCanteenIds !== null && allowedCanteenIds.length === 0) {
    return NextResponse.json({
      success: true,
      data: {
        stats: {
          today_revenue_paise: 0,
          today_orders: 0,
          active_orders: 0,
          new_users_today: 0,
          revenue_change_pct: 0,
          orders_change_pct: 0,
        },
        revenue_over_time: [],
        recent_orders: [],
      },
    });
  }

  const today = startOfDay(new Date());
  const yesterday = startOfDay(subDays(new Date(), 1));
  const todayStr = format(today, "yyyy-MM-dd'T'HH:mm:ssxxx");
  const yesterdayStr = format(yesterday, "yyyy-MM-dd'T'HH:mm:ssxxx");

  try {
    // Today's orders (paid only for revenue)
    let todayQ = service
      .from('orders')
      .select('total_paise, status, payment_status')
      .gte('created_at', todayStr)
      .eq('payment_status', 'paid');
    if (allowedCanteenIds !== null) todayQ = todayQ.in('canteen_id', allowedCanteenIds);

    const { data: todayOrders } = await todayQ;
    const todayRevenue = (todayOrders ?? []).reduce((sum, o) => sum + o.total_paise, 0);
    const todayOrderCount = (todayOrders ?? []).length;

    // Yesterday's orders for comparison
    let yesterdayQ = service
      .from('orders')
      .select('total_paise')
      .gte('created_at', yesterdayStr)
      .lt('created_at', todayStr)
      .eq('payment_status', 'paid');
    if (allowedCanteenIds !== null) yesterdayQ = yesterdayQ.in('canteen_id', allowedCanteenIds);

    const { data: yesterdayOrders } = await yesterdayQ;
    const yesterdayRevenue = (yesterdayOrders ?? []).reduce((sum, o) => sum + o.total_paise, 0);
    const yesterdayCount = (yesterdayOrders ?? []).length;

    // Active orders
    let activeQ = service
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .in('status', ['confirmed', 'preparing', 'ready']);
    if (allowedCanteenIds !== null) activeQ = activeQ.in('canteen_id', allowedCanteenIds);
    const { count: activeOrders } = await activeQ;

    // New users today (only for super_admin — canteen_admin sees institute-scoped new users)
    let newUsersToday = 0;
    if (profile.role === 'super_admin') {
      const { count } = await service
        .from('users')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', todayStr);
      newUsersToday = count ?? 0;
    } else if (profile.role === 'canteen_admin' && profile.institute_id) {
      const { count } = await service
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('institute_id', profile.institute_id)
        .gte('created_at', todayStr);
      newUsersToday = count ?? 0;
    }

    // Revenue last 7 days for chart
    const sevenDaysAgo = format(subDays(new Date(), 7), "yyyy-MM-dd'T'HH:mm:ssxxx");
    let recentQ = service
      .from('orders')
      .select('total_paise, created_at')
      .gte('created_at', sevenDaysAgo)
      .eq('payment_status', 'paid')
      .order('created_at');
    if (allowedCanteenIds !== null) recentQ = recentQ.in('canteen_id', allowedCanteenIds);
    const { data: recentOrders } = await recentQ;

    // Group by date
    const revenueByDate: Record<string, { revenue_paise: number; orders: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = format(subDays(new Date(), i), 'yyyy-MM-dd');
      revenueByDate[d] = { revenue_paise: 0, orders: 0 };
    }
    (recentOrders ?? []).forEach((o) => {
      const d = format(new Date(o.created_at), 'yyyy-MM-dd');
      if (revenueByDate[d]) {
        revenueByDate[d].revenue_paise += o.total_paise;
        revenueByDate[d].orders += 1;
      }
    });
    const revenueOverTime = Object.entries(revenueByDate).map(([date, v]) => ({ date, ...v }));

    // Recent orders (scoped)
    let latestQ = service
      .from('orders')
      .select('*, users(id, full_name, email), canteens(id, name), order_items(*)')
      .order('created_at', { ascending: false })
      .limit(10);
    if (allowedCanteenIds !== null) latestQ = latestQ.in('canteen_id', allowedCanteenIds);
    const { data: recent } = await latestQ;

    const revenueChangePct =
      yesterdayRevenue > 0
        ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100
        : 0;
    const ordersChangePct =
      yesterdayCount > 0
        ? ((todayOrderCount - yesterdayCount) / yesterdayCount) * 100
        : 0;

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          today_revenue_paise: todayRevenue,
          today_orders: todayOrderCount,
          active_orders: activeOrders ?? 0,
          new_users_today: newUsersToday,
          revenue_change_pct: revenueChangePct,
          orders_change_pct: ordersChangePct,
        },
        revenue_over_time: revenueOverTime,
        recent_orders: recent ?? [],
      },
    });
  } catch (err) {
    console.error('[dashboard]', err);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load dashboard' } },
      { status: 500 }
    );
  }
}
