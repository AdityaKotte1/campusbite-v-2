import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin, resolveCanteenScope, type CallerProfile } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const { profile, response } = await requireAdmin();
  if (response) return response;
  const sp = new URL(request.url).searchParams;
  const scope = await resolveCanteenScope(profile as CallerProfile, {
    instituteId: sp.get('institute_id'), canteenId: sp.get('canteen_id'),
  });
  const service = createServiceClient();
  let q = service
    .from('orders')
    // Only the columns the Cash Payments list renders — no order_items embed
    // (the partial index idx_orders_cash_pending makes this filter instant).
    .select('id, order_number, total_paise, created_at, user:users(id, full_name, phone), canteen:canteens(id, name)')
    .eq('payment_method', 'cash')
    .eq('status', 'payment_pending')
    .order('created_at', { ascending: true });
  if (scope !== null) q = q.in('canteen_id', scope);
  const { data, error } = await q;
  if (error) return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });
  return NextResponse.json({ success: true, data: data ?? [] });
}
