import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface Params {
  params: { id: string };
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = params;
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized', message: 'Not authenticated' }, { status: 401 });
    }

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

    return NextResponse.json({ data: { ...data, qr_token } });
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
      const cancellableStatuses = ['payment_pending', 'confirmed'];
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

    const { data: updated, error: updateErr } = await supabase
      .from('orders')
      .update(allowedUpdates)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: 'update_failed', message: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error('Order PUT error:', err);
    return NextResponse.json({ error: 'internal_error', message: 'Internal server error' }, { status: 500 });
  }
}
