import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin, resolveCanteenScope } from '@/lib/auth';
import { subDays, format } from 'date-fns';

export async function GET(request: NextRequest) {
  const { profile, response } = await requireAdmin();
  if (response) return response;

  const service = createServiceClient();

  const { searchParams } = new URL(request.url);

  // Tenant scoping: null = super_admin (unrestricted, no filter); otherwise the
  // set of in-scope canteens. Optional institute_id / canteen_id narrow within
  // the caller's allowed scope (never widens). Service-role client bypasses
  // RLS, so every order-based aggregate below MUST be scoped to these IDs.
  const allowed = await resolveCanteenScope(profile, {
    instituteId: searchParams.get('institute_id'),
    canteenId: searchParams.get('canteen_id'),
  });

  const days = parseInt(searchParams.get('days') ?? '30');
  const fromDate = format(subDays(new Date(), days), "yyyy-MM-dd'T'HH:mm:ssxxx");

  // Build the zeroed time-series skeleton once (reused for the empty-scope path).
  const buildRevenueSkeleton = () => {
    const revenueByDate: Record<string, { revenue_paise: number; orders: number }> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = format(subDays(new Date(), i), 'yyyy-MM-dd');
      revenueByDate[d] = { revenue_paise: 0, orders: 0 };
    }
    return revenueByDate;
  };
  const buildHourSkeleton = () => {
    const hourMap: Record<number, number> = {};
    for (let h = 0; h < 24; h++) hourMap[h] = 0;
    return hourMap;
  };

  // No accessible canteens → return an empty/zeroed analytics payload.
  if (allowed !== null && allowed.length === 0) {
    const revenueOverTime = Object.entries(buildRevenueSkeleton()).map(([date, v]) => ({ date, ...v }));
    const ordersByHour = Object.entries(buildHourSkeleton()).map(([hour, orders]) => ({
      hour: parseInt(hour),
      orders,
    }));
    return NextResponse.json({
      success: true,
      data: {
        revenue_over_time: revenueOverTime,
        top_items: [],
        orders_by_hour: ordersByHour,
        payment_methods: [],
      },
    });
  }

  try {
    // Revenue over time
    let paidQ = service
      .from('orders')
      .select('total_paise, created_at')
      .gte('created_at', fromDate)
      .eq('payment_status', 'paid')
      .order('created_at');
    if (allowed !== null) paidQ = paidQ.in('canteen_id', allowed);
    const { data: paidOrders } = await paidQ;

    const revenueByDate = buildRevenueSkeleton();
    (paidOrders ?? []).forEach((o) => {
      const d = format(new Date(o.created_at), 'yyyy-MM-dd');
      if (revenueByDate[d]) {
        revenueByDate[d].revenue_paise += o.total_paise;
        revenueByDate[d].orders += 1;
      }
    });
    const revenueOverTime = Object.entries(revenueByDate).map(([date, v]) => ({ date, ...v }));

    // Top items — scope via the parent order's canteen (inner join + filter)
    let itemsQ = service
      .from('order_items')
      .select('menu_item_id, item_name, quantity, total_price_paise, orders!inner(created_at, payment_status, canteen_id)')
      .gte('orders.created_at', fromDate)
      .eq('orders.payment_status', 'paid');
    if (allowed !== null) itemsQ = itemsQ.in('orders.canteen_id', allowed);
    const { data: orderItems } = await itemsQ;

    const itemMap: Record<string, { name: string; total_orders: number; total_revenue_paise: number }> = {};
    (orderItems ?? []).forEach((item) => {
      const key = item.menu_item_id ?? item.item_name;
      if (!itemMap[key]) {
        itemMap[key] = { name: item.item_name, total_orders: 0, total_revenue_paise: 0 };
      }
      itemMap[key].total_orders += item.quantity;
      itemMap[key].total_revenue_paise += item.total_price_paise;
    });
    const topItems = Object.entries(itemMap)
      .map(([menu_item_id, v]) => ({ menu_item_id, ...v }))
      .sort((a, b) => b.total_orders - a.total_orders)
      .slice(0, 10);

    // Orders by hour
    let allOrdersQ = service
      .from('orders')
      .select('created_at')
      .gte('created_at', fromDate);
    if (allowed !== null) allOrdersQ = allOrdersQ.in('canteen_id', allowed);
    const { data: allOrders } = await allOrdersQ;

    const hourMap = buildHourSkeleton();
    (allOrders ?? []).forEach((o) => {
      const hour = new Date(o.created_at).getHours();
      hourMap[hour] = (hourMap[hour] ?? 0) + 1;
    });
    const ordersByHour = Object.entries(hourMap).map(([hour, orders]) => ({
      hour: parseInt(hour),
      orders,
    }));

    // Payment method breakdown
    let paymentQ = service
      .from('orders')
      .select('payment_method, total_paise')
      .gte('created_at', fromDate)
      .eq('payment_status', 'paid')
      .not('payment_method', 'is', null);
    if (allowed !== null) paymentQ = paymentQ.in('canteen_id', allowed);
    const { data: paymentOrders } = await paymentQ;

    const paymentMap: Record<string, { count: number; total_paise: number }> = {};
    (paymentOrders ?? []).forEach((o) => {
      const method = o.payment_method ?? 'unknown';
      if (!paymentMap[method]) paymentMap[method] = { count: 0, total_paise: 0 };
      paymentMap[method].count += 1;
      paymentMap[method].total_paise += o.total_paise;
    });
    const paymentMethods = Object.entries(paymentMap).map(([method, v]) => ({ method, ...v }));

    return NextResponse.json({
      success: true,
      data: {
        revenue_over_time: revenueOverTime,
        top_items: topItems,
        orders_by_hour: ordersByHour,
        payment_methods: paymentMethods,
      },
    });
  } catch (err) {
    console.error('[analytics]', err);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load analytics' } },
      { status: 500 }
    );
  }
}
