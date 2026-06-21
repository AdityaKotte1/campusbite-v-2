# Cash Payments + Counter Print Queue — Design

- **Date:** 2026-06-21
- **App:** MunchAdda (student-app, admin-app, kiosk agents: Pi + Windows)
- **Status:** Approved design (Option 1) — pending spec review

## 1. Overview

Add a **"Pay by cash"** option to the student app. A cash order is created as *pending*, staff **approve** it from a web page after collecting cash, and on approval the order is confirmed and its **bill prints at the counter**.

The key design choice (Option 1): **approval is decoupled from printing.** Approval is a web action by an authenticated staff member (needs a screen — runs on a counter PC, phone, or tablet). Printing is done by a **counter print agent** (the headless Pi *or* the Windows app) that drains a **server-side print queue**. This single mechanism works identically for PC counters and Pi-only counters.

## 2. Goals

- Students can choose cash; the order enters a pending-cash state with no online payment.
- Staff / canteen_admin approve cash orders from a web page on any screened device.
- On approval: order confirmed, payment recorded as cash, **bill printed at the counter** within ~1–2s.
- One print path for every counter type (Pi or PC).
- **Security (separation of duties):** the distributed agent is *print-only*; only authenticated staff can approve; every approval is audited.

## 3. Non-goals

- No change to the online (Razorpay) flow.
- The Windows app's internals (scanner/printer adapters, packaging, setup screen) are a **separate spec (Part 3)**; this spec only defines the print-queue contract it implements.
- Cash-drawer reconciliation / accounting exports.
- Auto-expiry of abandoned cash orders (staff cancel manually for now).

## 4. Scope & sequencing

- **Part 1 (core — backend + web):** cash order creation, admin Cash Payments approval page, print-queue backend. *Demoable end-to-end on the web.*
- **Part 2 (Pi agent):** the existing Pi kiosk polls the print queue and prints — makes cash work on **Pi counters** immediately.
- **Part 3 (Windows app — separate spec):** the Windows counter agent implements the **same** print-queue contract for **PC counters**, plus scanning online-order QRs.

This spec fully designs Parts 1 & 2 and defines the contract Part 3 must satisfy.

## 5. Data model

```
orders:
  + payment_method  TEXT NOT NULL DEFAULT 'online'  CHECK (payment_method IN ('online','cash'))
  + approved_by     UUID NULL  REFERENCES users(id)        -- staff who approved the cash
  + approved_at     TIMESTAMPTZ NULL

print_jobs (new):
  id              UUID PK DEFAULT gen_random_uuid()
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE
  canteen_id      UUID NOT NULL REFERENCES canteens(id) ON DELETE CASCADE  -- denormalized for fast agent polling + scoping
  kind            TEXT NOT NULL DEFAULT 'cash_bill'
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','printed','failed'))
  attempts        INTEGER NOT NULL DEFAULT 0
  printed_by_kiosk UUID NULL REFERENCES kiosks(id)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  printed_at      TIMESTAMPTZ NULL
  INDEX (canteen_id, status)                                   -- agents poll: WHERE canteen_id=? AND status='pending'
  -- partial unique to dedupe: at most one pending cash_bill per order
  UNIQUE (order_id, kind) WHERE status = 'pending'
```

**Cash order lifecycle:**
1. **Created:** `status='payment_pending'`, `payment_status='pending'`, `payment_method='cash'`. No Razorpay order, **no pickup QR yet.**
2. **Approved:** `status='confirmed'`, `payment_status='paid'`, `approved_by`, `approved_at` set → a `print_jobs` row is enqueued → `audit_logs` entry.
3. Then the **normal** lifecycle: `confirmed → preparing → ready → collected` (prep board, existing).

> **Visibility nuance (interacts with the "hide unpaid orders" rule):** cash orders sit at `payment_pending`, so they are correctly **hidden from the general orders list** (not yet paid). The **Cash Payments page queries them explicitly** (`payment_method='cash' AND status='payment_pending'`). The two rules coexist — general list hides, cash page shows.

> **DECISION TO CONFIRM (collection method for cash):** a cash order is collected via the **normal order lifecycle** (staff mark `ready`/`collected`, customer called by the **token number printed on the bill**) — **no separate pickup QR** is generated for cash. (Online orders keep their QR-scan pickup.) Flag if you'd rather cash orders also get a scannable pickup QR.

## 6. API endpoints

| Method/Path | Auth | Purpose |
|---|---|---|
| `POST /api/v1/orders` (student, **extend**) | student | Accept `payment_method: 'cash'`. For cash: create `payment_pending`/`cash`, skip Razorpay + QR, return order. |
| `GET /api/v1/admin/cash-orders?status=pending` | staff/canteen_admin/super_admin (canteen-scoped) | List cash orders awaiting approval for the caller's canteen(s). |
| `POST /api/v1/admin/orders/[id]/approve-cash` | staff/canteen_admin/super_admin (canteen-scoped) | Verify order is cash + `payment_pending`; set confirmed/paid/`approved_by`/`approved_at`; enqueue `print_job`; audit. **Idempotent** (already approved → no-op, no duplicate job). |
| `GET /api/v1/kiosk/print-queue` | **kiosk HMAC** (existing scheme) | Return this kiosk's-canteen `pending` jobs **with full receipt payload** (order #, items, totals, token, timestamps). Used for the **safety poll** and reconnect catch-up (not the per-second loop). |
| `POST /api/v1/kiosk/print-queue/[id]/ack` | **kiosk HMAC** | Body `{ result: 'printed' \| 'failed' }`. Sets `printed`/`failed`, `printed_at`, `printed_by_kiosk`, `attempts++`. **Ack stays on the HMAC REST path** (keeps the print-only data path clean). |
| `GET /api/v1/kiosk/realtime-token` | **kiosk HMAC** | Mint a **short-lived, canteen-scoped** Supabase JWT (signed with the project JWT secret, claim `kiosk_canteen_id`) for the agent's Realtime subscription. Refreshed before expiry. |
| `POST /api/v1/admin/orders/[id]/reprint` | staff/canteen_admin/super_admin (canteen-scoped) | Re-enqueue a `cash_bill` print job (paper jam / lost bill). |

All admin endpoints reuse `lib/auth.ts` (`requireAdmin` + `resolveCanteenScope`/`canAccessCanteen`). All kiosk endpoints reuse the existing HMAC auth (`verifyKioskHmac`) and resolve the canteen from the kiosk id.

## 7. Workflows — all scenarios

### Scenario A — Online payment (unchanged, for contrast)
Student → cart → **Pay online** (Razorpay) → pays → verify/webhook → `confirmed` + `paid(online)` + **QR token**. Student shows QR at the counter → Pi/Windows agent **scans** → prints receipt → `collected`.

### Scenario B — Cash, **PC counter**
1. Student → cart → **Pay by cash** → order created `payment_pending`/`cash`. App shows: *"Pay cash at the counter — Order #123."*
2. Student goes to the counter and gives the order number / shows the app.
3. Staff opens the admin web **Cash Payments** page on the counter PC → sees Order #123 → **collects cash** → clicks **Approve**.
4. Backend: order → `confirmed`/`paid(cash)`, `approved_by`/`approved_at` set, **print_job enqueued**, audit logged.
5. The PC's **Windows agent** (Part 3) is **subscribed via Supabase Realtime** to `print_jobs` for its canteen → the new job is **pushed in ~1s** → **prints the bill** (header + watermark + token) → acks `printed` over the HMAC REST endpoint.
6. Bill prints in ~1s. Order flows `confirmed → preparing → ready → collected` on the prep board; customer called by token.

### Scenario C — Cash, **Pi counter** (no screen at counter)
Identical to B, except staff approve on a **phone/tablet browser** (same admin web page), and the **headless Pi** is the agent polling `print-queue` → prints. **Same backend, same code path.**

### Scenario D — Network offline (resilience)
- **Approval needs connectivity** (it's a server action). If the staff device is offline, they can't approve until back online — cash is taken physically; approval/print catch up on reconnect.
- After approval, if the **print agent** is briefly offline, the job stays `pending` server-side; on reconnect the agent's next poll prints it. **Eventually consistent.**
- **Printer error** (out of paper): agent acks `failed` (or doesn't ack) → job stays `pending`/`failed` → retried on next poll once paper is fixed, or staff hit **Reprint**.

### Scenario E — Edge cases
- **Cancel before approval:** a `payment_pending` cash order can be cancelled (student/staff) → not approvable → no print.
- **Double approval / double print:** `approve-cash` is idempotent; the `UNIQUE(order_id,kind) WHERE pending` constraint prevents duplicate jobs; `ack` flips status so a job prints once.
- **Wrong canteen:** blocked by canteen scope on both approve and print-queue.
- **Abandoned (never paid):** stays `payment_pending`/`cash`, hidden from general lists; staff cancel stale ones.

## 8. Security model (Option 1)

- **Approval** is an authenticated staff/canteen_admin/super_admin action through the hardened admin API, canteen-scoped. The Pi/Windows agent **never** approves.
- The **agent holds only kiosk HMAC creds** → `print-queue` read + `ack` (print-only). If the distributed `.exe` or its creds leak, the worst case is reading/printing *already-approved* bills for that one canteen — it **cannot create or approve payments**.
- Every approval records `approved_by` + an `audit_logs` row (who, when, amount). Each print job records which kiosk printed and when. **Full who/what/when traceability.**
- `print-queue` returns only the authenticated kiosk's own-canteen jobs.

## 9. Deliverables

**Part 1 — backend + web**
- Migration `cash-payments.sql`: `orders.payment_method/approved_by/approved_at`, `print_jobs` table + indexes + RLS, and a SECURITY DEFINER `approve_cash_order(order_id, staff_id)` (atomic: confirm + enqueue job).
- Student app: cash option at checkout + `POST /orders` change (skip Razorpay/QR for cash).
- Admin app: **Cash Payments** page (list pending + **Approve** + **Reprint**), canteen-scoped, in the sidebar for staff/canteen_admin/super_admin.
- API routes: `approve-cash`, `cash-orders` list, `print-queue` GET, `print-queue ack`, `reprint`.

**Part 2 — Pi agent**
- A `print_worker` in the kiosk app: **subscribes via Supabase Realtime** to `print_jobs` for its canteen (using the minted scoped JWT), prints each pushed job via `printer.py`, acks over HMAC REST. Runs as a daemon thread alongside the scanner loop. Reuses the existing HMAC client for the token fetch + ack.
- **Safety net:** a low-frequency reconcile poll (every 30–60s) of `GET /print-queue` + a catch-up fetch on (re)connect, so a dropped WebSocket never strands a bill. JWT auto-refresh before expiry.

**Part 3 — Windows app (separate spec)**
- Same `print_worker` + scanner/printer adapters + first-run setup screen + PyInstaller packaging.

## 10. Testing

- Cash order create → appears on Cash Payments page, **absent** from the general orders list.
- Approve → status/`paid`/`approved_by`/`approved_at` set, one `print_job` enqueued, audit logged; **second** approve is a no-op (no duplicate job).
- `print-queue` returns only own-canteen `pending` jobs with correct receipt payload; `ack(printed)` flips status and stops re-serving.
- Scope: staff/canteen_admin cannot approve, list, or print another canteen's cash orders.
- Offline: agent reconnect drains pending jobs; **Reprint** re-enqueues.
- `approve_cash_order` SQL function: idempotent + atomic under concurrent double-click.
- Realtime: approving a cash order pushes the job to a subscribed agent in <2s; the JWT only authorizes its own canteen's `print_jobs` (cross-canteen subscribe returns nothing); reconnect drains anything missed while offline.

## 11. Realtime delivery (push, with safety net)

**Mechanism:** Supabase Realtime (WebSocket Postgres-changes), **not** a per-second poll and **not** a custom WebSocket server (the Vercel backend can't host long-lived sockets).

- **Enable Realtime** on `print_jobs`.
- **Scoped token:** the agent calls `GET /api/v1/kiosk/realtime-token` (kiosk HMAC). The server mints a short-lived JWT signed with the Supabase **JWT secret**, carrying claim `kiosk_canteen_id = <the kiosk's canteen>`. (Requires `SUPABASE_JWT_SECRET` in the admin/server env.)
- **RLS for Realtime:** a SELECT policy on `print_jobs` — `canteen_id = (auth.jwt() ->> 'kiosk_canteen_id')::uuid` — so the WebSocket only ever delivers that canteen's rows. The public **anon key** (already shipped in the web apps) is used for the socket; RLS + the JWT do the scoping.
- **Agent flow:** connect Realtime with anon key, `setAuth(jwt)`, subscribe to `INSERT on print_jobs where canteen_id=<mine>` → on push, print → `POST …/ack` over HMAC REST. Refresh the JWT before expiry.
- **Safety net:** a 30–60s reconcile poll of `GET /print-queue` + a catch-up fetch on connect/reconnect. Normal case = instant push; the poll only backstops dropped sockets.

**Security unchanged:** the distributed agent holds the public anon key + the kiosk HMAC secret (print-only) + an ephemeral canteen-scoped JWT (read-only, one canteen's `print_jobs`). It **cannot create or approve** payments. Approval remains an authenticated staff action, audited.

> **Collection method (defaulted):** cash orders are collected by the **printed token number** via the normal prep-board lifecycle — **no pickup QR** (online keeps its QR). Easy to add a cash QR later if wanted.
