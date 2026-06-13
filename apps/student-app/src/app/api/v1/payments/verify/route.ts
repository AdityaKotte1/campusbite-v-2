import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { createClient, createServiceClient } from '@/lib/supabase/server';
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
      .select('id, total_paise, user_id, payment_status, canteen_id, razorpay_order_id')
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

    // Bind the verified payment to THIS order. A valid signature only proves the
    // (razorpay_order_id, razorpay_payment_id) pair is authentic — not that it
    // belongs to the order we're about to mark paid. Without this, a single valid
    // triple from a cheap order could be replayed to settle any expensive order.
    if (!order.razorpay_order_id || order.razorpay_order_id !== razorpay_order_id) {
      return NextResponse.json({
        error: 'order_mismatch',
        message: 'Payment does not match this order',
      }, { status: 400 });
    }

    // Privileged writes: payment verification is a trusted server action, so use
    // the service-role client. The order owner has no UPDATE policy under RLS
    // (only canteen_admin/staff/super_admin do), so a user-context update would
    // silently affect 0 rows and the order would stay "awaiting payment".
    // Ownership was already enforced above via the user-context SELECT.
    const service = createServiceClient();

    // Replay guard: a given razorpay_payment_id must settle at most one order.
    // Even with the order-binding check above, reject if this payment id was
    // already recorded as paid (defense-in-depth alongside the DB unique
    // constraint being added separately).
    const { data: existingTxn } = await service
      .from('payment_transactions')
      .select('id')
      .eq('razorpay_payment_id', razorpay_payment_id)
      .eq('status', 'paid')
      .limit(1);

    if (existingTxn && existingTxn.length > 0) {
      return NextResponse.json({
        error: 'payment_already_used',
        message: 'This payment has already been processed',
      }, { status: 409 });
    }

    // Update order to paid + confirmed
    const { data: updated, error: updateErr } = await service
      .from('orders')
      .update({
        payment_status: 'paid',
        status: 'confirmed',
        razorpay_order_id,
        razorpay_payment_id,
        payment_method: 'razorpay',
      })
      .eq('id', order_id)
      .select('id');

    if (updateErr) {
      console.error('[payments/verify] order update error:', updateErr);
      return NextResponse.json({ error: 'database_error' }, { status: 500 });
    }
    if (!updated || updated.length === 0) {
      // Should not happen now that we use the service client, but fail loudly
      // rather than silently report success on a no-op update.
      return NextResponse.json({ error: 'update_failed', message: 'Order was not updated' }, { status: 500 });
    }

    // Record payment transaction
    await service.from('payment_transactions').insert({
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
    await service.from('qr_tokens').insert({
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
