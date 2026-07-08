import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { verifyRazorpaySignature } from '@/lib/razorpay';
import { getInstituteCounts, getCallerInstitute, activateFromInvoice, activateAddonCanteen } from '@/lib/subscription-actions';

// Verify a subscription payment and activate the institute's subscription.
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });

  const service = createServiceClient();
  const profile = await getCallerInstitute(service, user.id);
  if (!profile || !profile.is_active || !['canteen_admin', 'super_admin'].includes(profile.role)) {
    return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } }, { status: 403 });
  }
  const instituteId = profile.institute_id;
  if (!instituteId) {
    return NextResponse.json({ success: false, error: { code: 'NO_INSTITUTE', message: 'Your account is not linked to an institute' } }, { status: 400 });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await request.json();
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return NextResponse.json({ success: false, error: { code: 'INVALID_INPUT', message: 'Missing payment fields' } }, { status: 400 });
  }

  if (!verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    return NextResponse.json({ success: false, error: { code: 'INVALID_SIGNATURE', message: 'Payment signature verification failed' } }, { status: 400 });
  }

  // Settle exactly what was charged: look up the pending invoice for this order.
  const { data: invoice } = await service
    .from('subscription_invoices')
    .select('*')
    .eq('razorpay_order_id', razorpay_order_id)
    .eq('institute_id', instituteId)
    .maybeSingle();

  if (!invoice) {
    return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Matching invoice not found' } }, { status: 404 });
  }
  if (invoice.status === 'paid') {
    return NextResponse.json({ success: true, data: { already: true } }); // idempotent
  }

  // The signature only proves order_id|payment_id — NOT the amount captured.
  // Fetch the real payment entity and refuse to activate unless what Razorpay
  // actually captured equals invoice.total_paise in INR. Fail CLOSED: if we
  // can't positively confirm the amount, do not activate.
  const KEY_ID = process.env.RAZORPAY_KEY_ID;
  const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
  if (!KEY_ID || !KEY_SECRET) {
    console.error('[subscriptions/verify] Razorpay keys not configured — refusing to activate');
    return NextResponse.json({ success: false, error: { code: 'SERVER_MISCONFIGURATION', message: 'Payment verification unavailable' } }, { status: 500 });
  }
  let capturedAmount: number | undefined;
  let capturedCurrency: string | undefined;
  try {
    const payRes = await fetch(`https://api.razorpay.com/v1/payments/${razorpay_payment_id}`, {
      headers: { Authorization: 'Basic ' + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64') },
    });
    if (payRes.ok) {
      const payment = await payRes.json();
      capturedAmount = typeof payment.amount === 'number' ? payment.amount : undefined;
      capturedCurrency = typeof payment.currency === 'string' ? payment.currency : undefined;
    } else {
      console.error(`[subscriptions/verify] failed to fetch payment ${razorpay_payment_id} (${payRes.status})`);
    }
  } catch (e) {
    console.error('[subscriptions/verify] error fetching payment for amount verification', e);
  }
  if (capturedAmount !== invoice.total_paise || capturedCurrency !== 'INR') {
    console.error('[subscriptions/verify] captured amount mismatch', { razorpay_payment_id, capturedAmount, capturedCurrency, expected: invoice.total_paise });
    return NextResponse.json({ success: false, error: { code: 'AMOUNT_MISMATCH', message: 'Captured payment amount does not match the invoice' } }, { status: 402 });
  }

  // Add-on canteen payment: activate that canteen and re-sync the recurring record.
  if (invoice.canteen_id) {
    try {
      await activateAddonCanteen(service, instituteId, invoice.canteen_id, invoice.id, razorpay_payment_id);
    } catch (e) {
      console.error('[subscriptions/verify] canteen add-on activation failed', e);
      return NextResponse.json({ success: false, error: { code: 'ACTIVATION_FAILED', message: 'Payment captured but activation failed. Contact support.' } }, { status: 500 });
    }
    await service.from('audit_logs').insert({
      user_id: user.id,
      action: 'canteen.addon.paid',
      entity_type: 'canteen',
      entity_id: invoice.canteen_id,
      metadata: { total_paise: invoice.total_paise, razorpay_payment_id },
    });
    return NextResponse.json({ success: true, data: { canteen_id: invoice.canteen_id, addon: true } });
  }

  const counts = await getInstituteCounts(service, instituteId);

  let sub;
  try {
    sub = await activateFromInvoice(service, invoice, counts.canteens, counts.students, razorpay_payment_id);
  } catch (e) {
    console.error('[subscriptions/verify] activation failed', e);
    return NextResponse.json({ success: false, error: { code: 'ACTIVATION_FAILED', message: 'Payment captured but activation failed. Contact support.' } }, { status: 500 });
  }

  await service.from('audit_logs').insert({
    user_id: user.id,
    action: 'subscription.paid',
    entity_type: 'institute',
    entity_id: instituteId,
    metadata: { billing_cycle: invoice.billing_cycle, total_paise: invoice.total_paise, razorpay_payment_id },
  });

  return NextResponse.json({ success: true, data: sub });
}
