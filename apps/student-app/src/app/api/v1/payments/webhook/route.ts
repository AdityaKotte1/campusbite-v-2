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

        // SECURITY: bind the captured payment to the order before marking it
        // paid. Load the order by its razorpay_order_id and require BOTH that it
        // belongs to the canteen whose secret verified this event AND that the
        // captured amount matches the order total. This prevents a forged
        // payload (signed with one canteen's secret) from settling another
        // canteen's order, or settling an order at an attacker-chosen amount.
        const { data: capturedOrder } = await service
          .from('orders')
          .select('id, canteen_id, total_paise')
          .eq('razorpay_order_id', paymentEntity.order_id)
          .single();

        if (!capturedOrder) {
          return NextResponse.json({ error: 'order_not_found' }, { status: 400 });
        }

        if (
          (canteenId && capturedOrder.canteen_id !== canteenId) ||
          paymentEntity.amount !== capturedOrder.total_paise
        ) {
          return NextResponse.json({ error: 'payment_mismatch' }, { status: 400 });
        }

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

        // Resolve the order so we can return its reserved stock after marking it
        // failed. The stock was decremented at order creation.
        const { data: failedOrder } = await service
          .from('orders')
          .select('id')
          .eq('razorpay_order_id', paymentEntity.order_id)
          .single();

        await service
          .from('orders')
          .update({ payment_status: 'failed', status: 'payment_failed' })
          .eq('razorpay_order_id', paymentEntity.order_id)
          .eq('payment_status', 'pending');

        await service
          .from('payment_transactions')
          .update({ status: 'failed', gateway_response: paymentEntity })
          .eq('razorpay_order_id', paymentEntity.order_id);

        // Return the reserved stock. Idempotent + service-only; log but don't throw.
        if (failedOrder) {
          const { error: restockErr } = await service.rpc('restock_order', { p_order_id: failedOrder.id });
          if (restockErr) {
            console.error('[webhook payment.failed] restock error:', restockErr);
          }
        }

        break;
      }

      case 'refund.created': {
        const refundEntity = ((event.payload as Record<string, unknown>)?.refund as Record<string, unknown>)?.entity as Record<string, unknown> | undefined;
        if (!refundEntity) break;

        // Resolve the order this refund belongs to. The previous code compared
        // the order-id column to a PAYMENT id, so it never matched. Prefer the
        // refund's notes.order_id (our orders PK, set when the Razorpay order was
        // created); otherwise resolve via the payment_transactions row whose
        // razorpay_payment_id matches the refund's payment_id.
        const refundNotes = refundEntity.notes as Record<string, unknown> | undefined;
        let orderId = refundNotes?.order_id as string | undefined;

        if (!orderId) {
          const paymentId = refundEntity.payment_id as string | undefined;
          if (paymentId) {
            const { data: txn } = await service
              .from('payment_transactions')
              .select('order_id')
              .eq('razorpay_payment_id', paymentId)
              .single();
            orderId = txn?.order_id ?? undefined;
          }
        }

        if (!orderId) break;

        await service
          .from('orders')
          .update({ payment_status: 'refunded', status: 'refunded' })
          .eq('id', orderId);
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
