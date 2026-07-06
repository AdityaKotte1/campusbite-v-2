# Separate-Billing (Order-Alone) Categories

**Date:** 2026-07-06
**Status:** Approved — ready for implementation planning

## Problem

In the student app, a canteen's menu shows all categories (breakfast, maincourse,
beverages, juices, …) and the cart lets a student freely mix items from any of
them. Canteen operators want to mark certain categories as **order-alone**: items
in such a category cannot share a cart/order with items from any other category.

Example: if the admin marks **Juices** as separate-billing, a student may order one
or more juices together, but cannot combine juices with breakfast, maincourse, etc.
in the same order.

## Decisions (locked)

- **Rule:** Order-alone / isolated. A separate-billing category's items can ONLY be
  ordered by themselves — never in the same cart/order as items from ANY other
  category (including another separate-billing category).
- **Conflict UX:** Block + explain. The existing cart is left untouched; a toast
  explains why the item could not be added.
- **Who sets it:** Both `super_admin` and `canteen_admin` (same roles that manage
  categories today).

## Cart Invariant

At all times the cart is one of:
1. **Empty**, or
2. **All items from a single separate-billing category** (multiple items from that
   one category are fine), or
3. **Any mix of non-separate categories** (today's default behavior).

## Data Model

Add one column to the existing `categories` table:

```sql
alter table categories
  add column separate_billing boolean not null default false;
```

- `false` (default) = mixable, current behavior.
- `true` = order-alone.
- Delivered as a root-level migration file `category-separate-billing.sql`
  (matches this repo's convention, e.g. `supabase-add-canteen.sql`,
  `fix-order-integrity.sql`) and recorded in the pending-migrations memory so it is
  run in Supabase before deploy.

## Admin App

Both `super_admin` and `canteen_admin` (the existing category create/edit roles).

- **Category form** (`apps/admin-app/src/app/(dashboard)/menu/page.tsx`): add a
  toggle labelled **"Bill separately (must be ordered on its own)"**. Add
  `separate_billing` to the `categorySchema` (default `false`).
- **POST** `/api/v1/admin/categories`: accept `separate_billing` from the body and
  include it in the insert (default `false`).
- **PUT** `/api/v1/admin/categories/[id]`: add `separate_billing` to the updatable
  field whitelist.
- **Category list row:** show a small **"Separate billing"** badge when the flag is
  on.

## Student App — Data Flow

- `menu-items` API
  (`apps/student-app/src/app/api/v1/canteens/[canteenId]/menu-items/route.ts`):
  extend the category join to
  `category:categories(id, name, separate_billing)`.
- `Category` type (`apps/student-app/src/types/index.ts`): add
  `separate_billing: boolean`.
- `MenuItem.category` therefore carries the flag into the cart.

## Cart Enforcement (client)

File: `apps/student-app/src/store/cart-store.ts`

- `addItem` returns `{ ok: boolean; reason?: string }` instead of `void`.
- The existing different-canteen clear behavior is unchanged (a different canteen
  still clears the cart first, then the separate-billing rule is evaluated against
  the now-empty cart, so it always passes).
- Block logic (evaluated after canteen reconciliation):
  - Let `newRestricted = item.category?.separate_billing === true`.
  - If `newRestricted`: block when any existing cart item has a different
    `category_id`. Reason references the new item's category name.
  - Else (normal item): block when any existing cart item is separate-billing.
    Reason references the restricted category already in the cart.
- A missing/unknown `separate_billing` (e.g. a cart persisted before this feature)
  is treated as `false` — safe, because the server also enforces the rule.

File: `apps/student-app/src/components/menu/menu-item-card.tsx`

- `handleAdd` checks the `addItem` result; on `!ok` it calls the existing
  `showToast(reason, 'error')` and does not mutate the cart.

Minor UX: surface an "Ordered separately" hint on a separate-billing category (e.g.
in the category tab / section header) so students understand the constraint before
they hit the block.

## Server Enforcement (orders POST) — Security

File: `apps/student-app/src/app/api/v1/orders/route.ts`

Client-side blocking is bypassable, so the order API must enforce the same rule
(this repo already creates orders server-side with computed prices for exactly this
reason).

- Extend the menu-items select in the POST handler to include `category_id` and the
  category's `separate_billing` (join `categories(separate_billing)`).
- After the existing availability/stock validation, evaluate the cart invariant:
  - If any ordered item belongs to a separate-billing category AND the order spans
    more than one distinct `category_id`, reject with
    `400 { error: 'mixed_billing_categories' }` and a human-readable message.
- Applies to both `online` and `cash` orders (same handler).

## Out of Scope (YAGNI)

- No "separate-billing categories can mix with each other" grouping — each isolated
  category is strictly alone.
- No auto-splitting a mixed cart into multiple orders.
- No changes to checkout/payment flow beyond the add-time block and the server
  rejection.

## Verification

Manual, through the running apps:
1. As admin, mark "Juices" as separate-billing; confirm the badge and that the flag
   persists on edit.
2. As a student: add a juice to an empty cart (allowed); add a second juice
   (allowed); try to add a breakfast item (blocked, toast shown, cart unchanged).
3. Reverse order: with a breakfast item in the cart, try to add a juice (blocked).
4. Switch canteens mid-cart still clears and works as before.
5. Send a hand-crafted `POST /api/v1/orders` payload mixing a juice with a breakfast
   item → API responds `400 mixed_billing_categories`.
