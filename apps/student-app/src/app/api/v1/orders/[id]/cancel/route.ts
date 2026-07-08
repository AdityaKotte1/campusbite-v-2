import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

interface Params {
  params: { id: string };
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = params;
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized', message: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const reason = body.reason ?? 'Cancelled by user';

    // Fetch order
    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('id, status, payment_status, total_paise')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchErr || !order) {
      return NextResponse.json({ error: 'not_found', message: 'Order not found' }, { status: 404 });
    }

    const cancellableStatuses = ['payment_pending'];
    if (!cancellableStatuses.includes(order.status)) {
      return NextResponse.json({
        error: 'cannot_cancel',
        message: `Order in status "${order.status}" cannot be cancelled`,
      }, { status: 400 });
    }

    const newStatus = order.payment_status === 'paid' ? 'refunded' : 'cancelled';

    // No own-UPDATE RLS policy exists on `orders`, so a user-context write matches
    // 0 rows and 500s. Write with the SERVICE client and RE-ASSERT ownership on the
    // update (id + user_id) to preserve the security guarantee without RLS.
    const { data: updated, error: updateErr } = await createServiceClient()
      .from('orders')
      .update({
        status: newStatus,
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason,
        payment_status: order.payment_status === 'paid' ? 'refunded' : order.payment_status,
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateErr) {
      console.error('[orders cancel] update error:', updateErr);
      return NextResponse.json({ error: 'update_failed' }, { status: 500 });
    }

    // Return the stock reserved at order creation. Idempotent + service-only.
    const { error: restockErr } = await createServiceClient().rpc('restock_order', { p_order_id: id });
    if (restockErr) {
      console.error('[orders cancel] restock error:', restockErr);
    }

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error('Cancel order error:', err);
    return NextResponse.json({ error: 'internal_error', message: 'Internal server error' }, { status: 500 });
  }
}
