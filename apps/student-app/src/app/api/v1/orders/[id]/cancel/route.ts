import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    const { data: updated, error: updateErr } = await supabase
      .from('orders')
      .update({
        status: newStatus,
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason,
        payment_status: order.payment_status === 'paid' ? 'refunded' : order.payment_status,
      })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: 'update_failed', message: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error('Cancel order error:', err);
    return NextResponse.json({ error: 'internal_error', message: 'Internal server error' }, { status: 500 });
  }
}
