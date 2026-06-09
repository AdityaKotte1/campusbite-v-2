import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { subDays, format, startOfDay } from 'date-fns';

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });

  const service = createServiceClient();

  // Verify admin role
  const { data: profile, error: profileError } = await service
    .from('users')
    .select('role, is_active')
    .eq('id', user.id)
    .single();

  const ADMIN_ROLES = ['super_admin', 'canteen_admin', 'staff'];
  if (profileError || !profile || !ADMIN_ROLES.includes(profile.role) || !profile.is_active) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days') ?? '30');
  const fromDate = format(subDays(new Date(), days), "yyyy-MM-dd'T'HH:mm:ssxxx");

  try {
    // Revenue over time
    const { data: paidOrders } = await service
      .from('orders')
      .select('total_paise, created_at')
      .gte('created_at', fromDate)
      .eq('payment_status', 'paid')
      .order('created_at');

    const revenueByDate: Record<string, { revenue_paise: number; orders: number }> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = format(subDays(new Date(), i), 'yyyy-MM-dd');
      revenueByDate[d] = { revenue_paise: 0, orders: 0 };
    }
    (paidOrders ?? []).forEach((o) => {
      const d = format(new Date(o.created_at), 'yyyy-MM-dd');
      if (revenueByDate[d]) {
        revenueByDate[d].revenue_paise += o.total_paise;
        revenueByDate[d].orders += 1;
      }
    });
    const revenueOverTime = Object.entries(revenueByDate).map(([date, v]) => ({ date, ...v }));

    // Top items
    const { data: orderItems } = await service
      .from('order_items')
      .select('menu_item_id, item_name, quantity, total_price_paise, orders!inner(created_at, payment_status)')
      .gte('orders.created_at', fromDate)
      .eq('orders.payment_status', 'paid');

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
    const { data: allOrders } = await service
      .from('orders')
      .select('created_at')
      .gte('created_at', fromDate);

    const hourMap: Record<number, number> = {};
    for (let h = 0; h < 24; h++) hourMap[h] = 0;
    (allOrders ?? []).forEach((o) => {
      const hour = new Date(o.created_at).getHours();
      hourMap[hour] = (hourMap[hour] ?? 0) + 1;
    });
    const ordersByHour = Object.entries(hourMap).map(([hour, orders]) => ({
      hour: parseInt(hour),
      orders,
    }));

    // Payment method breakdown
    const { data: paymentOrders } = await service
      .from('orders')
      .select('payment_method, total_paise')
      .gte('created_at', fromDate)
      .eq('payment_status', 'paid')
      .not('payment_method', 'is', null);

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
