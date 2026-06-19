# Admin: Prep Board + Forecast, Global Scoping, and Order-Record Cleanup

- **Date:** 2026-06-19
- **App:** MunchAdda (admin-app + student-app)
- **Status:** Approved design — pending spec review

## Overview

Six related improvements to the admin experience (one touches the student app):

1. **Orders Prep Board + Forecast** — a live "what to cook" board and a history-based demand forecast on the admin Orders page, per canteen.
2. **Hide super_admin + make them un-suspendable** in the users area.
3. **Activate-institute UI** (the API already supports it).
4. **(folded into #5)** Menu management institute-scoped for super_admin.
5. **Global Institute→Canteen scope context** for super_admin across the admin app.
6. **Drop unpaid orders** (`payment_pending`, `payment_failed`) from all order *listings*.

All API work reuses the shared `apps/admin-app/src/lib/auth.ts` helpers (`requireAdmin`, `allowedCanteenIds`, `canAccessCanteen`, `canAccessInstitute`). The service-role client bypasses RLS, so every new route enforces role + tenant scoping itself.

---

## Item 1 — Orders Prep Board + Forecast

Two new sections at the top of the admin Orders page, **per canteen**. Both consume the global scope context (Item 5): they require a *specific* canteen — if the super_admin scope is "All canteens", show a prompt to pick a canteen.

### 1a. Prep Board (live)
Aggregates `order_items` for the selected canteen into per-item counts, split into two buckets:
- **To cook** = Σ quantity where parent order `status ∈ {confirmed, preparing}`
- **Ready** = Σ quantity where parent order `status = ready`

Grouped by `menu_item_id` using the `order_items.menu_item_name` snapshot for the label (renamed items still group correctly). Sorted by "To cook" desc. Reuses the Orders page's existing 30s `refetchInterval`.

**Endpoint:** `GET /api/v1/admin/orders/prep?canteen_id=<uuid>`
- `requireAdmin()` (all admin roles); reject unless `canAccessCanteen(canteen_id, allowedCanteenIds(profile))`.
- Returns `{ success, data: [{ menu_item_id, name, to_cook, ready }] }`.
- Empty → `data: []` (UI shows "Nothing to prepare right now.").

### 1b. Forecast (Today + Tomorrow)
Per-item predicted units for **today** (primary) and **tomorrow** (peek), Option-A statistical, history-only (no calendar/weather).

**SQL function** `forecast_canteen_demand(p_canteen_id uuid, p_target_date date)` → `TABLE(menu_item_id uuid, name text, predicted int, basis text)`, `SECURITY DEFINER`, `SET search_path = public`:
- `target_dow = extract(dow from p_target_date)`.
- **History set:** `order_items` joined to `orders` for the canteen where the order is *paid* (`payment_status = 'paid'`), excluding `cancelled`/`refunded`, within the last ~42 days.
- **Weekday average:** for each item, average daily quantity across the days matching `target_dow` in that window (count distinct order days for the divisor).
- **Trend factor:** `(avg daily qty over last 14 days) / (avg daily qty over the prior 14–42 days)`, **clamped to [0.5, 2.0]**; default `1.0` when the prior window is empty.
- `predicted = round(weekday_avg * trend_factor)`.
- **Cold start / basis:** if the target weekday occurs `< 2` times in history → `basis = 'insufficient_data'` and `predicted = NULL` (UI shows "Not enough data yet"); otherwise `basis = 'history'`.

**Endpoint:** `GET /api/v1/admin/orders/forecast?canteen_id=<uuid>&date=<YYYY-MM-DD>`
- Same auth/scope as prep. Calls the function for `date` (today) and `date + 1` (tomorrow).
- Returns `{ success, data: { today: [...], tomorrow: [...] } }`.
- Computed **on-the-fly** (no cron/extra table; volumes are small). A daily snapshot table is explicitly out of scope unless performance later demands it.

### 1c. Frontend
- `components/orders/prep-board.tsx` and `components/orders/forecast-board.tsx`.
- Rendered above the orders table on `(dashboard)/orders/page.tsx`.
- React-query keys include the selected `canteen_id`.

---

## Item 2 — Hide super_admin, make un-suspendable

- **List API** `GET /api/v1/admin/users`: when `caller.role !== 'super_admin'`, add `.neq('role', 'super_admin')`. (canteen_admin remains institute-scoped on top.)
- **Update API** `PUT /api/v1/admin/users/[id]`: after loading the target, if `target.role === 'super_admin'`, **reject the request with 403** ("Super admin accounts cannot be modified here") — no field changes, no `is_active` toggle, by anyone. Super_admins are managed directly in the DB. This makes suspending a super_admin "not at all possible" and prevents lockout.
- **UI** (`users/page.tsx`): filter out `role === 'super_admin'` rows client-side as defense-in-depth.

---

## Item 3 — Activate institute (UI only)

The `PUT /api/v1/admin/institutes/[id]` route already accepts `is_active`. Frontend only:
- On `(dashboard)/institutes/page.tsx`, show an **Active/Inactive** badge and a status action: **Activate** (`PUT { is_active: true }`) for inactive institutes, **Deactivate** for active ones. No backend change.

---

## Item 5 — Global Institute→Canteen scope context (super_admin)

A single **persistent** scope, set once and applied app-wide.

- **Store:** `store/scope-store.ts` (zustand, persisted to localStorage): `{ instituteId: string | null, canteenId: string | null, setInstitute, setCanteen }`. `null` = "All". Setting institute resets canteen.
- **Selector:** in the admin header/topbar, rendered **only for super_admin**: an Institute `<select>` (from `/api/v1/admin/institutes`) + a Canteen `<select>` (from `/api/v1/admin/canteens` filtered by the chosen institute). Both default to "All".
- **Consuming pages:** **Orders, Menu, Kiosks, Analytics, Staff, Dashboard**. Each includes `instituteId`/`canteenId` in its react-query key and passes them as API query params. (Canteens/Institutes/Users pages are already institute-level and unchanged.)
- **API:** each consumed list endpoint accepts optional `institute_id` / `canteen_id` filters. These can only **narrow within the caller's allowed scope** — for super_admin they filter; for canteen_admin/staff the existing `allowedCanteenIds` scoping already constrains results, so a passed filter is intersected, never widened. Endpoints already taking `canteen_id` (orders) just add `institute_id`; others add both.
- **Non-super-admin:** no selector shown; behavior unchanged (auto-scoped).
- **Prep/Forecast (Item 1)** require a concrete canteen; if scope canteen is "All", the Orders page prompts the super_admin to select one.

---

## Item 6 — Drop unpaid orders from listings

Unpaid orders (`payment_pending`, `payment_failed`) are never shown as records. **Rows stay in the DB** (needed for the payment flow, coupon `release_coupon`, and stock integrity) — this is a query/display filter only.

- **Student** `GET /api/v1/orders`: exclude `payment_pending` and `payment_failed`.
- **Student** orders UI: remove `payment_pending` from `ACTIVE_ORDER_STATUSES` so the active view doesn't expect unpaid orders.
- **Admin** `GET /api/v1/admin/orders`: exclude both statuses by default; **remove** `payment_pending` (and `payment_failed`) from the status-filter dropdown on the orders page.
- **Detail-by-id** (`orders/[id]`) remains functional for support, but unpaid orders are not linked from any list.

---

## Security & authorization

- All new admin endpoints go through `requireAdmin(...)` + `allowedCanteenIds`/`canAccessCanteen`; the global-scope filters can only narrow, never widen, a caller's allowed set.
- `forecast_canteen_demand` is `SECURITY DEFINER` but takes a `canteen_id` the route has already authorized; it performs no auth itself.

## Testing

- **Forecast function:** seed historical paid orders across several same-weekday dates; assert weekday-average + clamped-trend math, and `insufficient_data` cold-start (<2 weekday occurrences).
- **Prep endpoint:** orders across statuses → assert `to_cook` counts only confirmed/preparing and `ready` only ready; cross-canteen orders excluded.
- **Authz:** canteen_admin/staff cannot read another canteen's prep/forecast; passing a foreign `canteen_id`/`institute_id` filter returns nothing (not widened).
- **Item 2:** non-super-admin list excludes super_admins; PUT on a super_admin target → 403.
- **Item 6:** unpaid orders absent from student and admin lists; still present by direct id.

## Out of scope (non-goals)

- Calendar/holiday/exam-period and weather signals (explicitly dropped — Option A only).
- ML models / separate forecasting service.
- Daily forecast snapshot table (add later only if on-the-fly proves slow).
- Item 4 (subscription ↔ active-status linking) — dropped by the user.
- Deleting/auto-purging unpaid order rows (we only hide them).

## Deploy notes

- New SQL: `forecast_canteen_demand` (ship as a migration file in repo root, run in Supabase).
- Frontend + API changes are in **admin-app** (Items 1,2,3,5 and admin half of 6) and **student-app** (student half of 6). Both deployed via `vercel --prod` from their app folders.
