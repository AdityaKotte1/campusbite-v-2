# Pending-canteen resume/discard + billing-state consistency — Design

**Date:** 2026-07-04
**Status:** Approved (pending spec review)
**Area:** admin-app (canteens + subscriptions), student-app (canteen visibility)

## Problem

When a canteen-admin starts the paid "Add Canteen" add-on flow but does not finish
payment, the canteen is created with `billing_state='pending_payment'` and
`is_active=false`. Today that canteen is **hidden** from the canteen-admin's list
(the list filters out `pending_payment`), and the next "Add Canteen" attempt
silently deletes it. There is no way to resume the interrupted payment.

Investigation of the live data surfaced a second, related class of bug: the
"live" state of a canteen is tracked by **two independent flags** that can drift:

- `is_active` — trusted by the **student app** (`student-app/.../canteens/route.ts`
  filters only `.eq('is_active', true)`).
- `billing_state` — trusted by **admin billing** (list filter, `getInstituteCounts`,
  the overview RPC).

A canteen manually toggled active while still `pending_payment`
(`is_active=true` + `billing_state='pending_payment'`) becomes split-brained:
visible/orderable to students, hidden from the canteen-admin, excluded from the
active-canteen count, yet still reflected in a stale subscription amount (MRR).

## Goals

1. Surface an interrupted (`pending_payment`) canteen in the canteen-admin list with
   a **Complete Payment** CTA (freshly re-prorated) and a **Discard** action.
2. Make `billing_state='active'` the **single gate** for "this canteen is live" —
   both for student visibility/ordering and for billing — so `is_active` drift can
   no longer expose an unpaid canteen to students.
3. Enforce **one pending canteen at a time** per institute.

## Non-goals

- No new schema tables. Reuse `canteens.billing_state` + `subscription_invoices`.
- No super-admin "pay" flow (super-admins don't pay; they already see all canteens).
- No change to the proration math (`computeCanteenAddon`) or the Razorpay
  verify/webhook activation path.

## Decisions (confirmed with product owner)

- **Resume pricing:** recompute a **fresh** prorated quote for the days remaining
  *now* and open a new Razorpay order. Never charge the stale original amount.
- **Concurrency:** **one** pending canteen at a time. A new "Add Canteen" is blocked
  while a pending one exists.
- **Discard:** the pending card gets a Discard action that hard-deletes the unpaid
  canteen + its unpaid invoice.
- **Student visibility:** unpaid/pending canteens must never be shown or orderable.

## Design

### 1. Backend — admin

**a. Surface pending canteens** — `GET /api/v1/admin/canteens`
- For `canteen_admin`, drop the `.neq('billing_state','pending_payment')` filter
  (keep it for `staff`, who cannot pay). Super-admin is already unfiltered.
- Add `billing_state` to the selected columns so the client can render the state.

**b. Resume endpoint** — `POST /api/v1/admin/canteens/[id]/resume-payment` (new)
- Auth: super_admin, or canteen_admin of the owning institute; canteen must be
  `billing_state='pending_payment'`.
- Require an active subscription (same guard as add-on) → else `NOT_ACTIVE`.
- Recompute a fresh quote via `computeCanteenAddon(cycle, period_start, period_end, now)`.
- Free (₹0) case → activate immediately (comp invoice), mirroring checkout.
- Otherwise: create a **new** Razorpay order; replace the canteen's *unpaid* pending
  invoice — delete pending invoices for this canteen that have **no**
  `razorpay_payment_id`, then insert a fresh pending invoice with the new
  `razorpay_order_id`, fresh amounts, and `period_start=now`. Return order details.
- Activation reuses the **existing** `POST /subscriptions/verify` unchanged (it
  matches the invoice by `razorpay_order_id` → `activateAddonCanteen`).

**c. One-at-a-time enforcement**
- `GET /api/v1/admin/canteens/add-on`: if the institute already has a
  `pending_payment` canteen, return `{ allowed:false, reason:'pending_exists',
  pending:{ id, name } }`.
- `POST /api/v1/admin/canteens/add-on/checkout`: **replace** the current
  "delete abandoned pending canteens" block with a guard that rejects
  (`PENDING_EXISTS`, 409) when one already exists. No more silent deletion — the
  pending canteen is now a first-class, resumable item.

**d. Discard** — extend `DELETE /api/v1/admin/canteens/[id]`
- If `billing_state==='pending_payment'`: hard-delete the canteen + its unpaid
  pending invoices (those with no `razorpay_payment_id`). Never delete an invoice
  that has a captured `razorpay_payment_id` (leave it for verify/webhook).
- Otherwise: keep the existing soft-delete (`is_active=false`).

### 2. Backend — student app (billing_state gate)

Add `billing_state='active'` as a required condition (alongside existing
`is_active`/`is_active_subscriber` checks) on the student-facing canteen surfaces so
a pending/unpaid canteen is never shown or orderable, regardless of `is_active`:

- `GET /api/v1/canteens` (list)
- `GET /api/v1/canteens/[canteenId]` (detail)
- `POST /api/v1/orders` order-placement guard (`orders/route.ts` — the block that
  loads the canteen and checks `is_active`)

Menu-items/categories are reachable only via a valid canteen id; gating the detail
+ order path is sufficient, but the same condition may be added there for
defense-in-depth.

### 3. Data integrity — billing_state invariants

To make the `='active'` gate safe against NULL drift:

- **Backfill:** set `billing_state='active'` where `billing_state IS NULL`
  (currently 0 rows — safety no-op) so no legitimately-active canteen is hidden by
  the positive gate.
- **Column default:** set the `canteens.billing_state` DB default to `'active'`
  (a Supabase migration) so any creation path that omits it produces a live canteen,
  not a NULL/hidden one. (The add-on flow still explicitly sets `pending_payment`;
  the super-admin POST now explicitly sets `active`.)

### 4. Frontend (`canteens/page.tsx`, `add-canteen-dialog.tsx`)

- `CanteenCard`: when `billing_state==='pending_payment'`, render a distinct
  "Payment pending" state **inline in the same grid** — hide the normal
  Open/Edit/Activate controls, show **Complete Payment** (primary) and **Discard**
  (subtle danger).
- Complete Payment reuses the Razorpay flow. Extract the "open Razorpay → verify"
  logic currently inline in `AddCanteenDialog.onSubmit` into a small shared helper
  (e.g. `lib/razorpay-checkout.ts`) so both the add dialog and the resume button use
  one implementation.
- Discard → confirm → `DELETE /canteens/[id]` → invalidate queries.
- "Add Canteen" is disabled when the add-on eligibility returns
  `reason:'pending_exists'`, with a hint to finish/discard the pending canteen.
- Add `billing_state` to the admin `Canteen` type.

## Edge cases

- **Subscription expired since creation:** resume returns `NOT_ACTIVE`; the card
  shows "Renew to activate" plus Discard.
- **Payment captured but verify failed:** the invoice carries a
  `razorpay_payment_id`; Discard refuses to delete it; verify/webhook idempotency
  finishes activation. Card stays pending until reconciled (super-admin can assist).
- **Concurrent resume clicks:** each replaces the unpaid invoice + order; verify is
  idempotent on `status='paid'`.

## Testing

- Resume recomputes a fresh amount (not the stale original); ₹0 case activates.
- One-at-a-time: second add is rejected while a pending canteen exists.
- Discard hard-deletes a pending canteen + its unpaid invoice, but not one with a
  captured payment id.
- Admin list includes pending for canteen_admin, excludes for staff.
- Student list/detail/order all reject a `pending_payment` canteen even when
  `is_active=true`.

## Already applied (live data reconciliation, 2026-07-04)

- "ert" (unpaid pending canteen) set `is_active=false` so students can't see it;
  left `pending_payment` for testing the resume/discard flow.
- Institute `1d3fd388` subscription re-synced from the phantom 2-canteen amount
  (₹4,000/mo) to the correct 1 active canteen (`canteens_count=1`,
  `subtotal/total=₹2,000`, `plan_code='starter'`).
- Prior code fix (separate change): super-admin subscription activate/extend now
  counts canteens via `getInstituteCounts` (`billing_state='active'`), and the
  super-admin canteen POST sets `billing_state='active'`.
