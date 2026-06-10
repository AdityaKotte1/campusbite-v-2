import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Razorpay from 'razorpay';
import { CURRENCY } from '@/lib/constants';
import { paymentLimiter } from '@/lib/rate-limit';
import { getRazorpayForCanteen } from '@/lib/razorpay-config';

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized', message: 'Not authenticated' }, { status: 401 });
    }

    const limit = paymentLimiter(user.id);
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'RATE_LIMITED', message: 'Too many payment requests. Please wait.' } },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((limit.resetAt - Date.now()) / 1000)) } }
      );
    }

    const body = await request.json();
    const { order_id } = body;

    if (!order_id) {
      return NextResponse.json({ error: 'bad_request', message: 'order_id is required' }, { status: 400 });
    }

    // Verify order belongs to user and fetch canteen_id
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, total_paise, order_number, status, payment_status, canteen_id, canteen:canteens(name)')
      .eq('id', order_id)
      .eq('user_id', user.id)
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ error: 'not_found', message: 'Order not found' }, { status: 404 });
    }

    if (order.status !== 'payment_pending') {
      return NextResponse.json({
        error: 'invalid_status',
        message: 'This order is not awaiting payment',
      }, { status: 400 });
    }

    // Resolve the correct Razorpay credentials for this canteen
    let creds;
    try {
      creds = await getRazorpayForCanteen(order.canteen_id, supabase);
    } catch (e) {
      console.error('[payments/create] Razorpay config error:', e);
      return NextResponse.json(
        { error: 'payment_not_configured', message: 'Payment gateway is not configured for this canteen. Contact the canteen admin.' },
        { status: 503 }
      );
    }

    // Initialize Razorpay with the resolved keys
    const razorpay = new Razorpay({
      key_id: creds.keyId,
      key_secret: creds.keySecret,
    });

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: order.total_paise,
      currency: CURRENCY,
      receipt: order.order_number,
      notes: {
        order_id: order.id,
        user_id: user.id,
        canteen_id: order.canteen_id,
      },
    });

    // Store razorpay_order_id on our order for webhook lookup
    await supabase
      .from('orders')
      .update({ razorpay_order_id: razorpayOrder.id })
      .eq('id', order_id);

    return NextResponse.json({
      order_id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      // Return the KEY ID (public) for the Razorpay checkout modal
      // This tells the modal which Razorpay account to show
      key_id: creds.keyId,
      order_number: order.order_number,
      canteen_name: (order.canteen as unknown as { name: string } | null)?.name ?? 'Canteen',
    });
  } catch (err) {
    console.error('Payment create error:', err);
    return NextResponse.json({ error: 'internal_error', message: 'Failed to create payment order' }, { status: 500 });
  }
}
