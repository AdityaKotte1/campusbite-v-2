// MunchAdda subscription pricing — single source of truth (used by the admin
// API to compute charges and by the UI to preview them). All amounts in paise.

export type BillingCycle = 'monthly' | 'biannual' | 'annual';

export const BASE_PER_CANTEEN_PAISE = 200000; // ₹2,000 / canteen / month
export const GST_RATE = 0.18;

// GST master switch for subscription billing. OFF for now → institutes are
// charged the base amount only and invoices store gst_paise = 0. Flip to `true`
// and redeploy to start adding 18% GST to new charges; invoices created after
// that store + display the GST line. (Past invoices keep what they were charged.)
export const SUBSCRIPTION_GST_ENABLED = false;

export const CYCLE_CONFIG: Record<BillingCycle, { months: number; discountPct: number; label: string }> = {
  monthly: { months: 1, discountPct: 0, label: 'Monthly' },
  biannual: { months: 6, discountPct: 0.1, label: '6 Months (10% off)' },
  annual: { months: 12, discountPct: 0.15, label: 'Annual (15% off)' },
};

/** Per-institute student-usage add-on (per month, paise). */
export function studentTierAddonPaise(students: number): number {
  if (students <= 1000) return 0;
  if (students <= 5000) return 150000; // ₹1,500
  if (students <= 15000) return 400000; // ₹4,000
  return 800000; // ₹8,000
}

export function studentTierLabel(students: number): string {
  if (students <= 1000) return '≤ 1,000';
  if (students <= 5000) return '1,001–5,000';
  if (students <= 15000) return '5,001–15,000';
  return '15,000+';
}

/** Map a config to a named plan (display only). */
export function derivePlanCode(canteens: number, students: number): string {
  if (canteens <= 1 && students <= 1000) return 'starter';
  if (canteens <= 3 && students <= 5000) return 'growth';
  if (canteens <= 6 && students <= 15000) return 'campus';
  return 'enterprise';
}

export interface SubscriptionQuote {
  cycle: BillingCycle;
  canteens: number;
  students: number;
  planCode: string;
  monthlyBasePaise: number; // canteens*base + student tier (per month)
  months: number;
  discountPct: number;
  subtotalPaise: number; // whole cycle, pre-GST
  gstPaise: number;
  totalPaise: number; // cycle total, incl GST
}

export function computeSubscription(
  canteens: number,
  students: number,
  cycle: BillingCycle
): SubscriptionQuote {
  const c = CYCLE_CONFIG[cycle];
  const monthlyBase = Math.max(1, canteens) * BASE_PER_CANTEEN_PAISE + studentTierAddonPaise(students);
  const gross = monthlyBase * c.months;
  const subtotal = Math.round(gross * (1 - c.discountPct));
  const gst = SUBSCRIPTION_GST_ENABLED ? Math.round(subtotal * GST_RATE) : 0;
  return {
    cycle,
    canteens,
    students,
    planCode: derivePlanCode(canteens, students),
    monthlyBasePaise: monthlyBase,
    months: c.months,
    discountPct: c.discountPct,
    subtotalPaise: subtotal,
    gstPaise: gst,
    totalPaise: subtotal + gst,
  };
}

/** Format paise as an Indian-rupee string, e.g. ₹2,000 or ₹10,800.50 */
export function formatPaise(paise: number): string {
  const r = paise / 100;
  return (
    '₹' +
    r.toLocaleString('en-IN', {
      minimumFractionDigits: r % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })
  );
}
