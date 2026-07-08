import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import {
  computeSubscription,
  derivePlanCode,
  type BillingCycle,
  CYCLE_CONFIG,
} from '@/lib/subscription-pricing';
import { getInstituteCounts } from '@/lib/subscription-actions';

// Only super_admin manages institute subscriptions.
async function requireSuperAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 }) };

  const service = createServiceClient();
  const { data: profile } = await service.from('users').select('role, is_active').eq('id', user.id).single();
  if (!profile || profile.role !== 'super_admin' || !profile.is_active) {
    return { error: NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Super admin access required' } }, { status: 403 }) };
  }
  return { user, service };
}

// ─── GET — list every institute with its subscription + live counts ───────────
export async function GET() {
  const auth = await requireSuperAdmin();
  if ('error' in auth) return auth.error;
  const { service } = auth;

  const [overviewRes, subsRes] = await Promise.all([
    service.rpc('institute_subscription_overview'),
    service.from('institute_subscriptions').select('*'),
  ]);

  if (overviewRes.error) {
    return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: overviewRes.error.message } }, { status: 500 });
  }

  const subsByInstitute = new Map<string, Record<string, unknown>>();
  for (const s of subsRes.data ?? []) subsByInstitute.set(s.institute_id as string, s);

  const rows = (overviewRes.data ?? []).map((o: Record<string, unknown>) => ({
    institute_id: o.institute_id,
    institute_name: o.institute_name,
    is_active_subscriber: o.is_active_subscriber,
    subscription_status: o.subscription_status,
    canteen_count: Number(o.canteen_count ?? 0),
    student_count: Number(o.student_count ?? 0),
    subscription: subsByInstitute.get(o.institute_id as string) ?? null,
  }));

  return NextResponse.json({ success: true, data: rows });
}

// ─── POST — create / activate / extend / cancel a subscription ────────────────
// Body: { institute_id, action: 'trial'|'activate'|'extend'|'cancel'|'expire',
//         billing_cycle?, mark_paid?, notes? }
export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin();
  if ('error' in auth) return auth.error;
  const { user, service } = auth;

  const body = await request.json();
  const { institute_id, action, billing_cycle, mark_paid, notes } = body as {
    institute_id?: string;
    action?: string;
    billing_cycle?: BillingCycle;
    mark_paid?: boolean;
    notes?: string;
  };

  if (!institute_id || !action) {
    return NextResponse.json({ success: false, error: { code: 'INVALID_INPUT', message: 'institute_id and action are required' } }, { status: 400 });
  }

  // Live counts (authoritative — drives pricing & plan). Uses the shared helper
  // so this matches every other billing path (self-serve checkout, the overview
  // RPC): only `billing_state='active'` canteens are billable. A pending_payment
  // (unpaid) canteen must never be charged for.
  const { canteens: canteensCount, students: studentsCount } = await getInstituteCounts(service, institute_id);

  const { data: existing } = await service.from('institute_subscriptions').select('*').eq('institute_id', institute_id).maybeSingle();

  const now = new Date();
  const addMonths = (d: Date, m: number) => {
    const r = new Date(d);
    r.setMonth(r.getMonth() + m);
    return r;
  };

  let payload: Record<string, unknown> = { institute_id, updated_at: now.toISOString() };
  let invoice: Record<string, unknown> | null = null;

  if (action === 'cancel' || action === 'expire') {
    payload.status = action === 'cancel' ? 'cancelled' : 'expired';
  } else if (action === 'trial') {
    const end = new Date(now);
    end.setDate(end.getDate() + 30);
    payload = {
      ...payload,
      plan_code: derivePlanCode(canteensCount, studentsCount),
      billing_cycle: 'monthly',
      canteens_count: canteensCount,
      students_count: studentsCount,
      base_amount_paise: 0,
      discount_pct: 0,
      subtotal_paise: 0,
      gst_paise: 0,
      total_paise: 0,
      status: 'trialing',
      trial_ends_at: end.toISOString(),
      current_period_start: now.toISOString(),
      current_period_end: end.toISOString(),
    };
  } else if (action === 'activate' || action === 'extend') {
    const cycle: BillingCycle = (billing_cycle ?? 'monthly') as BillingCycle;
    if (!CYCLE_CONFIG[cycle]) {
      return NextResponse.json({ success: false, error: { code: 'INVALID_INPUT', message: 'Invalid billing_cycle' } }, { status: 400 });
    }
    const q = computeSubscription(canteensCount, studentsCount, cycle);
    // extend continues from the current period end if it's still in the future
    const startBase = action === 'extend' && existing?.current_period_end && new Date(existing.current_period_end as string) > now
      ? new Date(existing.current_period_end as string)
      : now;
    const periodStart = action === 'extend' ? now : startBase;
    const periodEnd = addMonths(startBase, q.months);

    payload = {
      ...payload,
      plan_code: q.planCode,
      billing_cycle: cycle,
      canteens_count: canteensCount,
      students_count: studentsCount,
      base_amount_paise: q.monthlyBasePaise,
      discount_pct: q.discountPct,
      subtotal_paise: q.subtotalPaise,
      gst_paise: q.gstPaise,
      total_paise: q.totalPaise,
      status: 'active',
      current_period_start: (existing?.current_period_start && action === 'extend') ? existing.current_period_start : periodStart.toISOString(),
      current_period_end: periodEnd.toISOString(),
    };
    invoice = {
      institute_id,
      billing_cycle: cycle,
      period_start: startBase.toISOString(),
      period_end: periodEnd.toISOString(),
      subtotal_paise: q.subtotalPaise,
      gst_paise: q.gstPaise,
      total_paise: q.totalPaise,
      status: mark_paid ? 'paid' : 'pending',
      method: 'manual',
      notes: notes ?? null,
    };
  } else {
    return NextResponse.json({ success: false, error: { code: 'INVALID_INPUT', message: 'Unknown action' } }, { status: 400 });
  }

  // Upsert the single subscription row for this institute
  const { data: sub, error: upsertErr } = await service
    .from('institute_subscriptions')
    .upsert(payload, { onConflict: 'institute_id' })
    .select()
    .single();

  if (upsertErr) {
    return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: upsertErr.message } }, { status: 500 });
  }

  if (invoice) {
    invoice.subscription_id = sub.id;
    await service.from('subscription_invoices').insert(invoice);
  }

  await service.from('audit_logs').insert({
    user_id: user.id,
    action: `subscription.${action}`,
    entity_type: 'institute',
    entity_id: institute_id,
    metadata: { billing_cycle: payload.billing_cycle, total_paise: payload.total_paise, mark_paid: !!mark_paid },
  });

  return NextResponse.json({ success: true, data: sub });
}
