import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';
import { getRazorpayForCanteen } from '@/lib/razorpay-config';

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-razorpay-signature');
    if (!signature) {
      return NextResponse.json({ error: 'missing_signature' }, { status: 400 });
    }

    const service = createServiceClient();

    // Parse event early so we can look up the canteen
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(body);
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }

    // ── Resolve the right webhook secret for this event ──────────────────────
    // The event's order was created with a specific canteen's Razorpay account.
    // We stored canteen_id in the Razorpay order notes when creating the order.
    let webhookSecret: string | null = null;

    const eventType = event.event as string;
    const payment = (event.payload as Record<string, unknown>)?.payment as Record<string, unknown> | undefined;
    const paymentEntity = payment?.entity as Record<string, unknown> | undefined;
    const notes = paymentEntity?.notes as Record<string, unknown> | undefined;
    const canteenId = notes?.canteen_id as string | undefined;

    if (canteenId) {
      try {
        const creds = await getRazorpayForCanteen(canteenId, service);
        webhookSecret = creds.webhookSecret;
      } catch {
        // Fall through to platform secret
      }
    }

    // Fall back to platform webhook secret if canteen didn't have one
    if (!webhookSecret) {
      webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET ?? null;
    }

    if (!webhookSecret) {
      console.error('FATAL: No webhook secret found for this event. canteen_id:', canteenId);
      return NextResponse.json({ error: 'server_misconfiguration' }, { status: 500 });
    }

    // ── Verify HMAC signature ─────────────────────────────────────────────────
    const expected = createHmac('sha256', webhookSecret).update(body).digest('hex');
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');

    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
    }

    // ── Handle event ──────────────────────────────────────────────────────────
    switch (eventType) {
      case 'payment.captured': {
        if (!paymentEntity) break;
        const orderId = notes?.order_id as string | undefined;
        if (!orderId) break;

        // Idempotent update — only if still pending
        await service
          .from('orders')
          .update({ payment_status: 'paid', status: 'confirmed', razorpay_payment_id: paymentEntity.id })
          .eq('razorpay_order_id', paymentEntity.order_id)
          .eq('payment_status', 'pending');

        await service
          .from('payment_transactions')
          .update({ status: 'paid', gateway_response: paymentEntity })
          .eq('razorpay_order_id', paymentEntity.order_id);

        break;
      }

      case 'payment.failed': {
        if (!paymentEntity) break;
        await service
          .from('orders')
          .update({ payment_status: 'failed', status: 'payment_failed' })
          .eq('razorpay_order_id', paymentEntity.order_id)
          .eq('payment_status', 'pending');

        await service
          .from('payment_transactions')
          .update({ status: 'failed', gateway_response: paymentEntity })
          .eq('razorpay_order_id', paymentEntity.order_id);

        break;
      }

      case 'refund.created': {
        const refundEntity = ((event.payload as Record<string, unknown>)?.refund as Record<string, unknown>)?.entity as Record<string, unknown> | undefined;
        if (!refundEntity) break;
        await service
          .from('orders')
          .update({ payment_status: 'refunded', status: 'refunded' })
          .eq('razorpay_order_id', refundEntity.payment_id);
        break;
      }

      default:
        // Silently acknowledge unknown events
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
