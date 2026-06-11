import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { computeSubscription, CYCLE_CONFIG, type BillingCycle } from '@/lib/subscription-pricing';
import { getInstituteCounts, getCallerInstitute } from '@/lib/subscription-actions';
import { createRazorpayOrder, razorpayConfigured, razorpayKeyId } from '@/lib/razorpay';

// Create a Razorpay order for the caller's institute subscription, and record a
// pending invoice so verification can settle exactly what was charged.
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
    return NextResponse.json({ success: false, error: { code: 'PAYMENT_NOT_CONFIGURED', message: 'Subscription payments are not configured yet. Contact CampusBite.' } }, { status: 503 });
  }

  const body = await request.json();
  const cycle = body.cycle as BillingCycle;
  if (!CYCLE_CONFIG[cycle]) {
    return NextResponse.json({ success: false, error: { code: 'INVALID_INPUT', message: 'Invalid billing cycle' } }, { status: 400 });
  }

  const counts = await getInstituteCounts(service, instituteId);
  const q = computeSubscription(counts.canteens, counts.students, cycle);

  let order;
  try {
    order = await createRazorpayOrder(q.totalPaise, `sub_${instituteId.slice(0, 8)}_${cycle}`);
  } catch (e) {
    console.error('[subscriptions/checkout] razorpay error', e);
    return NextResponse.json({ success: false, error: { code: 'PAYMENT_ERROR', message: 'Could not start payment. Try again.' } }, { status: 502 });
  }

  const now = new Date();
  const end = new Date(now);
  end.setMonth(end.getMonth() + q.months);

  await service.from('subscription_invoices').insert({
    institute_id: instituteId,
    billing_cycle: cycle,
    period_start: now.toISOString(),
    period_end: end.toISOString(),
    subtotal_paise: q.subtotalPaise,
    gst_paise: q.gstPaise,
    total_paise: q.totalPaise,
    status: 'pending',
    method: 'razorpay',
    razorpay_order_id: order.id,
  });

  return NextResponse.json({
    success: true,
    data: {
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: razorpayKeyId(),
      total_paise: q.totalPaise,
    },
  });
}
