import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { computeCanteenAddon } from '@/lib/subscription-pricing';
import { getCallerInstitute } from '@/lib/subscription-actions';
import { createRazorpayOrder, razorpayConfigured, razorpayKeyId } from '@/lib/razorpay';
import type { BillingCycle } from '@/lib/subscription-pricing';

type RouteContext = { params: { id: string } };

// Resume payment for a canteen whose add-on payment was left unfinished.
// Recomputes a FRESH prorated quote for the days remaining now (the original
// amount goes stale as the period elapses), replaces the canteen's unpaid
// invoice, and returns a new Razorpay order. Activation reuses /subscriptions/verify.
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });

  const service = createServiceClient();
  const profile = await getCallerInstitute(service, user.id);
  if (!profile || !profile.is_active || !['canteen_admin', 'super_admin'].includes(profile.role)) {
    return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } }, { status: 403 });
  }
  if (!razorpayConfigured()) {
    return NextResponse.json({ success: false, error: { code: 'PAYMENT_NOT_CONFIGURED', message: 'Subscription payments are not configured yet. Contact MunchAdda.' } }, { status: 503 });
  }

  // Load the target canteen and enforce ownership + pending state.
  const { data: canteen } = await service
    .from('canteens')
    .select('id, name, institute_id, billing_state')
    .eq('id', params.id)
    .single();
  if (!canteen) {
    return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Canteen not found' } }, { status: 404 });
  }
  if (profile.role === 'canteen_admin' && canteen.institute_id !== profile.institute_id) {
    return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot manage this canteen' } }, { status: 403 });
  }
  if (canteen.billing_state !== 'pending_payment') {
    return NextResponse.json({ success: false, error: { code: 'NOT_PENDING', message: 'This canteen is not awaiting payment.' } }, { status: 409 });
  }

  const instituteId = canteen.institute_id;

  const { data: sub } = await service
    .from('institute_subscriptions')
    .select('status, billing_cycle, current_period_start, current_period_end')
    .eq('institute_id', instituteId)
    .maybeSingle();

  const now = new Date();
  const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end) : null;
  const active = sub?.status === 'active' && periodEnd !== null && periodEnd.getTime() > now.getTime();
  if (!active || !sub?.current_period_start) {
    return NextResponse.json({ success: false, error: { code: 'NOT_ACTIVE', message: 'You need an active subscription to activate a canteen. Renew from Billing first.' } }, { status: 403 });
  }

  const quote = computeCanteenAddon(sub.billing_cycle as BillingCycle, new Date(sub.current_period_start), periodEnd as Date, now);

  // Drop the canteen's stale UNPAID invoice(s) so a fresh one reflects the new
  // quote. Never touch an invoice that already carries a captured payment id.
  await service
    .from('subscription_invoices')
    .delete()
    .eq('canteen_id', canteen.id)
    .eq('status', 'pending')
    .is('razorpay_payment_id', null);

  // Free case: nothing left to charge (adding on the last day). Activate now.
  if (quote.totalPaise <= 0) {
    await service.from('subscription_invoices').insert({
      institute_id: instituteId,
      canteen_id: canteen.id,
      billing_cycle: sub.billing_cycle,
      period_start: now.toISOString(),
      period_end: periodEnd!.toISOString(),
      subtotal_paise: 0, gst_paise: 0, total_paise: 0,
      status: 'paid', method: 'comp',
      notes: `Canteen add-on (comp): ${canteen.name}`,
    });
    await service.from('canteens').update({ is_active: true, billing_state: 'active' }).eq('id', canteen.id);
    return NextResponse.json({ success: true, data: { paid: false, free: true, canteen_id: canteen.id } });
  }

  let order;
  try {
    order = await createRazorpayOrder(quote.totalPaise, `cadd_${instituteId.slice(0, 8)}`);
  } catch (e) {
    console.error('[canteens/resume-payment] razorpay error', e);
    return NextResponse.json({ success: false, error: { code: 'PAYMENT_ERROR', message: 'Could not start payment. Try again.' } }, { status: 502 });
  }

  await service.from('subscription_invoices').insert({
    institute_id: instituteId,
    canteen_id: canteen.id,
    billing_cycle: sub.billing_cycle,
    period_start: now.toISOString(),
    period_end: periodEnd!.toISOString(),
    subtotal_paise: quote.subtotalPaise,
    gst_paise: quote.gstPaise,
    total_paise: quote.totalPaise,
    status: 'pending', method: 'razorpay',
    razorpay_order_id: order.id,
    notes: `Canteen add-on (resumed): ${canteen.name}`,
  });

  return NextResponse.json({
    success: true,
    data: {
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: razorpayKeyId(),
      total_paise: quote.totalPaise,
      canteen_id: canteen.id,
    },
  });
}
