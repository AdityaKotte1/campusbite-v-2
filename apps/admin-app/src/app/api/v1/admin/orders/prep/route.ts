import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin, allowedCanteenIds, canAccessCanteen, forbidden } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const { profile, response } = await requireAdmin();
  if (response) return response;

  const canteenId = new URL(request.url).searchParams.get('canteen_id');
  if (!canteenId) {
    return NextResponse.json(
      { success: false, error: { code: 'CANTEEN_REQUIRED', message: 'canteen_id is required' } },
      { status: 400 }
    );
  }
  const allowed = await allowedCanteenIds(profile);
  if (!canAccessCanteen(canteenId, allowed)) return forbidden('Cannot access this canteen');

  const service = createServiceClient();
  const { data, error } = await service
    .from('order_items')
    .select('menu_item_id, menu_item_name, quantity, orders!inner(canteen_id, status)')
    .eq('orders.canteen_id', canteenId)
    .in('orders.status', ['confirmed', 'preparing', 'ready']);

  if (error) {
    return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });
  }

  const map = new Map<string, { menu_item_id: string; name: string; to_cook: number; ready: number }>();
  for (const row of (data ?? []) as unknown as Array<{
    menu_item_id: string; menu_item_name: string; quantity: number; orders: { status: string };
  }>) {
    const key = row.menu_item_id;
    const entry = map.get(key) ?? { menu_item_id: key, name: row.menu_item_name, to_cook: 0, ready: 0 };
    if (row.orders.status === 'ready') entry.ready += row.quantity;
    else entry.to_cook += row.quantity;
    map.set(key, entry);
  }
  const result = [...map.values()].sort((a, b) => b.to_cook - a.to_cook);
  return NextResponse.json({ success: true, data: result });
}
