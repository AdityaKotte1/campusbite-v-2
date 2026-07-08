import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { computeCanteenAddon } from '@/lib/subscription-pricing';
import { getCallerInstitute } from '@/lib/subscription-actions';
import { createRazorpayOrder, razorpayConfigured, razorpayKeyId } from '@/lib/razorpay';
import type { BillingCycle } from '@/lib/subscription-pricing';

// Create a pending (inactive) canteen + prorated invoice + Razorpay order.
// The canteen is activated by /subscriptions/verify once payment succeeds.
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
  if (!razorpayConfigured()) {
    return NextResponse.json({ success: false, error: { code: 'PAYMENT_NOT_CONFIGURED', message: 'Subscription payments are not configured yet. Contact MunchAdda.' } }, { status: 503 });
  }

  const body = await request.json();
  const { name, location, description, opening_time, closing_time, image_url } = body;
  if (!name || !location || !opening_time || !closing_time) {
    return NextResponse.json({ success: false, error: { code: 'VALIDATION', message: 'name, location, opening_time, closing_time are required' } }, { status: 400 });
  }

  const { data: sub } = await service
    .from('institute_subscriptions')
    .select('status, billing_cycle, current_period_start, current_period_end')
    .eq('institute_id', instituteId)
    .maybeSingle();

  const now = new Date();
  const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end) : null;
  const active = sub?.status === 'active' && periodEnd !== null && periodEnd.getTime() > now.getTime();
  if (!active || !sub?.current_period_start) {
    return NextResponse.json({ success: false, error: { code: 'NOT_ACTIVE', message: 'You need an active subscription to add a canteen. Renew from Billing first.' } }, { status: 403 });
  }

  const quote = computeCanteenAddon(sub.billing_cycle as BillingCycle, new Date(sub.current_period_start), periodEnd as Date, now);

  // One pending canteen at a time. A pending_payment canteen is now a first-class,
  // resumable list item (Complete Payment / Discard), so we no longer silently
  // delete an abandoned one — instead refuse to create a second. The admin must
  // complete or discard the existing pending canteen first.
  const { data: pending } = await service
    .from('canteens')
    .select('id')
    .eq('institute_id', instituteId)
    .eq('billing_state', 'pending_payment')
    .limit(1);
  if (pending && pending.length > 0) {
    return NextResponse.json({ success: false, error: { code: 'PENDING_EXISTS', message: 'You already have a canteen awaiting payment. Complete or discard it first.' } }, { status: 409 });
  }

  const code = (name as string).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const { data: canteen, error: canteenErr } = await service
    .from('canteens')
    .insert({
      institute_id: instituteId,
      name, code, location,
      description: description || null,
      opens_at: opening_time,
      closes_at: closing_time,
      image_url: image_url || null,
      is_active: false,
      is_open: false,
      billing_state: 'pending_payment',
      rating: 0,
      total_reviews: 0,
    })
    .select('id')
    .single();
  if (canteenErr || !canteen) {
    return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: canteenErr?.message ?? 'Could not create canteen' } }, { status: 500 });
  }

  // Free case: nothing to charge (adding on the last day). Activate immediately.
  if (quote.totalPaise <= 0) {
    await service.from('subscription_invoices').insert({
      institute_id: instituteId,
      canteen_id: canteen.id,
      billing_cycle: sub.billing_cycle,
      period_start: now.toISOString(),
      period_end: periodEnd!.toISOString(),
      subtotal_paise: 0, gst_paise: 0, total_paise: 0,
      status: 'paid', method: 'comp',
      notes: `Canteen add-on (comp): ${name}`,
    });
    await service.from('canteens').update({ is_active: true, billing_state: 'active' }).eq('id', canteen.id);
    return NextResponse.json({ success: true, data: { paid: false, free: true, canteen_id: canteen.id } });
  }

  let order;
  try {
    order = await createRazorpayOrder(quote.totalPaise, `cadd_${instituteId.slice(0, 8)}`);
  } catch (e) {
    console.error('[canteens/add-on/checkout] razorpay error', e);
    await service.from('canteens').delete().eq('id', canteen.id); // roll back the pending canteen
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
    notes: `Canteen add-on: ${name}`,
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
