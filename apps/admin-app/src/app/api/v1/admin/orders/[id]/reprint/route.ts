import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin, allowedCanteenIds, canAccessCanteen, forbidden, notFound } from '@/lib/auth';

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const { profile, response } = await requireAdmin();
  if (response) return response;
  const service = createServiceClient();
  const { data: order } = await service.from('orders').select('id, canteen_id, payment_method').eq('id', params.id).single();
  if (!order) return notFound('Order not found');
  if (!canAccessCanteen(order.canteen_id, await allowedCanteenIds(profile))) return forbidden('Cannot reprint this order');

  const { error } = await service.rpc('reprint_cash_bill', { p_order_id: params.id });
  if (error) return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });
  return NextResponse.json({ success: true });
}
