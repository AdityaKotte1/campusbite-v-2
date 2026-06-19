# Admin Prep Board + Forecast, Global Scoping, Order-Record Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live prep board + history-based demand forecast to the admin Orders page, give super_admin a persistent Institute→Canteen scope across the admin app, hide/lock super_admin accounts, add an activate-institute UI, and stop showing unpaid orders.

**Architecture:** New per-canteen read endpoints in admin-app reuse the shared `lib/auth.ts` (role + tenant scoping over the service-role client). The forecast is a `SECURITY DEFINER` SQL function (history-only, weekday-average × clamped trend). A persisted zustand `scope-store` drives a super_admin-only header selector whose `institute_id`/`canteen_id` are passed as **narrowing-only** query params to existing list endpoints. Unpaid orders are filtered out of listings (rows retained in DB).

**Tech Stack:** Next.js 14 App Router, React 19, TypeScript, Supabase (PostgREST + plpgsql), zustand, @tanstack/react-query, axios.

**Verification model:** No unit-test harness is wired up in this repo. Each code task verifies with `npx tsc --noEmit -p apps/<app>/tsconfig.json` plus the explicit manual/SQL check given. The forecast SQL function gets a runnable seed-and-assert SQL test.

**Reference conventions:**
- Admin auth/scoping helper: `apps/admin-app/src/lib/auth.ts` (`requireAdmin`, `allowedCanteenIds`, `canAccessCanteen`, `canAccessInstitute`).
- Response shape: success `NextResponse.json({ success: true, data })`; errors via `forbidden()/notFound()` or `{ success:false, error:{ code, message } }`.
- Reference route to mirror: `apps/admin-app/src/app/api/v1/admin/orders/route.ts` (already scopes by `allowedCanteenIds`).

---

## Task 1: Forecast SQL function + test

**Files:**
- Create: `fix-forecast-function.sql` (repo root; run in Supabase like the other `fix-*.sql`)
- Create (test, runnable in Supabase): `docs/superpowers/plans/forecast-test.sql`

- [ ] **Step 1: Write the forecast function**

Create `fix-forecast-function.sql`:

```sql
-- History-only demand forecast (Option A). Weekday average over the last 6 weeks
-- × a recent-trend factor clamped to [0.5, 2.0]. SECURITY DEFINER; the calling
-- route authorizes the canteen, so the function does no auth itself.
CREATE OR REPLACE FUNCTION public.forecast_canteen_demand(
  p_canteen_id uuid,
  p_target_date date
)
RETURNS TABLE(menu_item_id uuid, name text, predicted integer, basis text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dow integer := extract(dow from p_target_date);
BEGIN
  RETURN QUERY
  WITH paid_items AS (
    SELECT oi.menu_item_id,
           oi.menu_item_name,
           oi.quantity,
           o.created_at::date AS order_date
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.canteen_id = p_canteen_id
      AND o.payment_status = 'paid'
      AND o.status <> 'cancelled'
      AND o.created_at::date >= p_target_date - 42
      AND o.created_at::date <  p_target_date
  ),
  weekday AS (
    SELECT menu_item_id, menu_item_name,
           sum(quantity)::numeric AS qty,
           count(DISTINCT order_date) AS day_count
    FROM paid_items
    WHERE extract(dow from order_date) = v_dow
    GROUP BY menu_item_id, menu_item_name
  ),
  recent AS (
    SELECT menu_item_id, sum(quantity)::numeric / 14.0 AS daily
    FROM paid_items
    WHERE order_date >= p_target_date - 14
    GROUP BY menu_item_id
  ),
  prior AS (
    SELECT menu_item_id, sum(quantity)::numeric / 28.0 AS daily
    FROM paid_items
    WHERE order_date < p_target_date - 14
    GROUP BY menu_item_id
  )
  SELECT
    w.menu_item_id,
    w.menu_item_name,
    CASE WHEN w.day_count < 2 THEN NULL
         ELSE round(
           (w.qty / w.day_count) *
           CASE WHEN p.daily IS NULL OR p.daily = 0 THEN 1.0
                ELSE least(2.0, greatest(0.5, COALESCE(r.daily, 0) / p.daily))
           END
         )::int
    END AS predicted,
    CASE WHEN w.day_count < 2 THEN 'insufficient_data' ELSE 'history' END AS basis
  FROM weekday w
  LEFT JOIN recent r ON r.menu_item_id = w.menu_item_id
  LEFT JOIN prior  p ON p.menu_item_id = w.menu_item_id
  ORDER BY predicted DESC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.forecast_canteen_demand(uuid, date) TO service_role, authenticated;
```

- [ ] **Step 2: Write a runnable test script**

Create `docs/superpowers/plans/forecast-test.sql` — seed two same-weekday history days for one item (qty 10 and 20 → avg 15, no prior window → trend 1.0 → predict 15), run inside a transaction and ROLLBACK so it leaves no data:

```sql
BEGIN;
-- assumes at least one canteen + one menu_item exist; pick them
DO $$
DECLARE c uuid; m uuid; mname text; o uuid; d1 date := current_date - 7; d2 date := current_date - 14;
BEGIN
  SELECT id INTO c FROM canteens LIMIT 1;
  SELECT id, name INTO m, mname FROM menu_items WHERE canteen_id = c LIMIT 1;
  -- two paid orders on the same weekday as `current_date`
  INSERT INTO orders(id, order_number, user_id, canteen_id, status, payment_status, subtotal_paise, tax_paise, discount_paise, total_paise, created_at)
    VALUES (gen_random_uuid(),'TST1',(SELECT id FROM users LIMIT 1),c,'collected','paid',1000,0,0,1000, d1) RETURNING id INTO o;
  INSERT INTO order_items(order_id, menu_item_id, menu_item_name, quantity, unit_price_paise, total_price_paise) VALUES (o,m,mname,10,1000,10000);
  INSERT INTO orders(id, order_number, user_id, canteen_id, status, payment_status, subtotal_paise, tax_paise, discount_paise, total_paise, created_at)
    VALUES (gen_random_uuid(),'TST2',(SELECT id FROM users LIMIT 1),c,'collected','paid',1000,0,0,1000, d2) RETURNING id INTO o;
  INSERT INTO order_items(order_id, menu_item_id, menu_item_name, quantity, unit_price_paise, total_price_paise) VALUES (o,m,mname,20,1000,20000);
  RAISE NOTICE 'Forecast for %: %', mname,
    (SELECT predicted FROM forecast_canteen_demand(c, current_date) WHERE menu_item_id = m);
  -- EXPECT: predicted = 15, basis = history
END $$;
ROLLBACK;
```

- [ ] **Step 3: Run both in the Supabase SQL editor**

Run `fix-forecast-function.sql` (creates the function), then `forecast-test.sql`.
Expected NOTICE: `Forecast for <item>: 15`. (If the item's weekday differs from today, adjust `d1/d2` to land on `current_date`'s weekday.)

- [ ] **Step 4: Commit**

```bash
git add fix-forecast-function.sql docs/superpowers/plans/forecast-test.sql
git commit -m "feat(db): forecast_canteen_demand function + test"
```

---

## Task 2: Prep + Forecast API routes

**Files:**
- Create: `apps/admin-app/src/app/api/v1/admin/orders/prep/route.ts`
- Create: `apps/admin-app/src/app/api/v1/admin/orders/forecast/route.ts`

- [ ] **Step 1: Prep route**

Create `prep/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin, allowedCanteenIds, canAccessCanteen, forbidden } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const { profile, response } = await requireAdmin();
  if (response) return response;

  const canteenId = new URL(request.url).searchParams.get('canteen_id');
  if (!canteenId) {
    return NextResponse.json(
      { success: false, error: { code: 'CANTEEN_REQUIRED', message: 'canteen_id is required' } },
      { status: 400 }
    );
  }
  const allowed = await allowedCanteenIds(profile);
  if (!canAccessCanteen(canteenId, allowed)) return forbidden('Cannot access this canteen');

  const service = createServiceClient();
  const { data, error } = await service
    .from('order_items')
    .select('menu_item_id, menu_item_name, quantity, orders!inner(canteen_id, status)')
    .eq('orders.canteen_id', canteenId)
    .in('orders.status', ['confirmed', 'preparing', 'ready']);

  if (error) {
    return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });
  }

  const map = new Map<string, { menu_item_id: string; name: string; to_cook: number; ready: number }>();
  for (const row of (data ?? []) as unknown as Array<{
    menu_item_id: string; menu_item_name: string; quantity: number; orders: { status: string };
  }>) {
    const key = row.menu_item_id;
    const entry = map.get(key) ?? { menu_item_id: key, name: row.menu_item_name, to_cook: 0, ready: 0 };
    if (row.orders.status === 'ready') entry.ready += row.quantity;
    else entry.to_cook += row.quantity; // confirmed | preparing
    map.set(key, entry);
  }
  const result = [...map.values()].sort((a, b) => b.to_cook - a.to_cook);
  return NextResponse.json({ success: true, data: result });
}
```

- [ ] **Step 2: Forecast route**

Create `forecast/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin, allowedCanteenIds, canAccessCanteen, forbidden } from '@/lib/auth';

type Row = { menu_item_id: string; name: string; predicted: number | null; basis: string };

export async function GET(request: NextRequest) {
  const { profile, response } = await requireAdmin();
  if (response) return response;

  const params = new URL(request.url).searchParams;
  const canteenId = params.get('canteen_id');
  const dateStr = params.get('date'); // YYYY-MM-DD (today, per caller's locale)
  if (!canteenId || !dateStr) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'canteen_id and date are required' } },
      { status: 400 }
    );
  }
  const allowed = await allowedCanteenIds(profile);
  if (!canAccessCanteen(canteenId, allowed)) return forbidden('Cannot access this canteen');

  const tomorrow = new Date(dateStr + 'T00:00:00Z');
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const service = createServiceClient();
  const run = async (d: string): Promise<Row[]> => {
    const { data, error } = await service.rpc('forecast_canteen_demand', {
      p_canteen_id: canteenId,
      p_target_date: d,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as Row[];
  };

  try {
    const [today, nextDay] = await Promise.all([run(dateStr), run(tomorrowStr)]);
    return NextResponse.json({ success: true, data: { today, tomorrow: nextDay } });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: { code: 'FORECAST_ERROR', message: (e as Error).message } },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit -p apps/admin-app/tsconfig.json`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/admin-app/src/app/api/v1/admin/orders/prep/route.ts apps/admin-app/src/app/api/v1/admin/orders/forecast/route.ts
git commit -m "feat(admin-api): prep aggregate + forecast endpoints"
```

---

## Task 3: Scope store + super_admin header selector

**Files:**
- Create: `apps/admin-app/src/store/scope-store.ts`
- Create: `apps/admin-app/src/components/layout/scope-selector.tsx`
- Modify: `apps/admin-app/src/components/layout/header.tsx` (render the selector for super_admin)

- [ ] **Step 1: Scope store (persisted)**

Create `scope-store.ts`:

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ScopeState {
  instituteId: string | null; // null = all institutes
  canteenId: string | null;   // null = all canteens
  setInstitute: (id: string | null) => void;
  setCanteen: (id: string | null) => void;
}

export const useScopeStore = create<ScopeState>()(
  persist(
    (set) => ({
      instituteId: null,
      canteenId: null,
      // Changing institute clears the canteen (it may not belong to the new one).
      setInstitute: (id) => set({ instituteId: id, canteenId: null }),
      setCanteen: (id) => set({ canteenId: id }),
    }),
    { name: 'munchadda-admin-scope' }
  )
);
```

- [ ] **Step 2: Scope selector component**

Create `scope-selector.tsx` (super_admin only; fetches institutes + canteens, filters canteens by chosen institute):

```tsx
'use client';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useScopeStore } from '@/store/scope-store';

type Inst = { id: string; name: string };
type Canteen = { id: string; name: string; institute_id?: string };

export function ScopeSelector() {
  const { instituteId, canteenId, setInstitute, setCanteen } = useScopeStore();

  const { data: institutes } = useQuery<{ data: Inst[] }>({
    queryKey: ['scope-institutes'],
    queryFn: () => axios.get('/api/v1/admin/institutes').then((r) => r.data),
  });
  const { data: canteens } = useQuery<{ data: Canteen[] }>({
    queryKey: ['scope-canteens', instituteId],
    queryFn: () =>
      axios
        .get('/api/v1/admin/canteens', { params: instituteId ? { institute_id: instituteId } : {} })
        .then((r) => r.data),
  });

  const sel = 'h-9 px-2 rounded-lg border border-border bg-surface text-sm text-text';
  return (
    <div className="flex items-center gap-2">
      <select className={sel} value={instituteId ?? ''} onChange={(e) => setInstitute(e.target.value || null)}>
        <option value="">All institutes</option>
        {(institutes?.data ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
      </select>
      <select className={sel} value={canteenId ?? ''} onChange={(e) => setCanteen(e.target.value || null)}>
        <option value="">All canteens</option>
        {(canteens?.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  );
}
```

- [ ] **Step 3: Render in header for super_admin only**

In `header.tsx`, import `useAuthStore` and `ScopeSelector`, read `const role = (useAuthStore((s)=>s.user) as {role?:string}|null)?.role`, and render `{role === 'super_admin' && <ScopeSelector />}` in the header's left/center area. (Match the existing header JSX; insert the conditional where toolbar items live.)

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p apps/admin-app/tsconfig.json` → exit 0.
Manual: log in as super_admin → two dropdowns appear in the header; as canteen_admin → none.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-app/src/store/scope-store.ts apps/admin-app/src/components/layout/scope-selector.tsx apps/admin-app/src/components/layout/header.tsx
git commit -m "feat(admin): persistent institute/canteen scope selector for super_admin"
```

---

## Task 4: Canteens API — accept `institute_id` filter (super_admin narrowing)

**Files:**
- Modify: `apps/admin-app/src/app/api/v1/admin/canteens/route.ts` (GET)

- [ ] **Step 1: Add narrowing filter**

In the GET handler, after the existing role/scope logic that builds the canteens query, read `const instituteId = new URL(request.url).searchParams.get('institute_id');` and, **only for super_admin** (whose scope is otherwise unrestricted), apply `if (instituteId) query = query.eq('institute_id', instituteId);`. For canteen_admin/staff do nothing (their existing scoping already constrains results — a filter must never widen).

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit -p apps/admin-app/tsconfig.json` → exit 0.
Manual (super_admin): `GET /api/v1/admin/canteens?institute_id=<X>` returns only X's canteens; without the param returns all.

- [ ] **Step 3: Commit**

```bash
git add apps/admin-app/src/app/api/v1/admin/canteens/route.ts
git commit -m "feat(admin-api): canteens list accepts institute_id narrowing filter"
```

---

## Task 5: Wire global scope into list pages

For each page below: import `useScopeStore`, add `instituteId`/`canteenId` to the react-query `queryKey`, and pass them as axios `params` (omit when null). The server endpoints already scope by role; these params only narrow for super_admin.

**Files (modify):**
- `apps/admin-app/src/app/(dashboard)/orders/page.tsx`
- `apps/admin-app/src/app/(dashboard)/menu/page.tsx`
- `apps/admin-app/src/app/(dashboard)/kiosks/page.tsx`
- `apps/admin-app/src/app/(dashboard)/analytics/page.tsx`
- `apps/admin-app/src/app/(dashboard)/staff/page.tsx`
- `apps/admin-app/src/app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Pattern (apply to each page's data query)**

```ts
import { useScopeStore } from '@/store/scope-store';
// inside component:
const { instituteId, canteenId } = useScopeStore();
// in useQuery:
queryKey: ['orders', statusFilter, dateFrom, dateTo, instituteId, canteenId],
queryFn: async () => {
  const params: Record<string, string> = { /* existing */ };
  if (instituteId) params.institute_id = instituteId;
  if (canteenId) params.canteen_id = canteenId;
  const { data } = await axios.get('/api/v1/admin/orders', { params });
  return data;
},
```

For **menu** (Item 4b): the canteen dropdown in the add/edit dialog should also filter to `instituteId` when set — pass the institute filter to its canteens query (it already fetches `/api/v1/admin/canteens`; add the `institute_id` param from the store).

- [ ] **Step 2: Ensure each consumed endpoint honors the params (narrowing-only)**

Confirm/extend these GET handlers to read `institute_id`/`canteen_id` and apply them ONLY as a narrowing `.eq(...)` (super_admin), intersecting—not replacing—existing scope:
- `admin/orders/route.ts` (already takes `canteen_id`; add `institute_id` → resolve to that institute's canteens and intersect `allowedCanteenIds`).
- `admin/menu-items/route.ts`, `admin/kiosks/route.ts`, `admin/analytics/route.ts`, `admin/staff/route.ts`, `admin/dashboard/route.ts`: add the same optional narrowing. Each computes its canteen set; intersect with the requested `canteen_id`/`institute_id` when present.

Implementation note for each: `const scoped = allowedCanteenIds(profile)` (null=super_admin). If a filter is present, compute `requested` canteen ids (the one canteen, or all canteens of the institute) and use `final = scoped === null ? requested : scoped.filter(id => requested.includes(id))`, then `.in('canteen_id', final)`. This guarantees no widening.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p apps/admin-app/tsconfig.json` → exit 0.
Manual (super_admin): pick an institute+canteen in the header → Orders/Menu/Kiosks/Analytics/Staff/Dashboard all show only that canteen's data; switch to "All" → full data returns. As canteen_admin: no selector, data still institute-scoped.

- [ ] **Step 4: Commit**

```bash
git add apps/admin-app/src/app/\(dashboard\)/ apps/admin-app/src/app/api/v1/admin/
git commit -m "feat(admin): consume global institute/canteen scope across list pages"
```

---

## Task 6: Orders page — Prep Board + Forecast UI

**Files:**
- Create: `apps/admin-app/src/components/orders/prep-board.tsx`
- Create: `apps/admin-app/src/components/orders/forecast-board.tsx`
- Modify: `apps/admin-app/src/app/(dashboard)/orders/page.tsx` (render both above the table)

- [ ] **Step 1: PrepBoard component**

```tsx
'use client';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

type PrepRow = { menu_item_id: string; name: string; to_cook: number; ready: number };

export function PrepBoard({ canteenId }: { canteenId: string | null }) {
  const { data } = useQuery<{ data: PrepRow[] }>({
    queryKey: ['prep', canteenId],
    queryFn: () => axios.get('/api/v1/admin/orders/prep', { params: { canteen_id: canteenId } }).then((r) => r.data),
    enabled: !!canteenId,
    refetchInterval: 30_000,
  });
  if (!canteenId) return <p className="text-sm text-text-3">Select a canteen to see the prep board.</p>;
  const rows = data?.data ?? [];
  return (
    <section className="bg-surface rounded-xl border border-border p-4">
      <h2 className="font-display text-lg font-semibold mb-3">Prep Board</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-text-3">Nothing to prepare right now.</p>
      ) : (
        <table className="w-full text-sm">
          <thead><tr className="text-text-3 text-xs uppercase">
            <th className="text-left py-1">Item</th><th className="text-right">To cook</th><th className="text-right">Ready</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.menu_item_id} className="border-t border-border">
                <td className="py-1.5">{r.name}</td>
                <td className="text-right font-semibold text-brand">{r.to_cook}</td>
                <td className="text-right text-text-2">{r.ready}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
```

- [ ] **Step 2: ForecastBoard component**

```tsx
'use client';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

type FRow = { menu_item_id: string; name: string; predicted: number | null; basis: string };
type FData = { today: FRow[]; tomorrow: FRow[] };

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ForecastBoard({ canteenId }: { canteenId: string | null }) {
  const { data } = useQuery<{ data: FData }>({
    queryKey: ['forecast', canteenId],
    queryFn: () =>
      axios.get('/api/v1/admin/orders/forecast', { params: { canteen_id: canteenId, date: todayStr() } }).then((r) => r.data),
    enabled: !!canteenId,
  });
  if (!canteenId) return null;
  const today = data?.data.today ?? [];
  const tomorrow = data?.data.tomorrow ?? [];
  const cell = (r: FRow) => (r.predicted == null ? <span className="text-text-3">Not enough data yet</span> : <span className="font-semibold">{r.predicted}</span>);
  return (
    <section className="bg-surface rounded-xl border border-border p-4">
      <h2 className="font-display text-lg font-semibold mb-1">Forecast</h2>
      <p className="text-xs text-text-3 mb-3">Based on this canteen&apos;s recent order history.</p>
      <div className="grid grid-cols-2 gap-6">
        {([['Today', today], ['Tomorrow', tomorrow]] as const).map(([label, rows]) => (
          <div key={label}>
            <p className="text-xs font-semibold uppercase text-text-3 mb-1">{label}</p>
            {rows.length === 0 ? <p className="text-sm text-text-3">No history.</p> : (
              <ul className="text-sm space-y-1">
                {rows.map((r) => <li key={r.menu_item_id} className="flex justify-between"><span>{r.name}</span>{cell(r)}</li>)}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Render on the Orders page**

In `orders/page.tsx`, import both components + `useScopeStore`, and above the `<DataTable …>` add:

```tsx
const { canteenId } = useScopeStore();
// ...in JSX, above the table:
<div className="grid gap-5 md:grid-cols-2">
  <PrepBoard canteenId={canteenId} />
  <ForecastBoard canteenId={canteenId} />
</div>
```

(For staff/canteen_admin there is no header selector, so `canteenId` is null and the boards prompt to select. Acceptable for v1; a follow-up can default staff to their assigned canteen. Note this limitation in the commit.)

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p apps/admin-app/tsconfig.json` → exit 0.
Manual (super_admin): pick a canteen → Prep Board lists to-cook/ready counts, Forecast lists Today/Tomorrow per item with "Not enough data yet" where history < 2 weekday samples.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-app/src/components/orders/ apps/admin-app/src/app/\(dashboard\)/orders/page.tsx
git commit -m "feat(admin): prep board + forecast UI on orders page"
```

---

## Task 7: Hide + lock super_admin (users)

**Files:**
- Modify: `apps/admin-app/src/app/api/v1/admin/users/route.ts` (GET list)
- Modify: `apps/admin-app/src/app/api/v1/admin/users/[id]/route.ts` (PUT)
- Modify: `apps/admin-app/src/app/(dashboard)/users/page.tsx` (UI filter)

- [ ] **Step 1: List excludes super_admin for non-super-admin callers**

In `users/route.ts` GET, after the role filter logic, add: `if (profile.role !== 'super_admin') query = query.neq('role', 'super_admin');`

- [ ] **Step 2: Block any modification of a super_admin target**

In `users/[id]/route.ts` PUT, right after the target is loaded (the `target` row already has `role`), add before building updates:

```ts
if (target.role === 'super_admin') {
  return forbidden('Super admin accounts cannot be modified from here');
}
```

(Uses the existing `forbidden` import from `@/lib/auth`.)

- [ ] **Step 3: UI defense filter**

In `users/page.tsx`, where the rows/data are consumed, filter out `role === 'super_admin'` before passing to the table (e.g. `const rows = (data?.data ?? []).filter(u => u.role !== 'super_admin')`).

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p apps/admin-app/tsconfig.json` → exit 0.
Manual: as canteen_admin, the users list shows no super_admins; `PUT /api/v1/admin/users/<super_admin_id>` returns 403 even as another super_admin.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-app/src/app/api/v1/admin/users/ apps/admin-app/src/app/\(dashboard\)/users/page.tsx
git commit -m "feat(admin): hide super_admin from lists and block modifying them"
```

---

## Task 8: Activate-institute UI

**Files:**
- Modify: `apps/admin-app/src/app/(dashboard)/institutes/page.tsx`

- [ ] **Step 1: Add status badge + activate/deactivate action**

For each institute row, render an Active/Inactive badge from `institute.is_active`. Add an action button: when `is_active === false` show **Activate** → `axios.put(`/api/v1/admin/institutes/${id}`, { is_active: true })` then invalidate the institutes query; when `true` show **Deactivate** → `{ is_active: false }`. Mirror the existing mutation/invalidation pattern already used on the page (it already has a deactivate/delete path — reuse its query client + toast).

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit -p apps/admin-app/tsconfig.json` → exit 0.
Manual (super_admin): an inactive institute shows **Activate**; clicking it flips the badge to Active and the row persists after refresh.

- [ ] **Step 3: Commit**

```bash
git add apps/admin-app/src/app/\(dashboard\)/institutes/page.tsx
git commit -m "feat(admin): activate/deactivate institute from the institutes page"
```

---

## Task 9: Drop unpaid orders from listings

**Files:**
- Modify: `apps/student-app/src/app/api/v1/orders/route.ts` (GET list)
- Modify: `apps/student-app/src/lib/constants.ts` (`ACTIVE_ORDER_STATUSES`)
- Modify: `apps/admin-app/src/app/api/v1/admin/orders/route.ts` (GET list)
- Modify: `apps/admin-app/src/app/(dashboard)/orders/page.tsx` (`STATUS_OPTIONS`)

- [ ] **Step 1: Student list excludes unpaid**

In the student `orders/route.ts` GET, on the orders query add:
`query = query.not('status', 'in', '("payment_pending","payment_failed")');`
(Place it before pagination/`.range`. PostgREST `in` value list uses parenthesised, double-quoted items.)

- [ ] **Step 2: Student active statuses**

In `constants.ts`, change `ACTIVE_ORDER_STATUSES` to drop `payment_pending`:
`export const ACTIVE_ORDER_STATUSES = ['confirmed', 'preparing', 'ready'];`

- [ ] **Step 3: Admin list excludes unpaid**

In admin `orders/route.ts` GET, add the same `.not('status', 'in', '("payment_pending","payment_failed")')` to `query`. Keep the explicit `status` filter working, but if a caller explicitly requests `status=payment_pending`/`payment_failed`, return empty (don't re-add them) — simplest: apply the exclusion unconditionally after the optional `status` filter.

- [ ] **Step 4: Admin filter dropdown**

In `orders/page.tsx`, change `STATUS_OPTIONS` to remove `payment_pending` and `payment_failed`:
`const STATUS_OPTIONS = ['all', 'confirmed', 'preparing', 'ready', 'collected', 'cancelled', 'refunded'];`

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit -p apps/student-app/tsconfig.json` and `-p apps/admin-app/tsconfig.json` → both exit 0.
Manual: create an order and abandon payment (stays `payment_pending`) → it does NOT appear in student order history or the admin orders list; a paid order does. Detail-by-id still loads for an unpaid order.

- [ ] **Step 6: Commit**

```bash
git add apps/student-app/src/app/api/v1/orders/route.ts apps/student-app/src/lib/constants.ts apps/admin-app/src/app/api/v1/admin/orders/route.ts apps/admin-app/src/app/\(dashboard\)/orders/page.tsx
git commit -m "feat: hide unpaid (payment_pending/failed) orders from all listings"
```

---

## Task 10: Final verification + deploy notes

- [ ] **Step 1: Full type-check both apps**

Run: `npx tsc --noEmit -p apps/admin-app/tsconfig.json` and `npx tsc --noEmit -p apps/student-app/tsconfig.json` → both exit 0.

- [ ] **Step 2: Run the new migration in Supabase**

Run `fix-forecast-function.sql` in the Supabase SQL editor (the only new DB object).

- [ ] **Step 3: Deploy**

```
cd apps/admin-app && vercel --prod
cd ../student-app && vercel --prod
```

- [ ] **Step 4: Smoke test** (super_admin): pick institute+canteen in header → every page scopes; Orders shows Prep Board + Forecast; users list hides super_admins; an inactive institute can be Activated; unpaid orders absent from lists.

---

## Notes / known follow-ups (out of scope for this plan)
- Staff/canteen_admin don't get the header selector, so Prep/Forecast on Orders prompt "select a canteen" for them. Follow-up: default staff to `assigned_canteen_id` and canteen_admin to a per-page canteen picker.
- Forecast is computed on-the-fly; if it gets slow at scale, add a daily snapshot table + cron.
