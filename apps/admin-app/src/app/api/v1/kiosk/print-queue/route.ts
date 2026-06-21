import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { authenticateKiosk } from '@/lib/kiosk-auth';

/**
 * GET /api/v1/kiosk/print-queue
 *
 * Kiosk-HMAC authed. Returns pending print jobs for the kiosk's canteen,
 * including the full receipt payload (order + items) the kiosk needs to print.
 *
 * Auth headers: X-Kiosk-ID / X-Kiosk-Timestamp / X-Kiosk-Signature
 * HMAC payload: GET\n/api/v1/kiosk/print-queue\n{timestamp}\n{sha256(body)}
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateKiosk(request, '/api/v1/kiosk/print-queue', 'GET');
  if ('response' in auth) return auth.response;
  const { kiosk } = auth;

  const service = createServiceClient();
  const { data: jobs } = await service
    .from('print_jobs')
    .select(
      'id, order_id, kind, created_at, attempts, order:orders(order_number, total_paise, subtotal_paise, tax_paise, discount_paise, created_at, order_items(menu_item_name, quantity, unit_price_paise, total_price_paise))'
    )
    .eq('canteen_id', kiosk.canteen_id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  return NextResponse.json({ success: true, data: jobs ?? [] });
}
