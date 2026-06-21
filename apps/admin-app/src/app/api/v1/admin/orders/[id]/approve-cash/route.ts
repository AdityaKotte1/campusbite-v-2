import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin, allowedCanteenIds, canAccessCanteen, forbidden, notFound } from '@/lib/auth';

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const { profile, response } = await requireAdmin();
  if (response) return response;
  const service = createServiceClient();

  // Scope check: only non-super-admins need the canteen lookup (super_admin is
  // unrestricted, so skip that extra round trip). The RPC validates cash/state.
  if (profile.role !== 'super_admin') {
    const { data: order } = await service.from('orders').select('canteen_id').eq('id', params.id).single();
    if (!order) return notFound('Order not found');
    if (!canAccessCanteen(order.canteen_id, await allowedCanteenIds(profile))) {
      return forbidden('Cannot approve this order');
    }
  }

  // approve_cash_order confirms + marks paid AND writes the audit log in one call.
  const { data, error } = await service.rpc('approve_cash_order', { p_order_id: params.id, p_staff_id: profile.id });
  if (error) return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });
  const result = data as { ok?: boolean; error?: string } | null;
  if (!result?.ok) return NextResponse.json({ success: false, error: { code: result?.error ?? 'FAILED', message: 'Could not approve' } }, { status: 400 });

  return NextResponse.json({ success: true, data: result });
}
