import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

interface Params {
  params: { id: string };
}

export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = params;
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized', message: 'Not authenticated' }, { status: 401 });
    }

    // --- Cheap change-detection (the hot polling path) ---
    // An order's body (items, prices, canteen) is immutable after creation; only
    // status / payment_status / updated_at move. We read just those three and
    // hash them into an ETag. Unchanged polls (the overwhelming majority — a
    // student watches one order for minutes) then return 304 with an empty body,
    // skipping BOTH the heavy `*`+joins+qr_tokens fetch (Supabase egress) and the
    // response transfer to the phone (Vercel egress).
    const { data: head, error: headErr } = await supabase
      .from('orders')
      .select('status, payment_status, updated_at')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (headErr || !head) {
      return NextResponse.json({ error: 'not_found', message: 'Order not found' }, { status: 404 });
    }

    const etag = `"${head.status}.${head.payment_status}.${head.updated_at}"`;
    // `no-cache` = the browser MUST revalidate every time, so it always sends
    // If-None-Match when it holds a cached copy. We only emit 304 when that
    // header is present and matches — meaning the browser has the body to fall
    // back on — so a 304 can never starve the client of data.
    const cacheHeaders = { ETag: etag, 'Cache-Control': 'private, no-cache' };
    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers: cacheHeaders });
    }

    // Changed (or first load): fetch the full order.
    // Fetch order without qr_tokens first (table may not exist in all envs)
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        canteen:canteens(id, name, image_url),
        items:order_items(id, menu_item_id, name:menu_item_name, price_paise:unit_price_paise, quantity, subtotal_paise:total_price_paise, special_note:customization_notes)
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !data) {
      console.error('[orders/[id] GET]', error?.message);
      return NextResponse.json({ error: 'not_found', message: 'Order not found' }, { status: 404 });
    }

    // Try to fetch QR token separately — gracefully absent if table missing
    let qr_token = null;
    try {
      const { data: qr } = await supabase
        .from('qr_tokens')
        .select('id, token, expires_at, status, used_at')
        .eq('order_id', id)
        .maybeSingle();
      qr_token = qr ?? null;
    } catch { /* qr_tokens table may not exist yet */ }

    return NextResponse.json({ data: { ...data, qr_token } }, { headers: cacheHeaders });
  } catch (err) {
    console.error('Order GET error:', err);
    return NextResponse.json({ error: 'internal_error', message: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const { id } = params;
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized', message: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();

    // Fetch existing order
    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('id, status, user_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchErr || !order) {
      return NextResponse.json({ error: 'not_found', message: 'Order not found' }, { status: 404 });
    }

    const allowedUpdates: Record<string, unknown> = {};

    if (body.status && ['cancelled'].includes(body.status)) {
      // Only non-paid orders may be cancelled through this path. 'confirmed'
      // (paid) orders are intentionally excluded: cancelling them here would set
      // status='cancelled' without any refund/payment_status handling, so the
      // customer would pay, get no food and no refund. Paid cancellations must go
      // through the refund-aware flow.
      const cancellableStatuses = ['payment_pending'];
      if (!cancellableStatuses.includes(order.status)) {
        return NextResponse.json({
          error: 'invalid_transition',
          message: `Cannot cancel order with status "${order.status}"`,
        }, { status: 400 });
      }
      allowedUpdates.status = body.status;
      allowedUpdates.cancelled_at = new Date().toISOString();
      allowedUpdates.cancellation_reason = body.reason ?? 'Cancelled by user';
    }

    if (Object.keys(allowedUpdates).length === 0) {
      return NextResponse.json({ error: 'no_updates', message: 'No valid updates provided' }, { status: 400 });
    }

    // No own-UPDATE RLS policy exists on `orders`, so a user-context write matches
    // 0 rows and 500s. Write with the SERVICE client and RE-ASSERT ownership on the
    // update (id + user_id) to preserve the security guarantee without RLS.
    const { data: updated, error: updateErr } = await createServiceClient()
      .from('orders')
      .update(allowedUpdates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: 'update_failed', message: updateErr.message }, { status: 500 });
    }

    // If this transition cancelled the order, return the reserved stock.
    // Idempotent + service-only; log but don't fail the request on error.
    if (allowedUpdates.status === 'cancelled') {
      const { error: restockErr } = await createServiceClient().rpc('restock_order', { p_order_id: id });
      if (restockErr) {
        console.error('[orders PUT] restock error:', restockErr);
      }
    }

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error('Order PUT error:', err);
    return NextResponse.json({ error: 'internal_error', message: 'Internal server error' }, { status: 500 });
  }
}
