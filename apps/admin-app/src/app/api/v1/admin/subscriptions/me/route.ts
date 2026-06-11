import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { computeSubscription, type BillingCycle } from '@/lib/subscription-pricing';
import { getInstituteCounts, getCallerInstitute } from '@/lib/subscription-actions';
import { razorpayConfigured } from '@/lib/razorpay';

// The caller's own institute subscription + invoices + price quotes.
export async function GET() {
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

  const counts = await getInstituteCounts(service, instituteId);
  const [subRes, invRes, instRes] = await Promise.all([
    service.from('institute_subscriptions').select('*').eq('institute_id', instituteId).maybeSingle(),
    service.from('subscription_invoices').select('*').eq('institute_id', instituteId).order('created_at', { ascending: false }).limit(24),
    service.from('institutes').select('id, name').eq('id', instituteId).single(),
  ]);

  const cycles: BillingCycle[] = ['monthly', 'biannual', 'annual'];
  const quotes = cycles.map((c) => computeSubscription(counts.canteens, counts.students, c));

  return NextResponse.json({
    success: true,
    data: {
      institute: instRes.data,
      canteens: counts.canteens,
      students: counts.students,
      subscription: subRes.data ?? null,
      invoices: invRes.data ?? [],
      quotes,
      razorpay_enabled: razorpayConfigured(),
    },
  });
}
