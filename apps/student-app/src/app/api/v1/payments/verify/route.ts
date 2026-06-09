import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { QR_EXPIRY_HOURS } from '@/lib/constants';
import { randomUUID } from 'crypto';
import { getRazorpayForCanteen } from '@/lib/razorpay-config';

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized', message: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, order_id } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !order_id) {
      return NextResponse.json({ error: 'bad_request', message: 'Missing required fields' }, { status: 400 });
    }

    // Fetch the order to get canteen_id (needed to resolve the right Razorpay secret)
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, total_paise, user_id, payment_status, canteen_id')
      .eq('id', order_id)
      .eq('user_id', user.id)
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ error: 'not_found', message: 'Order not found' }, { status: 404 });
    }

    // Idempotency — already verified
    if (order.payment_status === 'paid') {
      return NextResponse.json({ message: 'Already verified', data: { order_id } });
    }

    // Resolve the Razorpay secret for this canteen (same account that created the order)
    let creds;
    try {
      creds = await getRazorpayForCanteen(order.canteen_id, supabase);
    } catch (e) {
      console.error('[payments/verify] Razorpay config error:', e);
      return NextResponse.json({ error: 'payment_not_configured' }, { status: 503 });
    }

    // Verify HMAC signature using the canteen's/institute's key secret
    const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected = createHmac('sha256', creds.keySecret).update(payload).digest('hex');
    const sigBuf = Buffer.from(razorpay_signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');

    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return NextResponse.json({
        error: 'invalid_signature',
        message: 'Payment signature verification failed',
      }, { status: 400 });
    }

    // Update order to paid + confirmed
    const { error: updateErr } = await supabase
      .from('orders')
      .update({
        payment_status: 'paid',
        status: 'confirmed',
        razorpay_order_id,
        razorpay_payment_id,
        payment_method: 'razorpay',
      })
      .eq('id', order_id);

    if (updateErr) {
      return NextResponse.json({ error: 'update_failed', message: updateErr.message }, { status: 500 });
    }

    // Record payment transaction
    await supabase.from('payment_transactions').insert({
      order_id,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      amount_paise: order.total_paise,
      currency: 'INR',
      status: 'paid',
    });

    // Auto-generate QR token for pickup
    const expiresAt = new Date(Date.now() + QR_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
    await supabase.from('qr_tokens').insert({
      order_id,
      token: randomUUID(),
      expires_at: expiresAt,
      status: 'active',
    });

    return NextResponse.json({ data: { order_id, verified: true } });
  } catch (err) {
    console.error('Payment verify error:', err);
    return NextResponse.json({ error: 'internal_error', message: 'Internal server error' }, { status: 500 });
  }
}
