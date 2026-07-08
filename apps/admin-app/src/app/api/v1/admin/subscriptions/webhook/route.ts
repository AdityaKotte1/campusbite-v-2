import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { createServiceClient } from '@/lib/supabase/server';
import { getInstituteCounts, activateFromInvoice, activateAddonCanteen } from '@/lib/subscription-actions';

// Razorpay webhook for INSTITUTE SUBSCRIPTION payments (platform account).
// Backstop for the synchronous /verify handler: if the institute admin closes
// the browser after paying, Razorpay still delivers payment.captured here and we
// activate the subscription from the pending invoice. Idempotent.
//
// Configure in the PLATFORM Razorpay dashboard → Webhooks:
//   URL:    https://cbadmin.innvera.online/api/v1/admin/subscriptions/webhook
//   Secret: must equal admin env RAZORPAY_WEBHOOK_SECRET
//   Events: payment.captured (and payment.failed)
export async function POST(request: Request) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-razorpay-signature');
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!secret) {
      console.error('[subscriptions/webhook] RAZORPAY_WEBHOOK_SECRET not set');
      return NextResponse.json({ error: 'server_misconfiguration' }, { status: 500 });
    }
    if (!signature) {
      return NextResponse.json({ error: 'missing_signature' }, { status: 400 });
    }

    const expected = createHmac('sha256', secret).update(body).digest('hex');
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
    }

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(body);
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }

    if (event.event === 'payment.captured') {
      const paymentEntity = ((event.payload as Record<string, unknown>)?.payment as Record<string, unknown>)?.entity as
        | Record<string, unknown>
        | undefined;
      const orderId = paymentEntity?.order_id as string | undefined;
      const paymentId = paymentEntity?.id as string | undefined;

      if (orderId && paymentId) {
        const service = createServiceClient();
        const { data: invoice } = await service
          .from('subscription_invoices')
          .select('*')
          .eq('razorpay_order_id', orderId)
          .maybeSingle();

        // Only act on a still-pending invoice (idempotent vs the /verify path).
        if (invoice && invoice.status === 'pending') {
          // Never activate unless what was actually captured matches the invoice.
          const amount = paymentEntity?.amount as number | undefined;
          const currency = paymentEntity?.currency as string | undefined;
          if (amount !== invoice.total_paise || currency !== 'INR') {
            console.error('[subscriptions/webhook] captured amount mismatch — skipping activation', {
              orderId,
              paymentId,
              amount,
              currency,
              expected: invoice.total_paise,
            });
            return NextResponse.json({ received: true, skipped: 'amount_mismatch' });
          }
          if (invoice.canteen_id) {
            // Add-on canteen payment — activate the canteen, don't touch the plan.
            await activateAddonCanteen(service, invoice.institute_id, invoice.canteen_id, invoice.id, paymentId);
          } else {
            const counts = await getInstituteCounts(service, invoice.institute_id);
            await activateFromInvoice(service, invoice, counts.canteens, counts.students, paymentId);
          }
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[subscriptions/webhook] error', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
