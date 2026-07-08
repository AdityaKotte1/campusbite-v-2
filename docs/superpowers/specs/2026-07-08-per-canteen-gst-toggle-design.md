# Per-canteen GST toggle (super-admin controlled) — Design

**Date:** 2026-07-08
**Status:** Approved for planning

## Problem

GST is currently hardcoded at 5% (`TAX_RATE = 0.05` in `apps/student-app/src/lib/constants.ts`). That single constant drives both the student cart display and the authoritative server-side charge in `apps/student-app/src/app/api/v1/orders/route.ts`. There is no way to turn GST off, or to vary the rate, for an individual canteen.

We want a **per-canteen GST setting** that:
- can be turned on/off, with an editable percentage
- is controllable **only by super admins**
- is **read-only visible** to canteen admins
- defaults to **ON at 5%** so no existing canteen's pricing changes
- flows through the entire student experience: cart, order total, and invoices/receipts

## Data model

Two fields on the `canteens` table:

| Field | Status | Definition |
|-------|--------|------------|
| `gst_enabled` | **new** | `BOOLEAN NOT NULL DEFAULT true` — the on/off switch |
| `tax_percentage` | already exists (currently unused/dead) | `NUMERIC(5,2) NOT NULL DEFAULT 5.00 CHECK (tax_percentage >= 0)` |

**Effective rate:** `gst_enabled === false ? 0 : Number(tax_percentage) / 100`.

Because the new column defaults to `true` and every existing row already has `tax_percentage = 5.00`, all current canteens keep charging exactly 5% after this ships — no pricing surprises.

**Convention:** a null/absent `gst_enabled` is treated as **enabled** (mirrors how `cash_payments_enabled === false` is the only "off" signal, so existing rows stay enabled). Only an explicit `false` disables GST.

## Components & changes

### 1. Migration — `packages/database/`
- Add `gst_enabled BOOLEAN NOT NULL DEFAULT true` to `canteens` in `schema.sql`.
- Add a runnable migration (idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) so it can be applied to the live Supabase DB. No backfill required — the `DEFAULT true` populates existing rows, and `tax_percentage` already holds 5.00.
- Record this in the pending-migrations memory (`project_pending_migrations.md`) since it MUST run before deploy.

### 2. Server — source of truth: `apps/student-app/src/app/api/v1/orders/route.ts`
- Add `gst_enabled, tax_percentage` to the existing canteen `select` (line ~132).
- Replace `const taxPaise = Math.round(subtotalPaise * TAX_RATE)` with:
  ```ts
  const effectiveRate = canteen.gst_enabled === false ? 0 : (Number(canteen.tax_percentage ?? 5) / 100);
  const taxPaise = Math.round(subtotalPaise * effectiveRate);
  ```
- This is authoritative; the client cannot bypass it. A GST-off canteen stores `tax_paise = 0` and `total_paise = subtotal - discount`.

### 3. Student cart display
- `apps/student-app/src/store/cart-store.ts`: `useCartTax(rate)` and `useCartTotal(rate)` gain a `rate` argument (the effective decimal rate). `TAX_RATE` remains only as the fallback default when no rate is supplied.
- `apps/student-app/src/app/(main)/cart/page.tsx` and `apps/student-app/src/components/cart/cart-sheet.tsx`: both already have (or fetch) the canteen via `/api/v1/canteens/[id]`. Derive the effective rate from `canteen.gst_enabled` + `canteen.tax_percentage`, pass it to the hooks.
  - Label: replace the hardcoded `GST (5%)` with the canteen's actual percentage, e.g. `GST (12%)`.
  - **Hide the entire GST row when GST is off** (rate is 0), so the student never sees a `GST ₹0.00` line.

### 4. Student invoices & order detail — hide GST when zero
Follow the existing `discount_paise > 0` gating pattern. Gate the GST line on `tax_paise > 0` in:
- `apps/student-app/src/app/invoice/[id]/page.tsx` (~line 111)
- `apps/student-app/src/app/(main)/orders/[id]/page.tsx` (~line 236)
- `apps/admin-app/src/app/(dashboard)/orders/[id]/page.tsx` (matching admin order detail)

When `tax_paise === 0` the GST row is not rendered at all; Subtotal → (Discount) → Total remain.

### 5. Admin API — `PUT /api/v1/admin/canteens/[id]`
- Accept `gst_enabled` and `tax_percentage` in the request body.
- **Apply them only when `profile.role === 'super_admin'`.** A `canteen_admin` that sends these fields has them silently ignored — their other edits (name, hours, cash flag, etc.) still go through.
- Validate `tax_percentage`: coerce to number, reject/clamp outside `0–100`, round to 2 decimals.

### 6. Admin UI — `apps/admin-app/src/app/(dashboard)/canteens/page.tsx`
- **Card badge (everyone, read-only):** a small status pill showing `GST 5%` (green, when enabled) or `GST off` (gray, when disabled). This is the canteen admin's read-only view. Uses the same null-safe convention (`gst_enabled === false` → off).
- **Edit Canteen dialog (super-admin only):** a "GST billing" section — an on/off toggle plus a percentage input — rendered only when `isSuperAdmin` (the page already computes `isSuperAdmin`). On save it PUTs `gst_enabled` and `tax_percentage`.

## Out of scope / verified-not-affected
- **Kiosk flow** (`apps/admin-app/src/app/api/v1/kiosk/scan/route.ts`, `.../kiosk/cache/route.ts`): reads already-created orders that carry a stored `tax_paise`, so it needs no tax-calc change. To be **verified**, not assumed, during implementation.
- Existing orders/invoices already store `tax_paise` and `total_paise`, so historical records are untouched.
- Subscription/billing GST (the B2B invoice side) is unrelated and unchanged.

## Testing / verification
- Super admin sets a canteen's GST **off** → student cart drops the GST row, total = subtotal (− discount); placing the order stores `tax_paise = 0`; the invoice and order-detail pages show no GST line.
- Super admin sets **12%** → cart shows `GST (12%)`, server charges 12%, invoice shows the GST line.
- Existing canteen (untouched) → still 5%, identical to today.
- Canteen admin → sees the read-only `GST 5%` badge, no editor in the Edit dialog; a forged `PUT` with `gst_enabled`/`tax_percentage` is ignored (values unchanged).
- Verify the kiosk scan path is unaffected.
