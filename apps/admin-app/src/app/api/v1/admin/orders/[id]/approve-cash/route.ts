import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin, allowedCanteenIds, canAccessCanteen, forbidden, notFound } from '@/lib/auth';

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const { profile, response } = await requireAdmin();
  if (response) return response;
  const service = createServiceClient();
  const { data: order } = await service.from('orders').select('id, canteen_id, payment_method').eq('id', params.id).single();
  if (!order) return notFound('Order not found');
  if (!canAccessCanteen(order.canteen_id, await allowedCanteenIds(profile))) return forbidden('Cannot approve this order');

  const { data, error } = await service.rpc('approve_cash_order', { p_order_id: params.id, p_staff_id: profile.id });
  if (error) return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });
  const result = data as { ok?: boolean; error?: string } | null;
  if (!result?.ok) return NextResponse.json({ success: false, error: { code: result?.error ?? 'FAILED', message: 'Could not approve' } }, { status: 400 });

  await service.from('audit_logs').insert({
    user_id: profile.id, action: 'order.cash_approve', entity_type: 'order', entity_id: params.id, metadata: {},
  });
  return NextResponse.json({ success: true, data: result });
}
