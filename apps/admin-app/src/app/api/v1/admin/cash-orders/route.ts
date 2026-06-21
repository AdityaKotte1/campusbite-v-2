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
    .select('*, user:users(id, full_name, phone), canteen:canteens(id, name), order_items(*)')
    .eq('payment_method', 'cash')
    .eq('status', 'payment_pending')
    .order('created_at', { ascending: true });
  if (scope !== null) q = q.in('canteen_id', scope);
  const { data, error } = await q;
  if (error) return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });
  return NextResponse.json({ success: true, data: data ?? [] });
}
