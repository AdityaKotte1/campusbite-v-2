# Add-Canteen Prorated Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a `canteen_admin` add a canteen from their dashboard, paying a prorated amount for the days remaining in the current plan period; the canteen only becomes active once payment is verified.

**Architecture:** New pure pricing helper computes the prorate. A checkout endpoint creates the canteen `inactive`/`pending_payment` + a pending invoice + a Razorpay order; the existing subscriptions `verify` endpoint is extended to activate an add-on canteen and bump the recurring count. The plain create endpoint is locked to `super_admin`. UI adds an "Add Canteen" dialog that runs the Razorpay flow.

**Tech Stack:** Next.js 14 App Router (TypeScript), Supabase (service-role client), Razorpay (platform account, REST), TanStack Query, react-hook-form + zod. **No unit-test framework exists** — verification is `npm run type-check`, `npm run lint`, one throwaway `tsx` math check, and manual browser verification.

**Repo note:** All commands run from repo root unless stated. The admin app lives in `apps/admin-app`. Migrations are applied manually in the Supabase SQL editor (see existing `supabase-subscriptions.sql`), so the SQL task ends at "committed + documented to run", not "executed".

---

## File Structure

- Create: `supabase-add-canteen.sql` — schema migration (canteen billing_state, invoice canteen_id, overview fn).
- Modify: `apps/admin-app/src/lib/subscription-pricing.ts` — add `computeCanteenAddon()`.
- Modify: `apps/admin-app/src/lib/subscription-actions.ts` — `getInstituteCounts()` counts active-only canteens; add `activateAddonCanteen()`.
- Modify: `apps/admin-app/src/app/api/v1/admin/canteens/route.ts` — lock `POST` to `super_admin`.
- Create: `apps/admin-app/src/app/api/v1/admin/canteens/add-on/route.ts` — `GET` quote/allowed.
- Create: `apps/admin-app/src/app/api/v1/admin/canteens/add-on/checkout/route.ts` — `POST` create pending canteen + invoice + Razorpay order.
- Modify: `apps/admin-app/src/app/api/v1/admin/subscriptions/verify/route.ts` — branch on `invoice.canteen_id`.
- Create: `apps/admin-app/src/components/canteens/add-canteen-dialog.tsx` — the add dialog + Razorpay flow.
- Modify: `apps/admin-app/src/app/(dashboard)/canteens/page.tsx` — "Add Canteen" button (canteen_admin) wiring the dialog.

---

## Task 1: Schema migration

**Files:**
- Create: `supabase-add-canteen.sql`

- [ ] **Step 1: Write the migration**

Create `supabase-add-canteen.sql`:

```sql
-- ════════════════════════════════════════════════════════════════════════
-- MunchAdda — Self-serve Add Canteen (prorated billing)
-- Run this in the Supabase SQL editor AFTER supabase-subscriptions.sql.
-- ════════════════════════════════════════════════════════════════════════

-- 1. Canteen billing lifecycle. 'active' = counts toward the bill & visible.
--    'pending_payment' = a self-serve canteen awaiting its prorated payment;
--    excluded from billing counts and (being is_active=false) hidden from students.
ALTER TABLE canteens
  ADD COLUMN IF NOT EXISTS billing_state text NOT NULL DEFAULT 'active';

-- 2. Link an add-on invoice to the canteen it pays for (verify uses this).
ALTER TABLE subscription_invoices
  ADD COLUMN IF NOT EXISTS canteen_id uuid REFERENCES canteens(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_canteen ON subscription_invoices(canteen_id);

-- 3. Overview function counts only billing-active canteens.
CREATE OR REPLACE FUNCTION institute_subscription_overview()
RETURNS TABLE (
  institute_id         uuid,
  institute_name       text,
  is_active_subscriber boolean,
  subscription_status  text,
  canteen_count        bigint,
  student_count        bigint
) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.name, i.is_active_subscriber, i.subscription_status,
         (SELECT count(*) FROM canteens c
            WHERE c.institute_id = i.id AND c.billing_state = 'active'),
         (SELECT count(*) FROM users u
            WHERE u.institute_id = i.id AND u.role = 'student')
    FROM institutes i
   ORDER BY i.name;
$$;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Commit**

```bash
git add supabase-add-canteen.sql
git commit -m "feat(billing): migration for canteen billing_state + invoice canteen_id"
```

- [ ] **Step 3: Record that it must be run**

Note for the operator: this migration must be executed in the Supabase SQL editor before deploy (same as other migrations). Add a bullet to the pending-migrations memory during handoff.

---

## Task 2: `computeCanteenAddon` pricing helper

**Files:**
- Modify: `apps/admin-app/src/lib/subscription-pricing.ts`
- Test (throwaway): `apps/admin-app/src/lib/__addon_check.mts`

- [ ] **Step 1: Add the function**

Append to `apps/admin-app/src/lib/subscription-pricing.ts` (uses existing `BASE_PER_CANTEEN_PAISE`, `GST_RATE`, `SUBSCRIPTION_GST_ENABLED`, `CYCLE_CONFIG`, `BillingCycle`):

```ts
export interface CanteenAddonQuote {
  remainingDays: number;
  totalDays: number;
  subtotalPaise: number;
  gstPaise: number;
  totalPaise: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Prorated cost to add ONE canteen for the remainder of the current plan
 * period, at the same cycle discount. At renewal the canteen is included at
 * full rate, so this only charges the leftover days of the running period.
 */
export function computeCanteenAddon(
  cycle: BillingCycle,
  periodStart: Date,
  periodEnd: Date,
  now: Date
): CanteenAddonQuote {
  const c = CYCLE_CONFIG[cycle];
  const fullPeriodPerCanteen = Math.round(BASE_PER_CANTEEN_PAISE * c.months * (1 - c.discountPct));

  const totalDays = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / MS_PER_DAY));
  const rawRemaining = Math.ceil((periodEnd.getTime() - now.getTime()) / MS_PER_DAY);
  const remainingDays = Math.min(totalDays, Math.max(0, rawRemaining));

  const subtotalPaise = Math.round((fullPeriodPerCanteen * remainingDays) / totalDays);
  const gstPaise = SUBSCRIPTION_GST_ENABLED ? Math.round(subtotalPaise * GST_RATE) : 0;

  return { remainingDays, totalDays, subtotalPaise, gstPaise, totalPaise: subtotalPaise + gstPaise };
}
```

- [ ] **Step 2: Write a throwaway math check**

Create `apps/admin-app/src/lib/__addon_check.mts`:

```ts
import { computeCanteenAddon } from './subscription-pricing.ts';
import assert from 'node:assert';

// Annual plan, 300 of 365 days left → 2000*12*0.85 = 20400, *300/365 = 16767
const annual = computeCanteenAddon(
  'annual',
  new Date('2026-01-01T00:00:00Z'),
  new Date('2027-01-01T00:00:00Z'),
  new Date('2026-03-12T00:00:00Z') // 295 days remain to 2027-01-01
);
console.log('annual', annual);
assert(annual.remainingDays > 0 && annual.remainingDays <= annual.totalDays, 'remaining within period');
assert(annual.subtotalPaise > 0 && annual.subtotalPaise < 2040000, 'annual prorate < full-period rate');

// Monthly plan, last day → prorate rounds toward 0
const lastDay = computeCanteenAddon(
  'monthly',
  new Date('2026-06-01T00:00:00Z'),
  new Date('2026-07-01T00:00:00Z'),
  new Date('2026-06-30T12:00:00Z')
);
console.log('lastDay', lastDay);
assert(lastDay.subtotalPaise >= 0 && lastDay.subtotalPaise < 200000, 'partial month < full month');

// GST off by default → gst is 0
assert(annual.gstPaise === 0, 'GST off → 0');
console.log('OK');
```

- [ ] **Step 3: Run the check**

Run: `cd apps/admin-app && npx tsx src/lib/__addon_check.mts`
Expected: prints the two quotes and `OK` with no assertion error.

- [ ] **Step 4: Delete the throwaway and type-check**

```bash
rm apps/admin-app/src/lib/__addon_check.mts
cd apps/admin-app && npm run type-check
```
Expected: type-check passes with no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-app/src/lib/subscription-pricing.ts
git commit -m "feat(billing): computeCanteenAddon prorated pricing helper"
```

---

## Task 3: Active-only counts + add-on activation helper

**Files:**
- Modify: `apps/admin-app/src/lib/subscription-actions.ts`

- [ ] **Step 1: Count only billing-active canteens**

In `apps/admin-app/src/lib/subscription-actions.ts`, change the canteens query inside `getInstituteCounts` to filter `billing_state`:

```ts
export async function getInstituteCounts(service: SupabaseClient, instituteId: string) {
  const [{ count: canteens }, { count: students }] = await Promise.all([
    service
      .from('canteens')
      .select('id', { count: 'exact', head: true })
      .eq('institute_id', instituteId)
      .eq('billing_state', 'active'),
    service.from('users').select('id', { count: 'exact', head: true }).eq('institute_id', instituteId).eq('role', 'student'),
  ]);
  return { canteens: canteens ?? 0, students: students ?? 0 };
}
```

- [ ] **Step 2: Add the add-on activation helper**

Append to the same file (imports `computeSubscription` already present; add `getInstituteCounts` is in-file):

```ts
/**
 * Activate a paid add-on canteen: flip it live, then re-sync the recurring
 * subscription record (count + amounts) to the now-current canteen count.
 * Period dates are unchanged — the add-on only covered the remaining days.
 */
export async function activateAddonCanteen(
  service: SupabaseClient,
  instituteId: string,
  canteenId: string,
  invoiceId: string,
  razorpayPaymentId: string
) {
  await service
    .from('canteens')
    .update({ is_active: true, billing_state: 'active' })
    .eq('id', canteenId);

  await service
    .from('subscription_invoices')
    .update({ status: 'paid', razorpay_payment_id: razorpayPaymentId })
    .eq('id', invoiceId);

  const { data: sub } = await service
    .from('institute_subscriptions')
    .select('billing_cycle')
    .eq('institute_id', instituteId)
    .maybeSingle();

  const counts = await getInstituteCounts(service, instituteId); // now includes the new canteen
  const cycle = (sub?.billing_cycle ?? 'monthly') as BillingCycle;
  const q = computeSubscription(counts.canteens, counts.students, cycle);

  await service
    .from('institute_subscriptions')
    .update({
      canteens_count: counts.canteens,
      students_count: counts.students,
      plan_code: q.planCode,
      base_amount_paise: q.monthlyBasePaise,
      subtotal_paise: q.subtotalPaise,
      gst_paise: q.gstPaise,
      total_paise: q.totalPaise,
      updated_at: new Date().toISOString(),
    })
    .eq('institute_id', instituteId);
}
```

- [ ] **Step 3: Type-check**

Run: `cd apps/admin-app && npm run type-check`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add apps/admin-app/src/lib/subscription-actions.ts
git commit -m "feat(billing): active-only canteen count + activateAddonCanteen helper"
```

---

## Task 4: Lock plain canteen create to super_admin

**Files:**
- Modify: `apps/admin-app/src/app/api/v1/admin/canteens/route.ts`

- [ ] **Step 1: Restrict POST role**

In the `POST` handler, change the role gate so only `super_admin` can use this route, and drop the now-dead canteen_admin institute check. Replace:

```ts
  if (profileError || !profile || !['super_admin', 'canteen_admin'].includes(profile.role) || !profile.is_active) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } },
      { status: 403 }
    );
  }
```

with:

```ts
  if (profileError || !profile || profile.role !== 'super_admin' || !profile.is_active) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Canteen admins must add canteens from Billing (paid add-on). Only super admins create canteens here.' } },
      { status: 403 }
    );
  }
```

Then delete the subsequent `canteen_admin`-only guard block (it is now unreachable):

```ts
  // canteen_admin can only create canteens under their own institute
  if (profile.role === 'canteen_admin' && profile.institute_id !== institute_id) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Cannot create canteen for a different institute' } },
      { status: 403 }
    );
  }
```

- [ ] **Step 2: Type-check**

Run: `cd apps/admin-app && npm run type-check`
Expected: passes (note: `profile` select still includes `institute_id`; leaving it is harmless).

- [ ] **Step 3: Commit**

```bash
git add apps/admin-app/src/app/api/v1/admin/canteens/route.ts
git commit -m "security(billing): lock direct canteen create to super_admin (close free-canteen hole)"
```

---

## Task 5: Add-on quote endpoint (`GET`)

**Files:**
- Create: `apps/admin-app/src/app/api/v1/admin/canteens/add-on/route.ts`

- [ ] **Step 1: Write the route**

Create `apps/admin-app/src/app/api/v1/admin/canteens/add-on/route.ts`:

```ts
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
```

- [ ] **Step 2: Type-check**

Run: `cd apps/admin-app && npm run type-check`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/admin-app/src/app/api/v1/admin/canteens/add-on/route.ts
git commit -m "feat(billing): add-canteen prorated quote endpoint"
```

---

## Task 6: Add-on checkout endpoint (`POST`)

**Files:**
- Create: `apps/admin-app/src/app/api/v1/admin/canteens/add-on/checkout/route.ts`

- [ ] **Step 1: Write the route**

Create `apps/admin-app/src/app/api/v1/admin/canteens/add-on/checkout/route.ts`:

```ts
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

  // Clean up any prior abandoned pending canteen (+ its still-pending invoice).
  const { data: stale } = await service
    .from('canteens')
    .select('id')
    .eq('institute_id', instituteId)
    .eq('billing_state', 'pending_payment');
  for (const c of stale ?? []) {
    await service.from('subscription_invoices').delete().eq('canteen_id', c.id).eq('status', 'pending');
    await service.from('canteens').delete().eq('id', c.id).eq('billing_state', 'pending_payment');
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
```

- [ ] **Step 2: Type-check**

Run: `cd apps/admin-app && npm run type-check`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/admin-app/src/app/api/v1/admin/canteens/add-on/checkout/route.ts
git commit -m "feat(billing): add-canteen checkout (pending canteen + prorated invoice + order)"
```

---

## Task 7: Activate add-on canteen in verify

**Files:**
- Modify: `apps/admin-app/src/app/api/v1/admin/subscriptions/verify/route.ts`

- [ ] **Step 1: Branch on invoice.canteen_id**

In `verify/route.ts`, add the import and insert the add-on branch after the `invoice.status === 'paid'` idempotency check and before the current `getInstituteCounts(...)` / `activateFromInvoice(...)` block.

Change the import line:

```ts
import { getInstituteCounts, getCallerInstitute, activateFromInvoice, activateAddonCanteen } from '@/lib/subscription-actions';
```

Then, immediately after:

```ts
  if (invoice.status === 'paid') {
    return NextResponse.json({ success: true, data: { already: true } }); // idempotent
  }
```

insert:

```ts
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
```

- [ ] **Step 2: Type-check**

Run: `cd apps/admin-app && npm run type-check`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/admin-app/src/app/api/v1/admin/subscriptions/verify/route.ts
git commit -m "feat(billing): verify activates paid add-on canteen"
```

---

## Task 8: AddCanteenDialog component

**Files:**
- Create: `apps/admin-app/src/components/canteens/add-canteen-dialog.tsx`

- [ ] **Step 1: Write the dialog**

Create `apps/admin-app/src/components/canteens/add-canteen-dialog.tsx`. It mirrors the existing EditCanteenDialog form (name/location/hours/description/image upload) and adds the prorated summary + Razorpay flow. `formatPaise` comes from the pricing lib; `loadRazorpay` is duplicated from the billing page (small, self-contained).

```tsx
'use client';

import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Loader2, Upload, ImageIcon, X, AlertTriangle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatPaise } from '@/lib/subscription-pricing';

const schema = z.object({
  name: z.string().min(2, 'Name is required'),
  location: z.string().min(1, 'Location is required'),
  opening_time: z.string().min(1, 'Opening time required'),
  closing_time: z.string().min(1, 'Closing time required'),
  description: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

interface AddonQuote { remainingDays: number; subtotalPaise: number; gstPaise: number; totalPaise: number }
interface AddonInfo { allowed: boolean; reason?: string; quote?: AddonQuote; period_end?: string }

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

const REASON_TEXT: Record<string, string> = {
  not_active: 'You need an active subscription to add a canteen.',
  razorpay_disabled: 'Online payment isn’t enabled yet. Contact MunchAdda.',
  no_institute: 'Your account isn’t linked to an institute.',
};

export function AddCanteenDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [imageUrl, setImageUrl] = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [paying, setPaying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data } = useQuery<{ data: AddonInfo }>({
    queryKey: ['add-canteen-quote'],
    queryFn: () => axios.get('/api/v1/admin/canteens/add-on').then((r) => r.data),
  });
  const info = data?.data;

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const handleImageUpload = async (file: File) => {
    setImageUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/v1/admin/upload', { method: 'POST', body: formData });
      const json = await res.json();
      if (json.url) setImageUrl(json.url);
      else setServerError(json.error?.message ?? 'Upload failed');
    } catch {
      setServerError('Upload failed. Please try again.');
    } finally {
      setImageUploading(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    setServerError('');
    setPaying(true);
    try {
      const ok = await loadRazorpay();
      if (!ok) throw new Error('Could not load the payment gateway');

      const { data: co } = await axios.post('/api/v1/admin/canteens/add-on/checkout', {
        ...values, image_url: imageUrl || null,
      });
      const order = co.data;

      if (order.free) { onSuccess(); return; } // ₹0 prorate → already active

      await new Promise<void>((resolve, reject) => {
        const RZP = (window as unknown as { Razorpay: new (o: unknown) => { open: () => void } }).Razorpay;
        const rzp = new RZP({
          key: order.key_id,
          amount: order.amount,
          currency: order.currency,
          name: 'MunchAdda',
          description: `Add canteen: ${values.name}`,
          order_id: order.order_id,
          theme: { color: '#E8390E' },
          handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
            try { await axios.post('/api/v1/admin/subscriptions/verify', resp); resolve(); }
            catch (e) { reject(e); }
          },
          modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
        });
        rzp.open();
      });
      onSuccess();
    } catch (e) {
      const text = axios.isAxiosError(e) ? e.response?.data?.error?.message ?? 'Payment failed' : (e as Error).message;
      setServerError(text);
    } finally {
      setPaying(false);
    }
  };

  const quote = info?.quote;
  const blocked = info && !info.allowed;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
      <div className="bg-surface rounded-2xl border border-border shadow-lg w-full max-w-lg my-4">
        <div className="px-5 py-4 border-b border-border flex items-start justify-between">
          <div>
            <p className="eyebrow">Canteen</p>
            <h2 className="font-display text-lg font-semibold tracking-tight text-text">Add Canteen</h2>
            <p className="text-xs text-text-3 mt-0.5">Prorated for the rest of your current plan.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-text-3 hover:text-text transition rounded-lg p-1 hover:bg-bg-2">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          {serverError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{serverError}</p>
          )}

          {blocked && (
            <p className="flex items-start gap-2 text-sm text-amber-dark bg-amber-pale border border-amber/25 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                {REASON_TEXT[info!.reason ?? ''] ?? 'Adding a canteen isn’t available right now.'}{' '}
                {info!.reason === 'not_active' && <a href="/billing" className="font-semibold underline">Go to Billing</a>}
              </span>
            </p>
          )}

          {/* Photo */}
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="h-36 bg-bg-2 relative overflow-hidden">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-brand-pale">
                  <ImageIcon className="w-8 h-8 text-brand opacity-50" />
                </div>
              )}
            </div>
            <div className="px-4 py-3 flex items-center gap-3">
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={imageUploading}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-bg-2 transition disabled:opacity-60">
                {imageUploading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</> : <><Upload className="w-3.5 h-3.5" /> {imageUrl ? 'Change Photo' : 'Upload Photo'}</>}
              </button>
              <span className="text-xs text-text-3 ml-auto">Max 5 MB</span>
            </div>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ''; }} />
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Canteen Name <span className="text-red-500">*</span></label>
            <Input {...register('name')} placeholder="e.g. Main Canteen" error={!!errors.name} />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Location / Building <span className="text-red-500">*</span></label>
            <Input {...register('location')} placeholder="e.g. Block A, Ground Floor" error={!!errors.location} />
            {errors.location && <p className="text-xs text-red-500 mt-1">{errors.location.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Opening Time <span className="text-red-500">*</span></label>
              <Input {...register('opening_time')} type="time" error={!!errors.opening_time} />
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Closing Time <span className="text-red-500">*</span></label>
              <Input {...register('closing_time')} type="time" error={!!errors.closing_time} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Description</label>
            <textarea {...register('description')} rows={2} placeholder="Short description of the canteen…"
              className="w-full px-3 py-2 rounded-lg border border-border-2 bg-surface text-sm text-text placeholder:text-text-3 hover:border-text-3 focus:outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand resize-none transition-all" />
          </div>

          {/* Prorated charge summary */}
          {quote && (
            <div className="bg-bg-2 rounded-xl border border-border p-4 text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-text-2">Prorated ({quote.remainingDays} days left in current plan)</span>
                <span className="tabular-nums">{formatPaise(quote.subtotalPaise)}</span>
              </div>
              {quote.gstPaise > 0 && (
                <div className="flex justify-between"><span className="text-text-2">GST (18%)</span><span className="tabular-nums">{formatPaise(quote.gstPaise)}</span></div>
              )}
              <div className="flex items-baseline justify-between pt-2 mt-1 border-t border-border">
                <span className="font-semibold text-text">Pay now</span>
                <span className="font-display text-xl font-semibold text-text tabular-nums tracking-tight">{formatPaise(quote.totalPaise)}</span>
              </div>
              <p className="text-xs text-text-3">Then ₹2,000/mo, included automatically at your next renewal.</p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={paying || imageUploading || blocked || !info}>
              {paying && <Loader2 className="w-4 h-4 animate-spin" />}
              {quote ? `Pay ${formatPaise(quote.totalPaise)}` : 'Add Canteen'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/admin-app && npm run type-check`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/admin-app/src/components/canteens/add-canteen-dialog.tsx
git commit -m "feat(billing): AddCanteenDialog with prorated summary + razorpay flow"
```

---

## Task 9: Wire the "Add Canteen" button into the canteens page

**Files:**
- Modify: `apps/admin-app/src/app/(dashboard)/canteens/page.tsx`

- [ ] **Step 1: Import the dialog and Plus icon**

Add to the icon import from `lucide-react` (append `Plus` to the existing list) and add a new import:

```tsx
import { AddCanteenDialog } from '@/components/canteens/add-canteen-dialog';
```

- [ ] **Step 2: Add dialog state**

Inside `CanteensPage`, next to `const [editCanteen, setEditCanteen] = useState<CanteenWithStats | null>(null);` add:

```tsx
  const [showAdd, setShowAdd] = useState(false);
```

- [ ] **Step 3: Add the button (canteen_admin only) in the header row**

Replace the super-admin-only filter block's opening so the header always renders an actions row. Change:

```tsx
      {/* Filters row */}
      {isSuperAdmin && (
        <div className="flex items-center gap-3">
```

to:

```tsx
      {/* Header row: filters (super admin) + Add (canteen admin) */}
      <div className="flex items-center gap-3">
        {isSuperAdmin && (
          <>
```

and update the closing of that block. Find the end of the filter block:

```tsx
          <p className="font-display text-sm font-semibold tracking-tight text-text-2">
            <span className="tabular-nums">{canteens.length}</span> canteen{canteens.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}
```

replace with:

```tsx
            <p className="font-display text-sm font-semibold tracking-tight text-text-2">
              <span className="tabular-nums">{canteens.length}</span> canteen{canteens.length !== 1 ? 's' : ''}
            </p>
          </>
        )}
        {!isSuperAdmin && (
          <Button size="sm" className="ml-auto" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4" /> Add Canteen
          </Button>
        )}
      </div>
```

- [ ] **Step 4: Update the canteen_admin empty-state copy**

In the empty state, change the canteen_admin line so it points to the button. Replace:

```tsx
              : 'No canteens are assigned to your institute yet.'}
```

with:

```tsx
              : 'No canteens yet. Use “Add Canteen” above to add your first one.'}
```

- [ ] **Step 5: Render the dialog**

After the existing edit-dialog block:

```tsx
      {/* Edit dialog */}
      {editCanteen && (
        <EditCanteenDialog
          canteen={editCanteen}
          onClose={() => setEditCanteen(null)}
          onSuccess={() => {
            setEditCanteen(null);
            invalidate();
          }}
        />
      )}
```

add:

```tsx
      {/* Add dialog (canteen admin self-serve) */}
      {showAdd && (
        <AddCanteenDialog
          onClose={() => setShowAdd(false)}
          onSuccess={() => {
            setShowAdd(false);
            invalidate();
          }}
        />
      )}
```

- [ ] **Step 6: Type-check + lint**

Run: `cd apps/admin-app && npm run type-check && npm run lint`
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add "apps/admin-app/src/app/(dashboard)/canteens/page.tsx"
git commit -m "feat(billing): canteen_admin Add Canteen button wired to prorated dialog"
```

---

## Task 10: Manual verification + build

**Files:** none (verification only)

- [ ] **Step 1: Production build**

Run: `cd apps/admin-app && npm run build`
Expected: build succeeds with no type/lint errors.

- [ ] **Step 2: Manual flow (requires the migration run + Razorpay test keys)**

With `supabase-add-canteen.sql` applied and `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` set:
1. Log in as a `canteen_admin` whose institute subscription is `active`. Go to Canteens → "Add Canteen".
2. Confirm the dialog shows a prorated amount and "N days left".
3. Fill the form, pay with a Razorpay test card, confirm the canteen appears active in the list.
4. In Supabase, confirm: the new canteen has `billing_state='active'`, `is_active=true`; a `subscription_invoices` row with `status='paid'` and the `canteen_id`; and `institute_subscriptions.canteens_count` incremented.
5. Log in as a `canteen_admin` whose subscription is `expired`/`trialing`: the dialog shows the blocked message with a Billing link and Pay is disabled.
6. As a `canteen_admin`, `POST /api/v1/admin/canteens` directly (e.g. via devtools) → expect `403`.

- [ ] **Step 3: Final commit (if any docs/notes changed)**

```bash
git add -A
git commit -m "chore(billing): verification notes for add-canteen flow" --allow-empty
```

---

## Self-Review Notes (author)

- **Spec coverage:** schema (Task 1) ✓, pricing helper (Task 2) ✓, active-only counts + activation (Task 3) ✓, lock create route (Task 4) ✓, quote endpoint (Task 5) ✓, checkout endpoint incl. ₹0 + cleanup + rollback (Task 6) ✓, verify branch (Task 7) ✓, dialog (Task 8) ✓, button/UI + empty-state (Task 9) ✓, edge cases (₹0, abandoned cleanup, idempotent verify) covered in Tasks 6–7 ✓.
- **Type consistency:** `computeCanteenAddon` signature + `CanteenAddonQuote` used identically in Tasks 5/6/8; `activateAddonCanteen(service, instituteId, canteenId, invoiceId, razorpayPaymentId)` defined in Task 3 and called in Task 7 with matching args; invoice `canteen_id` written in Task 6, read in Task 7.
- **Migration gating:** flow depends on `supabase-add-canteen.sql` being run; called out in Tasks 1 and 10.
