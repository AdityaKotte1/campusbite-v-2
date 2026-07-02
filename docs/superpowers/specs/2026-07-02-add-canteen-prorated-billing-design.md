# Self-serve "Add Canteen" with prorated billing

**Date:** 2026-07-02
**Status:** Approved (design) — ready for implementation plan

## Problem

Today the canteen count drives subscription pricing, but:

1. A `canteen_admin` has **no UI** to add a canteen in their dashboard.
2. The `POST /api/v1/admin/canteens` API **allows a `canteen_admin` to create a canteen with no billing gate** — a free-canteen hole. New canteens only get priced in at the *next* renewal, so an institute can use extra canteens free for the rest of the period.

We want a proper self-serve flow where a `canteen_admin` adds a canteen and **pays a prorated amount for the days remaining in their current plan period** (not a full month), at the same cycle discount.

## Decisions (locked)

- **Proration basis:** prorate the new canteen over the days remaining until the plan's `current_period_end`, at the same cycle discount. At renewal the canteen is automatically included at full rate. On an annual plan with many months left this is a larger one-time charge — accepted.
- **Non-active state:** only allow adding a canteen while the subscription is in an **active paid period** (`status='active'` and `current_period_end > now`). Block in every other state (trial, past_due, expired, cancelled, none) with a prompt to renew/pay first.
- **Creation timing:** create the canteen **inactive** (`is_active=false`, `billing_state='pending_payment'`) and **activate it on payment**. Abandoned payments leave a harmless inactive row that is excluded from billing and hidden from students; the next attempt cleans up the stale row.
- **Super-admin:** keeps **free, unmetered** canteen creation from the Institutes page (platform operator). The paid prorated add-on flow is for `canteen_admin` self-serve only.

## Data / schema — new migration `supabase-add-canteen.sql`

Run in the Supabase SQL editor (follows the project's "migrations must be run manually" pattern).

- `ALTER TABLE canteens ADD COLUMN IF NOT EXISTS billing_state text NOT NULL DEFAULT 'active';`
  - Values: `active | pending_payment`. Existing canteens default to `active` — no behavior change.
  - Cleanly separates "admin temporarily closed a canteen" (`is_active=false`, still billed) from "unpaid new canteen" (`billing_state='pending_payment'`, not billed, hidden).
- `ALTER TABLE subscription_invoices ADD COLUMN IF NOT EXISTS canteen_id uuid REFERENCES canteens(id) ON DELETE SET NULL;`
  - Links an add-on invoice to the canteen it paid for, so `verify` knows to activate it.
- Update `institute_subscription_overview()` SQL function so its canteen count counts **only `billing_state = 'active'`** canteens.
- `NOTIFY pgrst, 'reload schema';`

## Pricing helper — `apps/admin-app/src/lib/subscription-pricing.ts`

New pure function (single source of truth, mirrors `computeSubscription`):

```ts
export function computeCanteenAddon(
  cycle: BillingCycle,
  periodStart: Date,
  periodEnd: Date,
  now: Date
): {
  remainingDays: number;
  totalDays: number;
  subtotalPaise: number;
  gstPaise: number;
  totalPaise: number;
}
```

Formula (paise):

```
months               = CYCLE_CONFIG[cycle].months
discount             = CYCLE_CONFIG[cycle].discountPct
fullPeriodPerCanteen = round(BASE_PER_CANTEEN_PAISE * months * (1 - discount))
totalDays            = round((periodEnd - periodStart) / oneDay)
remainingDays        = ceil((periodEnd - now) / oneDay)   // clamp to [0, totalDays]
subtotalPaise        = round(fullPeriodPerCanteen * remainingDays / totalDays)
gstPaise             = SUBSCRIPTION_GST_ENABLED ? round(subtotalPaise * GST_RATE) : 0
totalPaise           = subtotalPaise + gstPaise
```

Student tier is untouched — adding a canteen does not change student count, so the per-institute student add-on is unaffected.

## Server helpers — `apps/admin-app/src/lib/subscription-actions.ts`

- `getInstituteCounts()` changes to count **only `billing_state = 'active'`** canteens, so unpaid pending canteens never inflate a full-subscription checkout/renewal price.

## API

### Lock the existing create route
- `POST /api/v1/admin/canteens`: restrict to **`super_admin` only**. `canteen_admin` gets `403` directing them to the add-on flow. (Closes the free-canteen hole.)

### `GET /api/v1/admin/canteens/add-on` (canteen_admin, own institute)
Returns `{ allowed: boolean, reason?: 'not_active' | 'razorpay_disabled' | 'no_institute', quote?: {...} }`.
- `quote` = output of `computeCanteenAddon` using the subscription's `billing_cycle`, `current_period_start`, `current_period_end`, and now.
- Used by the dialog to preview the prorated charge before the admin commits.

### `POST /api/v1/admin/canteens/add-on/checkout` (canteen_admin, own institute)
Body: canteen fields (`name`, `location`, `opening_time`, `closing_time`, `description?`, `image_url?`).
1. Re-check role + own institute; re-check `status='active'` and `current_period_end > now`; re-check Razorpay configured.
2. Compute prorate via `computeCanteenAddon`.
3. Clean up any prior **abandoned** pending canteen for this institute (a `billing_state='pending_payment'` canteen whose invoice is still `pending`) — keeps at most one pending at a time.
4. Create the canteen row: `is_active=false`, `billing_state='pending_payment'` (+ generated `code`, same as current POST logic).
5. **If prorate rounds to ₹0** (e.g. adding on the last day): mark active immediately (`is_active=true`, `billing_state='active'`), write a ₹0 `comp` invoice, bump the subscription count, and return `{ paid: false, free: true, canteen_id }`. No Razorpay.
6. Otherwise: create a pending `subscription_invoice` (period `[now, current_period_end]`, `billing_cycle` = the sub's cycle, `canteen_id` set, `method='razorpay'`, `notes='Canteen add-on: <name>'`, amounts from the quote), create a Razorpay order for `totalPaise`, and return `{ order, quote, canteen_id }`.

### Extend `POST /api/v1/admin/subscriptions/verify`
After signature verification and pending-invoice lookup, branch on `invoice.canteen_id`:
- **Add-on invoice** (`canteen_id` present):
  - Mark invoice `paid` (+ `razorpay_payment_id`).
  - Flip the canteen to `is_active=true`, `billing_state='active'`.
  - Bump `institute_subscriptions.canteens_count += 1` and recompute `base_amount_paise` / `subtotal_paise` / `gst_paise` / `total_paise` via `computeSubscription(newCanteens, students, cycle)` so the recurring record and next renewal reflect the new count. `current_period_start/end` unchanged.
  - Audit-log `action='canteen.addon.paid'`, `entity_type='canteen'`, `entity_id=canteen_id`.
- **Full-subscription invoice** (no `canteen_id`): existing `activateFromInvoice` path, unchanged.

Idempotency: existing `invoice.status === 'paid'` short-circuit is preserved.

## UI — `apps/admin-app/src/app/(dashboard)/canteens/page.tsx`

- Add an **"Add Canteen"** button visible to `canteen_admin`. Update the empty-state copy for them.
- **AddCanteenDialog** (new component, reuses the Edit form fields + image upload):
  - On open, fetch `GET /api/v1/admin/canteens/add-on` for the quote / allowed state.
  - Show a **prorated charge summary**: "₹X for the remaining N days of your current plan" and the recurring note ("then ₹2,000/mo included at renewal").
  - **Pay** button: `POST .../add-on/checkout` → load Razorpay → on success `POST .../subscriptions/verify` → invalidate `canteens-manage` + `billing-me` queries.
  - If `allowed=false`: disable Pay, show the reason with a link to **/billing** ("Renew your plan to add canteens").
- Super-admin's view is unchanged (they add canteens from Institutes page).

## Edge cases

- **Abandoned payment:** canteen stays `is_active=false`, `billing_state='pending_payment'` — hidden from students (already filtered by `is_active`), excluded from billing counts. Next add-on attempt cleans up the stale row.
- **₹0 prorate** (adding on the last day of the period): create active with a ₹0 `comp` invoice, no Razorpay.
- **Idempotent verify:** already handled by the `status='paid'` short-circuit.
- **Concurrent adds:** each checkout cleans up prior pending rows first; at most one pending canteen per institute at a time.

## Out of scope

- Auto-recurring / Razorpay Subscriptions (still prepaid, per existing Phase 4 backlog).
- Removing a canteen mid-cycle with a refund/credit.
- Changing the student-tier add-on (untouched by this feature).
