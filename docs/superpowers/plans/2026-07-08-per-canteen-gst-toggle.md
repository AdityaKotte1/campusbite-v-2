# Per-canteen GST toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let super admins turn GST billing on/off (with an editable percentage) per canteen; the setting flows through the student cart, the authoritative order charge, and invoices, and is read-only to canteen admins.

**Architecture:** Add a `gst_enabled` boolean to `canteens` (the existing-but-unused `tax_percentage` column supplies the rate). Effective rate = `gst_enabled === false ? 0 : tax_percentage/100`. The student order API computes tax authoritatively from these fields; the cart display and admin UI mirror them. GST fields on the canteen PUT endpoint are applied only for `super_admin`.

**Tech Stack:** Next.js (two apps: `student-app`, `admin-app`), Supabase/Postgres (untyped client), Zustand cart store, TanStack Query, react-hook-form + zod, pnpm + turbo monorepo.

**Testing note:** This repo has **no unit-test harness** in the app packages (only `dev/build/lint/type-check`). Verification therefore uses `pnpm type-check` + `pnpm lint` per touched app, a production `build`, and manual browser verification — not a test runner. Do not add a test framework; it is out of scope.

**Commands** (run from repo root unless noted):
- Type-check one app: `pnpm --filter student-app type-check` / `pnpm --filter admin-app type-check`
- Lint one app: `pnpm --filter student-app lint` / `pnpm --filter admin-app lint`
- All: `pnpm type-check` and `pnpm lint`

---

## File map

| File | Responsibility | Change |
|------|----------------|--------|
| `add-canteen-gst.sql` (repo root) | Runnable migration for live Supabase | Create |
| `packages/database/schema.sql` | Canonical schema | Modify (add column) |
| `apps/student-app/src/app/api/v1/orders/route.ts` | Authoritative order + tax calc | Modify |
| `apps/student-app/src/store/cart-store.ts` | Cart totals hooks | Modify (rate arg) |
| `apps/student-app/src/app/(main)/cart/page.tsx` | Checkout page display | Modify |
| `apps/student-app/src/components/cart/cart-sheet.tsx` | Cart preview sheet display | Modify |
| `apps/student-app/src/app/invoice/[id]/page.tsx` | Student invoice | Modify (hide GST when 0) |
| `apps/student-app/src/app/(main)/orders/[id]/page.tsx` | Student order detail | Modify (hide GST when 0) |
| `apps/admin-app/src/app/api/v1/admin/canteens/[id]/route.ts` | Canteen update (super-admin gate) | Modify |
| `apps/admin-app/src/app/api/v1/admin/canteens/route.ts` | Canteen list select | Modify (add fields) |
| `apps/admin-app/src/types/index.ts` | Admin `Canteen` type | Modify (add fields) |
| `apps/admin-app/src/app/(dashboard)/canteens/page.tsx` | Card badge + Edit dialog GST section | Modify |

**Out of scope (verified):** kiosk scan/cache routes read stored `tax_paise` from existing orders — no change; canteen creation relies on DB defaults (GST on, 5%), editable afterward; B2B subscription invoicing is unrelated.

---

## Task 1: Database migration — add `gst_enabled`

**Files:**
- Create: `add-canteen-gst.sql` (repo root)
- Modify: `packages/database/schema.sql:49` (canteens table)

- [ ] **Step 1: Add the column to the canonical schema**

In `packages/database/schema.sql`, the `canteens` table currently has (line ~49):
```sql
  tax_percentage      NUMERIC(5,2) NOT NULL DEFAULT 5.00 CHECK (tax_percentage >= 0),
```
Add a new line directly beneath it:
```sql
  gst_enabled         BOOLEAN NOT NULL DEFAULT true,  -- super_admin-only: when false, no GST is charged on student orders
```

- [ ] **Step 2: Create the runnable migration**

Create `add-canteen-gst.sql` at the repo root (mirrors the existing root-level `security-hardening.sql` convention):
```sql
-- Per-canteen GST toggle.
-- gst_enabled = false  -> no GST charged on student orders at this canteen.
-- Rate itself comes from the existing canteens.tax_percentage column.
-- Default true + existing tax_percentage=5.00 means every current canteen keeps 5% GST.
ALTER TABLE canteens
  ADD COLUMN IF NOT EXISTS gst_enabled BOOLEAN NOT NULL DEFAULT true;
```

- [ ] **Step 3: Record it as a pending migration**

This SQL must run in Supabase before deploy. Update the memory index note per the existing `project_pending_migrations.md` pattern (add a one-line entry pointing at `add-canteen-gst.sql`). Do not run it against the live DB as part of this task.

- [ ] **Step 4: Commit**

```bash
git add add-canteen-gst.sql packages/database/schema.sql
git commit -m "feat(db): add canteens.gst_enabled for per-canteen GST toggle"
```

---

## Task 2: Server — authoritative tax calc in the order route

**Files:**
- Modify: `apps/student-app/src/app/api/v1/orders/route.ts:132` (canteen select) and `:253` (tax calc)

- [ ] **Step 1: Add GST fields to the canteen select**

At line ~130, the select is:
```ts
    const { data: canteen, error: canteenErr } = await supabase
      .from('canteens')
      .select('id, is_open, is_active, billing_state, institute_id, cash_payments_enabled, institutes(is_active_subscriber)')
      .eq('id', canteen_id)
      .single();
```
Change the `.select(...)` string to include the two fields:
```ts
      .select('id, is_open, is_active, billing_state, institute_id, cash_payments_enabled, gst_enabled, tax_percentage, institutes(is_active_subscriber)')
```

- [ ] **Step 2: Compute the effective tax rate**

At line ~253 the code is:
```ts
    const taxPaise = Math.round(subtotalPaise * TAX_RATE);
```
Replace it with:
```ts
    // GST is a per-canteen, super_admin-controlled setting. gst_enabled === false
    // means no GST at this canteen; otherwise the rate is tax_percentage (default 5).
    // A null/absent flag is treated as enabled so existing canteens keep charging GST.
    const effectiveTaxRate =
      canteen.gst_enabled === false ? 0 : Number(canteen.tax_percentage ?? 5) / 100;
    const taxPaise = Math.round(subtotalPaise * effectiveTaxRate);
```

- [ ] **Step 3: Verify the now-unused import**

The file imports `TAX_RATE` at line 5. After Step 2 it may be unused. Check with grep:

Run: `grep -n "TAX_RATE" apps/student-app/src/app/api/v1/orders/route.ts`
Expected: only the `import { TAX_RATE } from '@/lib/constants';` line remains.
If so, remove that import line to avoid a lint "unused import" error. (Leave `@/lib/constants` import intact if other named imports come from it — check the full import statement first.)

- [ ] **Step 4: Type-check**

Run: `pnpm --filter student-app type-check`
Expected: PASS (no errors).

- [ ] **Step 5: Commit**

```bash
git add apps/student-app/src/app/api/v1/orders/route.ts
git commit -m "feat(orders): charge GST from per-canteen gst_enabled + tax_percentage"
```

---

## Task 3: Cart store — tax hooks accept a rate

**Files:**
- Modify: `apps/student-app/src/store/cart-store.ts:134-143`

- [ ] **Step 1: Make the tax/total hooks accept an optional rate**

Current code (lines 134-143):
```ts
export const useCartTax = () => {
  const subtotal = useCartSubtotal();
  return Math.round(subtotal * TAX_RATE);
};

export const useCartTotal = () => {
  const subtotal = useCartSubtotal();
  const tax = Math.round(subtotal * TAX_RATE);
  return subtotal + tax;
};
```
Replace with (rate defaults to the legacy constant so existing callers are unaffected):
```ts
export const useCartTax = (rate: number = TAX_RATE) => {
  const subtotal = useCartSubtotal();
  return Math.round(subtotal * rate);
};

export const useCartTotal = (rate: number = TAX_RATE) => {
  const subtotal = useCartSubtotal();
  const tax = Math.round(subtotal * rate);
  return subtotal + tax;
};
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter student-app type-check`
Expected: PASS (callers pass no arg yet → default rate applies).

- [ ] **Step 3: Commit**

```bash
git add apps/student-app/src/store/cart-store.ts
git commit -m "refactor(cart): tax/total hooks accept a per-canteen rate"
```

---

## Task 4: Student checkout page — dynamic GST rate + hide when off

**Files:**
- Modify: `apps/student-app/src/app/(main)/cart/page.tsx:78-79`, `:96-104`, `:403-406`

- [ ] **Step 1: Widen the canteen query type to include GST fields**

At line ~96 the query is typed only for cash:
```ts
  const { data: canteen } = useQuery({
    queryKey: ['canteen', canteenId],
    queryFn: () =>
      fetch(`/api/v1/canteens/${canteenId}`)
        .then((r) => r.json())
        .then((j) => j.data as { cash_payments_enabled?: boolean } | null),
    enabled: !!canteenId,
  });
  const cashEnabled = canteen?.cash_payments_enabled !== false;
```
Change the cast type and add derived GST values right after `cashEnabled`:
```ts
  const { data: canteen } = useQuery({
    queryKey: ['canteen', canteenId],
    queryFn: () =>
      fetch(`/api/v1/canteens/${canteenId}`)
        .then((r) => r.json())
        .then(
          (j) =>
            j.data as {
              cash_payments_enabled?: boolean;
              gst_enabled?: boolean;
              tax_percentage?: number | string;
            } | null
        ),
    enabled: !!canteenId,
  });
  const cashEnabled = canteen?.cash_payments_enabled !== false;

  // GST is per-canteen. A null/absent flag means enabled (existing canteens keep GST).
  const gstEnabled = canteen?.gst_enabled !== false;
  const taxPercent = Number(canteen?.tax_percentage ?? 5);
  const taxRate = gstEnabled ? taxPercent / 100 : 0;
```

- [ ] **Step 2: Feed the rate into the tax/total hooks**

At lines 78-79:
```ts
  const taxPaise = useCartTax();
  const totalPaise = useCartTotal();
```
change to:
```ts
  const taxPaise = useCartTax(taxRate);
  const totalPaise = useCartTotal(taxRate);
```
**Note on ordering:** `taxRate` is derived from the `canteen` query, which currently sits *below* these lines. Hooks read a value defined later in render — that is fine in React (all run top-to-bottom each render and `taxRate` is computed before JSX). But `const` is not hoisted, so you must **move the `canteen` `useQuery` block and the `gstEnabled/taxPercent/taxRate` derivation ABOVE lines 78-79** (place them immediately after the `useCartStore`/`useCartSubtotal` calls, before `useCartTax`). Keep the `cashEnabled` line and the `useEffect` that depends on it together with the moved block.

- [ ] **Step 3: Dynamic label + hide the GST row when off**

At lines 403-406:
```tsx
          <div className="flex justify-between text-sm">
            <span className="text-text-2">GST (5%)</span>
            <span className="text-text tabular-nums">{formatPrice(taxPaise)}</span>
          </div>
```
Replace with (gate on `gstEnabled`, show the real percentage):
```tsx
          {gstEnabled && (
            <div className="flex justify-between text-sm">
              <span className="text-text-2">GST ({taxPercent}%)</span>
              <span className="text-text tabular-nums">{formatPrice(taxPaise)}</span>
            </div>
          )}
```

- [ ] **Step 4: Type-check + lint**

Run: `pnpm --filter student-app type-check && pnpm --filter student-app lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/student-app/src/app/\(main\)/cart/page.tsx
git commit -m "feat(cart): show per-canteen GST rate, hide GST line when off"
```

---

## Task 5: Cart preview sheet — fetch canteen + apply rate

**Files:**
- Modify: `apps/student-app/src/components/cart/cart-sheet.tsx:7-8,14-17,110-113`

- [ ] **Step 1: Import useQuery and read canteenId**

At the top (lines 7-8) add the TanStack import beneath the existing store import:
```ts
import { useCartStore, useCartSubtotal, useCartTax, useCartTotal, useCartTotalItems } from '@/store/cart-store';
import { useQuery } from '@tanstack/react-query';
```
At line 14, add `canteenId` to the destructure:
```ts
  const { items, canteenId, updateQuantity, removeItem, clearCart } = useCartStore();
```

- [ ] **Step 2: Fetch the canteen and derive the rate**

Immediately after the `useCartStore` line (before the `useCartSubtotal`/`useCartTax` calls at lines 15-17), insert:
```ts
  const { data: canteen } = useQuery({
    queryKey: ['canteen', canteenId],
    queryFn: () =>
      fetch(`/api/v1/canteens/${canteenId}`)
        .then((r) => r.json())
        .then(
          (j) =>
            j.data as { gst_enabled?: boolean; tax_percentage?: number | string } | null
        ),
    enabled: !!canteenId,
  });
  const gstEnabled = canteen?.gst_enabled !== false;
  const taxPercent = Number(canteen?.tax_percentage ?? 5);
  const taxRate = gstEnabled ? taxPercent / 100 : 0;
```
Then update lines 16-17 to pass the rate:
```ts
  const taxPaise = useCartTax(taxRate);
  const totalPaise = useCartTotal(taxRate);
```

- [ ] **Step 3: Dynamic label + hide the GST row when off**

At lines 110-113:
```tsx
            <div className="flex justify-between text-sm">
              <span className="text-text-2">GST (5%)</span>
              <span className="text-text tabular-nums">{formatPrice(taxPaise)}</span>
            </div>
```
Replace with:
```tsx
            {gstEnabled && (
              <div className="flex justify-between text-sm">
                <span className="text-text-2">GST ({taxPercent}%)</span>
                <span className="text-text tabular-nums">{formatPrice(taxPaise)}</span>
              </div>
            )}
```

- [ ] **Step 4: Type-check + lint**

Run: `pnpm --filter student-app type-check && pnpm --filter student-app lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/student-app/src/components/cart/cart-sheet.tsx
git commit -m "feat(cart): apply per-canteen GST rate in cart preview sheet"
```

---

## Task 6: Invoices & order detail — hide GST when `tax_paise` is 0

**Files:**
- Modify: `apps/student-app/src/app/invoice/[id]/page.tsx:111-114`
- Modify: `apps/student-app/src/app/(main)/orders/[id]/page.tsx:235-238`

These pages only know the stored `tax_paise`, so they gate on `tax_paise > 0` — matching the existing `discount_paise > 0` pattern already used right below each GST row.

**Note:** the admin order-detail page (`apps/admin-app/src/app/(dashboard)/orders/[id]/page.tsx`) renders **no GST/price breakdown**, so no change is needed there.

- [ ] **Step 1: Student invoice**

In `apps/student-app/src/app/invoice/[id]/page.tsx`, lines 111-114:
```tsx
          <div className="flex justify-between">
            <span className="text-text-2">GST</span>
            <span className="tabular-nums">{formatPrice(order.tax_paise)}</span>
          </div>
```
Replace with:
```tsx
          {order.tax_paise > 0 && (
            <div className="flex justify-between">
              <span className="text-text-2">GST</span>
              <span className="tabular-nums">{formatPrice(order.tax_paise)}</span>
            </div>
          )}
```

- [ ] **Step 2: Student order detail**

In `apps/student-app/src/app/(main)/orders/[id]/page.tsx`, lines 235-238:
```tsx
              <div className="flex justify-between text-sm">
                <span className="text-text-2">GST</span>
                <span className="tabular-nums">{formatPrice(order.tax_paise)}</span>
              </div>
```
Replace with:
```tsx
              {order.tax_paise > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-text-2">GST</span>
                  <span className="tabular-nums">{formatPrice(order.tax_paise)}</span>
                </div>
              )}
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter student-app type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "apps/student-app/src/app/invoice/[id]/page.tsx" "apps/student-app/src/app/(main)/orders/[id]/page.tsx"
git commit -m "feat(invoices): hide GST line when tax is zero (GST off)"
```

---

## Task 7: Admin API — accept GST fields (super-admin only) + list select

**Files:**
- Modify: `apps/admin-app/src/app/api/v1/admin/canteens/[id]/route.ts:131-143`
- Modify: `apps/admin-app/src/app/api/v1/admin/canteens/route.ts:43`
- Modify: `apps/admin-app/src/types/index.ts:77`

- [ ] **Step 1: Add GST fields to the admin `Canteen` type**

In `apps/admin-app/src/types/index.ts`, after line 77 (`cash_payments_enabled?: boolean;`) add:
```ts
  // GST billing — super_admin controlled. When gst_enabled is false, no GST is
  // charged on student orders at this canteen. Read-only for canteen admins.
  gst_enabled?: boolean;
  tax_percentage?: number | string;
```

- [ ] **Step 2: Return GST fields from the canteen list**

In `apps/admin-app/src/app/api/v1/admin/canteens/route.ts`, line 43:
```ts
    .select('id, name, code, institute_id, is_active, billing_state, location, building, floor, opens_at, closes_at, is_open, description, cash_payments_enabled')
```
Add the two fields:
```ts
    .select('id, name, code, institute_id, is_active, billing_state, location, building, floor, opens_at, closes_at, is_open, description, cash_payments_enabled, gst_enabled, tax_percentage')
```

- [ ] **Step 3: Accept + super-admin-gate the fields in PUT**

In `apps/admin-app/src/app/api/v1/admin/canteens/[id]/route.ts`, line 132 destructures the body:
```ts
  const { name, location, description, opening_time, closing_time, is_active, is_open, image_url, cash_payments_enabled } = body;
```
Add `gst_enabled, tax_percentage`:
```ts
  const { name, location, description, opening_time, closing_time, is_active, is_open, image_url, cash_payments_enabled, gst_enabled, tax_percentage } = body;
```
Then, immediately after the existing whitelist block (after line 143, the `cash_payments_enabled` line, before the `service.from('canteens').update(updates)` call), insert:
```ts
  // GST billing is a super_admin-only control. For any other role these fields are
  // silently ignored so their remaining edits still apply (canteen admins see GST
  // as read-only). tax_percentage is validated to a sane 0–100 range.
  if (profile.role === 'super_admin') {
    if (gst_enabled !== undefined) updates.gst_enabled = !!gst_enabled;
    if (tax_percentage !== undefined) {
      const pct = Number(tax_percentage);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        return NextResponse.json(
          { success: false, error: { code: 'INVALID_TAX', message: 'GST percentage must be between 0 and 100.' } },
          { status: 400 }
        );
      }
      updates.tax_percentage = Math.round(pct * 100) / 100;
    }
  }
```

- [ ] **Step 4: Type-check**

Run: `pnpm --filter admin-app type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "apps/admin-app/src/app/api/v1/admin/canteens/[id]/route.ts" apps/admin-app/src/app/api/v1/admin/canteens/route.ts apps/admin-app/src/types/index.ts
git commit -m "feat(admin): accept super-admin-only GST fields on canteen update"
```

---

## Task 8: Admin UI — read-only badge + super-admin GST editor

**Files:**
- Modify: `apps/admin-app/src/app/(dashboard)/canteens/page.tsx` — imports (line 6-10), card body (~line 483), `EditCanteenDialog` props + render site (line 237, 491-559), dialog JSX (~line 679)

- [ ] **Step 1: Import a GST icon**

In the lucide import block (lines 6-10), add `Percent` to the imported icons list, e.g. change the last import line:
```ts
  CreditCard, Trash2, AlertTriangle, Banknote,
```
to:
```ts
  CreditCard, Trash2, AlertTriangle, Banknote, Percent,
```

- [ ] **Step 2: Add the read-only GST badge to the card**

In `CanteenCard`, directly after the Pay-by-cash `<button>` (it closes at line ~483, just before the closing `</div>` of the actions area), add a read-only status pill:
```tsx
        {/* GST status — read-only here; super_admin edits it in the Edit dialog */}
        <div
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border w-full justify-center ${
            canteen.gst_enabled === false
              ? 'bg-bg-2 text-text-2 border-border'
              : 'bg-green-light text-green-dark border-green/20'
          }`}
        >
          <Percent className="w-3.5 h-3.5" />
          {canteen.gst_enabled === false
            ? 'GST off'
            : `GST ${Number(canteen.tax_percentage ?? 5)}%`}
        </div>
```

- [ ] **Step 3: Pass `isSuperAdmin` into `EditCanteenDialog`**

At the render site (line 237):
```tsx
        <EditCanteenDialog
          canteen={editCanteen}
          onClose={() => setEditCanteen(null)}
```
add the prop:
```tsx
        <EditCanteenDialog
          canteen={editCanteen}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setEditCanteen(null)}
```

- [ ] **Step 4: Accept the prop + GST state in `EditCanteenDialog`**

Update the component signature (lines 491-499):
```tsx
function EditCanteenDialog({
  canteen,
  onClose,
  onSuccess,
}: {
  canteen: CanteenWithStats;
  onClose: () => void;
  onSuccess: () => void;
}) {
```
to:
```tsx
function EditCanteenDialog({
  canteen,
  isSuperAdmin,
  onClose,
  onSuccess,
}: {
  canteen: CanteenWithStats;
  isSuperAdmin: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
```
Then add GST local state alongside the other `useState` calls (after line 503, `const [serverError, setServerError] = useState('');`):
```tsx
  const [gstEnabled, setGstEnabled] = useState(canteen.gst_enabled !== false);
  const [taxPercentage, setTaxPercentage] = useState(String(canteen.tax_percentage ?? 5));
```

- [ ] **Step 5: Include GST fields in the PUT payload (super-admin only)**

In `onSubmit` (lines 544-551), the axios PUT body is:
```ts
      await axios.put(`/api/v1/admin/canteens/${canteen.id}`, {
        name: values.name,
        location: values.location,
        description: values.description || null,
        opening_time: values.opening_time,
        closing_time: values.closing_time,
        image_url: imageUrl || null,
      });
```
Replace with a version that conditionally spreads the GST fields:
```ts
      await axios.put(`/api/v1/admin/canteens/${canteen.id}`, {
        name: values.name,
        location: values.location,
        description: values.description || null,
        opening_time: values.opening_time,
        closing_time: values.closing_time,
        image_url: imageUrl || null,
        ...(isSuperAdmin
          ? { gst_enabled: gstEnabled, tax_percentage: Number(taxPercentage) }
          : {}),
      });
```

- [ ] **Step 6: Render the GST editor section (super-admin only)**

In the form, after the Description block (it closes at line ~679, before the `<div className="flex gap-3 pt-1">` action buttons), insert:
```tsx
          {/* GST billing — super_admin only */}
          {isSuperAdmin && (
            <div className="border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text">GST billing</p>
                  <p className="text-xs text-text-3 mt-0.5">
                    When off, students are charged no GST at this canteen.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setGstEnabled((v) => !v)}
                  aria-pressed={gstEnabled}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                    gstEnabled
                      ? 'bg-green-light text-green-dark border-green/20 hover:bg-green-light/70'
                      : 'bg-bg-2 text-text-2 border-border hover:bg-bg'
                  }`}
                >
                  {gstEnabled ? (
                    <><ToggleRight className="w-3.5 h-3.5" /> On</>
                  ) : (
                    <><ToggleLeft className="w-3.5 h-3.5" /> Off</>
                  )}
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-text mb-1.5">GST percentage</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={taxPercentage}
                  onChange={(e) => setTaxPercentage(e.target.value)}
                  disabled={!gstEnabled}
                  placeholder="5"
                />
              </div>
            </div>
          )}
```
(`ToggleLeft`/`ToggleRight`/`Input` are already imported in this file.)

- [ ] **Step 7: Type-check + lint**

Run: `pnpm --filter admin-app type-check && pnpm --filter admin-app lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add "apps/admin-app/src/app/(dashboard)/canteens/page.tsx"
git commit -m "feat(admin): per-canteen GST badge + super-admin GST editor"
```

---

## Task 9: Full verification

- [ ] **Step 1: Whole-monorepo type-check + lint**

Run: `pnpm type-check && pnpm lint`
Expected: PASS for both apps.

- [ ] **Step 2: Production build sanity**

Run: `pnpm build`
Expected: both apps build without errors.

- [ ] **Step 3: Manual verification (requires the migration applied to a dev Supabase)**

Use the `verify` skill / browser to confirm end-to-end:
1. As **super_admin**, edit a canteen → toggle GST **off** → Save. Card shows **"GST off"**.
2. As a **student** at that canteen: cart preview and checkout page show **no GST row**; total = subtotal (− discount). Place the order → order stored with `tax_paise = 0`. Open the invoice and order detail → **no GST line**.
3. As **super_admin**, set the same canteen to GST **on at 12%**. Student cart shows **"GST (12%)"**; a placed order charges 12%; invoice shows the GST line.
4. A canteen left untouched still charges **5%** (unchanged from before).
5. As a **canteen_admin**: the card shows the read-only **"GST 5%"** badge; opening Edit shows **no GST section**. Confirm a direct `PUT /api/v1/admin/canteens/{id}` with `{ "gst_enabled": false }` as canteen_admin leaves the value unchanged (fields ignored).
6. Confirm the kiosk scan flow still displays the correct stored totals for a GST-off order (reads `tax_paise`; no recompute).

- [ ] **Step 4: Final commit (if any manual-fix follow-ups)**

Only if fixes were needed:
```bash
git add -A
git commit -m "fix(gst): address manual-verification findings"
```
