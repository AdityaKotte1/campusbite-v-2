import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { computeCanteenAddon } from '@/lib/subscription-pricing';
import { getCallerInstitute } from '@/lib/subscription-actions';
import { razorpayConfigured } from '@/lib/razorpay';
import type { BillingCycle } from '@/lib/subscription-pricing';

// Prorated quote + eligibility for adding one canteen to the caller's institute.
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 });

  const service = createServiceClient();
  const profile = await getCallerInstitute(service, user.id);
  if (!profile || !profile.is_active || !['canteen_admin', 'super_admin'].includes(profile.role)) {
    return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } }, { status: 403 });
  }
  if (!profile.institute_id) {
    return NextResponse.json({ success: true, data: { allowed: false, reason: 'no_institute' } });
  }
  if (!razorpayConfigured()) {
    return NextResponse.json({ success: true, data: { allowed: false, reason: 'razorpay_disabled' } });
  }

  const { data: sub } = await service
    .from('institute_subscriptions')
    .select('status, billing_cycle, current_period_start, current_period_end')
    .eq('institute_id', profile.institute_id)
    .maybeSingle();

  const now = new Date();
  const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end) : null;
  const active = sub?.status === 'active' && periodEnd !== null && periodEnd.getTime() > now.getTime();
  if (!active || !sub?.current_period_start) {
    return NextResponse.json({ success: true, data: { allowed: false, reason: 'not_active' } });
  }

  const quote = computeCanteenAddon(
    sub.billing_cycle as BillingCycle,
    new Date(sub.current_period_start),
    periodEnd as Date,
    now
  );
  return NextResponse.json({ success: true, data: { allowed: true, quote, cycle: sub.billing_cycle, period_end: sub.current_period_end } });
}
