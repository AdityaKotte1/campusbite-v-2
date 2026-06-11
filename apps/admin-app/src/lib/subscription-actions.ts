// Shared server helpers for subscription lifecycle (used by the institute
// self-serve checkout/verify routes).

import type { SupabaseClient } from '@supabase/supabase-js';
import { computeSubscription, type BillingCycle } from './subscription-pricing';

export async function getInstituteCounts(service: SupabaseClient, instituteId: string) {
  const [{ count: canteens }, { count: students }] = await Promise.all([
    service.from('canteens').select('id', { count: 'exact', head: true }).eq('institute_id', instituteId),
    service.from('users').select('id', { count: 'exact', head: true }).eq('institute_id', instituteId).eq('role', 'student'),
  ]);
  return { canteens: canteens ?? 0, students: students ?? 0 };
}

/** Resolve the institute the caller is allowed to bill, and their role. */
export async function getCallerInstitute(service: SupabaseClient, userId: string) {
  const { data } = await service.from('users').select('role, is_active, institute_id').eq('id', userId).single();
  return data as { role: string; is_active: boolean; institute_id: string | null } | null;
}

/**
 * Activate a paid subscription from a settled invoice's stored amounts (so the
 * activated period/amount always matches what was actually charged).
 */
export async function activateFromInvoice(
  service: SupabaseClient,
  invoice: {
    id: string;
    institute_id: string;
    billing_cycle: string;
    subtotal_paise: number;
    gst_paise: number;
    total_paise: number;
    base_amount_paise?: number;
  },
  canteens: number,
  students: number,
  razorpayPaymentId: string
) {
  const cycle = invoice.billing_cycle as BillingCycle;
  const q = computeSubscription(canteens, students, cycle); // for plan_code + months
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + q.months);

  const { data: sub, error } = await service
    .from('institute_subscriptions')
    .upsert(
      {
        institute_id: invoice.institute_id,
        plan_code: q.planCode,
        billing_cycle: cycle,
        canteens_count: canteens,
        students_count: students,
        base_amount_paise: q.monthlyBasePaise,
        discount_pct: q.discountPct,
        subtotal_paise: invoice.subtotal_paise,
        gst_paise: invoice.gst_paise,
        total_paise: invoice.total_paise,
        status: 'active',
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        razorpay_payment_id: razorpayPaymentId,
        updated_at: now.toISOString(),
      },
      { onConflict: 'institute_id' }
    )
    .select()
    .single();

  if (error) throw new Error(error.message);

  await service
    .from('subscription_invoices')
    .update({
      status: 'paid',
      razorpay_payment_id: razorpayPaymentId,
      period_start: now.toISOString(),
      period_end: periodEnd.toISOString(),
      subscription_id: sub.id,
    })
    .eq('id', invoice.id);

  return sub;
}
