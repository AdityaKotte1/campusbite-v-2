# Cash Payments + Counter Print Queue — Implementation Plan (Parts 1 + 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let students pay by cash; staff approve cash orders in the admin web app; on approval the bill is pushed (Supabase Realtime) to the counter agent (Pi now, Windows later) and printed — agent stays print-only.

**Architecture:** Cash order = `payment_pending`/`payment_method='cash'`. Approval is an authenticated, canteen-scoped admin action that runs an atomic `approve_cash_order` SQL function (confirm + paid + enqueue a `print_jobs` row). The counter agent subscribes to `print_jobs` via Supabase Realtime (scoped by a short-lived kiosk JWT + RLS) — on push it **drains** via the existing kiosk-HMAC REST endpoint (fetch receipt → print → ack), with a 30–60s safety poll. Spec: `docs/superpowers/specs/2026-06-21-cash-payments-and-print-queue-design.md`.

**Tech Stack:** Next.js 14 API routes, Supabase (Postgres + RLS + Realtime), zod, React/react-query (admin), Python kiosk agent (`requests` + realtime-py), HMAC kiosk auth (existing `lib/kiosk-auth.ts`).

**Verification model:** No unit-test harness in repo. Web/API tasks verify with `npx tsc --noEmit -p apps/<app>/tsconfig.json` + the manual check given. SQL runs in the Supabase SQL editor. The Pi agent verifies by integration (manual) — noted per task. Do NOT use `git --no-verify`.

**Reference conventions:**
- Admin auth/scoping: `apps/admin-app/src/lib/auth.ts` (`requireAdmin`, `resolveCanteenScope`, `canAccessCanteen`).
- Kiosk HMAC: `apps/admin-app/src/lib/kiosk-auth.ts` (`verifyKioskHmac`, `isTimestampValid`); reference route `apps/admin-app/src/app/api/v1/kiosk/scan/route.ts`.
- Response shapes: admin → `{ success, data }` / errors via helper; student routes → `{ data }` / `{ error }`.

---

## Task 1: DB migration — schema, RLS, approve function, Realtime

**Files:** Create `cash-payments.sql` (repo root; run in Supabase SQL editor).

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================================
-- cash-payments.sql — cash orders + print queue + Realtime scoping
-- ============================================================================

-- 1) Orders: payment method + approval audit columns
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'online',
  ADD COLUMN IF NOT EXISTS approved_by    UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS approved_at    TIMESTAMPTZ;
DO $$ BEGIN
  ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_chk
    CHECK (payment_method IN ('online','cash'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Print queue
CREATE TABLE IF NOT EXISTS public.print_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  canteen_id       UUID NOT NULL REFERENCES public.canteens(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL DEFAULT 'cash_bill',
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','printed','failed')),
  attempts         INTEGER NOT NULL DEFAULT 0,
  printed_by_kiosk UUID REFERENCES public.kiosks(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  printed_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_print_jobs_canteen_status ON public.print_jobs(canteen_id, status);
-- dedupe: at most one PENDING job per (order, kind)
CREATE UNIQUE INDEX IF NOT EXISTS uq_print_jobs_pending
  ON public.print_jobs(order_id, kind) WHERE status = 'pending';

-- 3) RLS: print_jobs visible only to the kiosk's own canteen (for Realtime).
ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "print_jobs_kiosk_canteen_read" ON public.print_jobs;
CREATE POLICY "print_jobs_kiosk_canteen_read" ON public.print_jobs
  FOR SELECT
  USING (canteen_id = NULLIF(auth.jwt() ->> 'kiosk_canteen_id','')::uuid);
-- (All writes happen via the service role / SECURITY DEFINER fns, which bypass RLS.)

-- 4) Atomic approval: confirm + paid + enqueue print job. Idempotent.
CREATE OR REPLACE FUNCTION public.approve_cash_order(p_order_id UUID, p_staff_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); END IF;
  IF v.payment_method <> 'cash' THEN RETURN jsonb_build_object('ok', false, 'error', 'NOT_CASH'); END IF;
  IF v.payment_status = 'paid' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'order_id', p_order_id);  -- idempotent
  END IF;
  IF v.status <> 'payment_pending' THEN RETURN jsonb_build_object('ok', false, 'error', 'BAD_STATE'); END IF;

  UPDATE public.orders
     SET status='confirmed', payment_status='paid',
         approved_by=p_staff_id, approved_at=now(), updated_at=now()
   WHERE id=p_order_id;

  INSERT INTO public.print_jobs(order_id, canteen_id, kind, status)
  VALUES (p_order_id, v.canteen_id, 'cash_bill', 'pending')
  ON CONFLICT (order_id, kind) WHERE status='pending' DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'order_id', p_order_id, 'canteen_id', v.canteen_id);
END $$;

-- 5) Re-enqueue a bill (reprint), service-role only context
CREATE OR REPLACE FUNCTION public.reprint_cash_bill(p_order_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); END IF;
  INSERT INTO public.print_jobs(order_id, canteen_id, kind, status)
  VALUES (p_order_id, v.canteen_id, 'cash_bill', 'pending')
  ON CONFLICT (order_id, kind) WHERE status='pending' DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.approve_cash_order(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.reprint_cash_bill(UUID) TO service_role;

-- 6) Enable Realtime on print_jobs
ALTER PUBLICATION supabase_realtime ADD TABLE public.print_jobs;
```

- [ ] **Step 2: Run it in the Supabase SQL editor.** Expected: no errors; `print_jobs` exists; `\d print_jobs` shows the partial unique index; Realtime publication includes `print_jobs` (Dashboard → Database → Replication).
- [ ] **Step 3: Commit**
```bash
git add cash-payments.sql
git commit -m "feat(db): cash payments — orders cols, print_jobs, RLS, approve fn, realtime"
```

---

## Task 2: Student app — Pay by cash

**Files:** Modify `apps/student-app/src/app/api/v1/orders/route.ts` (POST); modify the checkout UI `apps/student-app/src/app/(main)/cart/page.tsx`.

- [ ] **Step 1: Accept `payment_method` in the order schema + skip online steps for cash.**
In `route.ts`, add to `createOrderSchema`: `payment_method: z.enum(['online','cash']).optional().default('online'),`. After the order + items are created (and coupon claimed + stock decremented exactly as today), set the new column on insert: add `payment_method` to the `orders.insert({...})` object using `parsed.data.payment_method`. For cash, the order is already created as `status:'payment_pending'`, `payment_status:'pending'` — which is exactly what cash needs, so **no Razorpay/QR step is involved** (those happen later in the payments flow only for online). Return the created order as today.

- [ ] **Step 2: Verify** — `npx tsc --noEmit -p apps/student-app/tsconfig.json` → exit 0.

- [ ] **Step 3: Checkout UI — add the cash option.**
In `cart/page.tsx`, READ the current checkout/place-order handler. Add a payment choice (two buttons or a radio): **Pay online** (existing Razorpay path) and **Pay by cash**. For cash: POST `/api/v1/orders` with `payment_method:'cash'`, then **skip Razorpay** and route to the order page / show a confirmation: *"Order placed — pay cash at the counter. Order #<order_number>."* Match the page's existing styling and toast pattern.

- [ ] **Step 4: Verify + commit**
```bash
npx tsc --noEmit -p apps/student-app/tsconfig.json   # exit 0
git add apps/student-app/src/app/api/v1/orders/route.ts "apps/student-app/src/app/(main)/cart/page.tsx"
git commit -m "feat(student): pay-by-cash option at checkout"
```
Manual: place a cash order → it is created `payment_pending`/`cash`; no Razorpay opens; it does NOT show in student order history (hidden-unpaid rule) — that's expected; it shows on the admin Cash Payments page (Task 5).

---

## Task 3: Admin API — approve, list, reprint

**Files:** Create `apps/admin-app/src/app/api/v1/admin/cash-orders/route.ts`; create `apps/admin-app/src/app/api/v1/admin/orders/[id]/approve-cash/route.ts`; create `apps/admin-app/src/app/api/v1/admin/orders/[id]/reprint/route.ts`.

- [ ] **Step 1: List pending cash orders (scoped).** `cash-orders/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin, resolveCanteenScope, type CallerProfile } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const { profile, response } = await requireAdmin();
  if (response) return response;
  const sp = new URL(request.url).searchParams;
  const scope = await resolveCanteenScope(profile as CallerProfile, {
    instituteId: sp.get('institute_id'), canteenId: sp.get('canteen_id'),
  });
  const service = createServiceClient();
  let q = service
    .from('orders')
    .select('*, user:users(id, full_name, phone), canteen:canteens(id, name), order_items(*)')
    .eq('payment_method', 'cash')
    .eq('status', 'payment_pending')
    .order('created_at', { ascending: true });
  if (scope !== null) q = q.in('canteen_id', scope);
  const { data, error } = await q;
  if (error) return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });
  return NextResponse.json({ success: true, data: data ?? [] });
}
```

- [ ] **Step 2: Approve.** `approve-cash/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin, allowedCanteenIds, canAccessCanteen, forbidden, notFound } from '@/lib/auth';

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const { profile, response } = await requireAdmin();
  if (response) return response;
  const service = createServiceClient();
  const { data: order } = await service.from('orders').select('id, canteen_id, payment_method').eq('id', params.id).single();
  if (!order) return notFound('Order not found');
  if (!canAccessCanteen(order.canteen_id, await allowedCanteenIds(profile))) return forbidden('Cannot approve this order');

  const { data, error } = await service.rpc('approve_cash_order', { p_order_id: params.id, p_staff_id: profile.id });
  if (error) return NextResponse.json({ success: false, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });
  if (!data?.ok) return NextResponse.json({ success: false, error: { code: data?.error ?? 'FAILED', message: 'Could not approve' } }, { status: 400 });

  await service.from('audit_logs').insert({
    user_id: profile.id, action: 'order.cash_approve', entity_type: 'order', entity_id: params.id, metadata: {},
  });
  return NextResponse.json({ success: true, data });
}
```

- [ ] **Step 3: Reprint.** `reprint/route.ts`: same auth + scope as approve, then `await service.rpc('reprint_cash_bill', { p_order_id: params.id })`; return `{ success: true }`.

- [ ] **Step 4: Verify + commit**
```bash
npx tsc --noEmit -p apps/admin-app/tsconfig.json   # exit 0
git add apps/admin-app/src/app/api/v1/admin/cash-orders/ apps/admin-app/src/app/api/v1/admin/orders/
git commit -m "feat(admin-api): cash list + approve-cash + reprint"
```
Manual (super_admin): with a cash order present, `GET /api/v1/admin/cash-orders` lists it; `POST …/approve-cash` returns ok and the order becomes confirmed/paid with a `print_jobs` row; a second approve returns `{ ok:true, already:true }` and no duplicate job.

---

## Task 4: Kiosk API — print-queue, ack, realtime-token

**Files:** Create `apps/admin-app/src/app/api/v1/kiosk/print-queue/route.ts`; create `apps/admin-app/src/app/api/v1/kiosk/print-queue/[id]/ack/route.ts`; create `apps/admin-app/src/app/api/v1/kiosk/realtime-token/route.ts`. Add `jose` to admin-app deps.

- [ ] **Step 1: Add a shared kiosk-HMAC verifier helper call.** READ `apps/admin-app/src/app/api/v1/kiosk/scan/route.ts` to copy the exact header/HMAC/kiosk-lookup sequence (extract kiosk id → fetch kiosk row → decrypt api key → `verifyKioskHmac`). Reuse that sequence verbatim in each new route (or extract a small `authenticateKiosk(request, path)` helper in `apps/admin-app/src/lib/kiosk-auth.ts` returning `{ kiosk, response }`). Prefer extracting the helper (DRY).

- [ ] **Step 2: `print-queue/route.ts` (GET)** — after kiosk auth, return pending jobs for the kiosk's canteen WITH receipt payload:
```ts
const service = createServiceClient();
const { data: jobs } = await service
  .from('print_jobs')
  .select('id, order_id, kind, created_at, order:orders(order_number, total_paise, subtotal_paise, tax_paise, discount_paise, created_at, order_items(menu_item_name, quantity, unit_price_paise, total_price_paise))')
  .eq('canteen_id', kiosk.canteen_id)
  .eq('status', 'pending')
  .order('created_at', { ascending: true });
return NextResponse.json({ success: true, data: jobs ?? [] });
```

- [ ] **Step 3: `print-queue/[id]/ack/route.ts` (POST)** — after kiosk auth, parse `{ result: 'printed'|'failed' }`; verify the job belongs to `kiosk.canteen_id`; update:
```ts
await service.from('print_jobs').update({
  status: result === 'printed' ? 'printed' : 'failed',
  printed_at: new Date().toISOString(),
  printed_by_kiosk: kiosk.id,
  attempts: (job.attempts ?? 0) + 1,
}).eq('id', params.id).eq('canteen_id', kiosk.canteen_id);
```

- [ ] **Step 4: `realtime-token/route.ts` (GET)** — after kiosk auth, mint a short-lived Supabase JWT scoped to the canteen:
```ts
import { SignJWT } from 'jose';
const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!);
const jwt = await new SignJWT({ role: 'authenticated', kiosk_canteen_id: kiosk.canteen_id })
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime('1h')
  .setAudience('authenticated')
  .sign(secret);
return NextResponse.json({ success: true, data: { token: jwt, expires_in: 3600,
  supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL, anon_key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY } });
```

- [ ] **Step 5: Verify + commit**
```bash
cd apps/admin-app && npm install jose && cd ../..
npx tsc --noEmit -p apps/admin-app/tsconfig.json   # exit 0
git add apps/admin-app/src/app/api/v1/kiosk/ apps/admin-app/src/lib/kiosk-auth.ts apps/admin-app/package.json apps/admin-app/package-lock.json
git commit -m "feat(kiosk-api): print-queue + ack + realtime-token (scoped JWT)"
```
**Env note (record in plan output):** the admin app now needs `SUPABASE_JWT_SECRET` (Supabase Dashboard → Settings → API → JWT secret) set in Vercel.

---

## Task 5: Admin app — Cash Payments page

**Files:** Modify `apps/admin-app/src/components/layout/sidebar.tsx` (add nav item); create `apps/admin-app/src/app/(dashboard)/cash-payments/page.tsx`.

- [ ] **Step 1: Sidebar nav.** In `ALL_NAV`, add: `{ href: '/cash-payments', label: 'Cash Payments', Icon: Banknote, roles: ['super_admin', 'canteen_admin', 'staff'] }` (import `Banknote` from lucide-react). Place it near Orders.

- [ ] **Step 2: Page.** `cash-payments/page.tsx` — client page using react-query + the global scope store, listing pending cash orders with Approve + Reprint:
```tsx
'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useScopeStore } from '@/store/scope-store';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDateTime } from '@/lib/formatting';

type CashOrder = { id: string; order_number: string; total_paise: number; created_at: string;
  user?: { full_name?: string; phone?: string }; canteen?: { name?: string }; order_items?: { length: number } };

export default function CashPaymentsPage() {
  const { instituteId, canteenId } = useScopeStore();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ data: CashOrder[] }>({
    queryKey: ['cash-orders', instituteId, canteenId],
    queryFn: async () => {
      const params: Record<string,string> = {};
      if (instituteId) params.institute_id = instituteId;
      if (canteenId) params.canteen_id = canteenId;
      return axios.get('/api/v1/admin/cash-orders', { params }).then(r => r.data);
    },
    refetchInterval: 15000,
  });
  const approve = async (id: string) => { await axios.post(`/api/v1/admin/orders/${id}/approve-cash`); qc.invalidateQueries({ queryKey: ['cash-orders'] }); };
  const reprint = async (id: string) => { await axios.post(`/api/v1/admin/orders/${id}/reprint`); };
  const rows = data?.data ?? [];
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold">Cash Payments</h1>
      {isLoading ? <p className="text-text-3 text-sm">Loading…</p>
        : rows.length === 0 ? <p className="text-text-3 text-sm">No pending cash orders.</p>
        : (
        <div className="bg-surface rounded-xl border border-border divide-y divide-border">
          {rows.map((o) => (
            <div key={o.id} className="flex items-center gap-4 p-4">
              <div className="flex-1 min-w-0">
                <p className="font-mono text-xs text-text-3">{o.order_number}</p>
                <p className="text-sm font-medium">{o.user?.full_name ?? '—'} · {o.canteen?.name ?? ''}</p>
                <p className="text-xs text-text-3">{formatDateTime(o.created_at)}</p>
              </div>
              <div className="text-sm font-semibold">{formatCurrency(o.total_paise)}</div>
              <Button onClick={() => approve(o.id)}>Approve &amp; print</Button>
              <Button variant="outline" onClick={() => reprint(o.id)}>Reprint</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify + commit**
```bash
npx tsc --noEmit -p apps/admin-app/tsconfig.json   # exit 0
git add apps/admin-app/src/components/layout/sidebar.tsx "apps/admin-app/src/app/(dashboard)/cash-payments/page.tsx"
git commit -m "feat(admin): Cash Payments approval page"
```
Manual: page lists pending cash orders (scoped); Approve confirms + (with Task 6) prints; Reprint re-enqueues.

---

## Task 6: Pi agent — print_worker (Realtime push + safety poll)

**Files:** Create `kiosk/print_worker.py`; modify `kiosk/app.py` (start the worker thread); modify `kiosk/requirements.txt` (add `realtime`).

- [ ] **Step 1: requirements.** Add `realtime==2.0.5` (the standalone Supabase realtime-py client) to `kiosk/requirements.txt`.

- [ ] **Step 2: `print_worker.py`.** A worker that: fetches a scoped JWT via the HMAC `realtime-token` endpoint; subscribes to `print_jobs` INSERT for its canteen via Supabase Realtime; on any push OR every 45s safety tick OR on connect → `drain()`. `drain()` calls the HMAC `print-queue` GET, prints each job via the existing printer, and acks. Keep ALL data + ack on the HMAC REST path (the realtime event is only a wake-up signal).
```python
"""print_worker.py — drains the cash-bill print queue.

Realtime push (Supabase) wakes the worker; the actual receipt data and ack go
over the existing kiosk-HMAC REST API (print-only). A 45s safety poll + a
reconnect drain guarantee no bill is stranded if the socket drops.
"""
import logging, threading, time
log = logging.getLogger("print_worker")

SAFETY_POLL_SECONDS = 45

class PrintWorker:
    def __init__(self, api, printer):
        self.api = api          # existing HMAC API client (api_client.py)
        self.printer = printer  # existing printer.py instance
        self._running = False

    def start(self):
        self._running = True
        threading.Thread(target=self._safety_loop, name="print_safety", daemon=True).start()
        threading.Thread(target=self._realtime_loop, name="print_realtime", daemon=True).start()
        log.info("PrintWorker started (realtime + %ss safety poll).", SAFETY_POLL_SECONDS)

    def stop(self):
        self._running = False

    # --- draining (HMAC REST path) ---
    def drain(self):
        try:
            jobs = self.api.get_print_queue()  # GET /kiosk/print-queue -> list
        except Exception as exc:
            log.warning("drain: could not fetch queue: %s", exc); return
        for job in jobs or []:
            try:
                self.printer.print_cash_bill(job)            # render receipt from job payload
                self.api.ack_print_job(job["id"], "printed")
                log.info("Printed cash bill for order %s", job.get("order", {}).get("order_number"))
            except Exception as exc:
                log.exception("Print failed for job %s: %s", job.get("id"), exc)
                try: self.api.ack_print_job(job["id"], "failed")
                except Exception: pass

    def _safety_loop(self):
        while self._running:
            self.drain()
            time.sleep(SAFETY_POLL_SECONDS)

    # --- realtime push ---
    def _realtime_loop(self):
        while self._running:
            try:
                self._subscribe_blocking()
            except Exception as exc:
                log.warning("realtime loop error: %s — retrying in 10s", exc)
                time.sleep(10)

    def _subscribe_blocking(self):
        from realtime import Socket  # realtime-py
        tok = self.api.get_realtime_token()  # {token, supabase_url, anon_key}
        ws_url = tok["supabase_url"].replace("https://", "wss://") + "/realtime/v1/websocket?apikey=" + tok["anon_key"]
        socket = Socket(ws_url, params={"apikey": tok["anon_key"]})
        socket.connect()
        socket.set_auth(tok["token"])  # scoped JWT -> RLS limits to our canteen
        channel = socket.set_channel("realtime:public:print_jobs")
        channel.join().on("postgres_changes", lambda payload: self.drain())
        self.drain()  # catch up on connect
        socket.listen()  # blocks until disconnect
```
*Note for the implementer:* the exact `realtime-py` API surface (Socket/Channel method names, `postgres_changes` filter syntax) varies by version — verify against the installed `realtime==2.0.5` API and adjust the subscribe calls; the **contract** that must hold is "on any insert to print_jobs for our canteen, call `self.drain()`", plus the safety poll. If realtime-py proves fiddly, ship with the **safety poll only** (still correct, ~45s worst case) and report it as DONE_WITH_CONCERNS so we can refine the realtime wiring.

- [ ] **Step 3: API client + printer methods.** In `kiosk/api_client.py` add `get_print_queue()`, `ack_print_job(id, result)`, `get_realtime_token()` (all HMAC-signed like the existing scan call). In `kiosk/printer.py` add `print_cash_bill(job)` that renders the same receipt layout used for scans from the job's `order` payload (reuse the existing receipt-rendering code path; the bill = header + watermark + items + totals + order_number/token).

- [ ] **Step 4: Wire into `app.py`.** Where the app builds `self.api` and the printer and starts the scanner, also `self.print_worker = PrintWorker(self.api, self.printer); self.print_worker.start()`. Stop it on shutdown.

- [ ] **Step 5: Verify (integration, manual — no Pi in CI).** `python -m py_compile kiosk/print_worker.py kiosk/api_client.py kiosk/printer.py kiosk/app.py` → no syntax errors. Full behavior is verified on the Pi: approve a cash order in admin → bill prints within ~1–2s (push) or ≤45s (safety poll).

- [ ] **Step 6: Commit**
```bash
python -m py_compile kiosk/print_worker.py kiosk/api_client.py kiosk/printer.py kiosk/app.py
git add kiosk/print_worker.py kiosk/api_client.py kiosk/printer.py kiosk/app.py kiosk/requirements.txt
git commit -m "feat(kiosk): print_worker — realtime + safety-poll cash-bill printing"
```

---

## Task 7: Final verification + deploy / infra checklist

- [ ] **Step 1: Type-check both web apps.** `npx tsc --noEmit -p apps/student-app/tsconfig.json` and `-p apps/admin-app/tsconfig.json` → both exit 0.
- [ ] **Step 2: Run `cash-payments.sql`** in Supabase (if not already). Confirm Realtime is enabled on `print_jobs` (Dashboard → Database → Replication).
- [ ] **Step 3: Set env** — `SUPABASE_JWT_SECRET` in the **admin** Vercel project (Settings → API → JWT secret).
- [ ] **Step 4: Deploy** — `cd apps/admin-app && vercel --prod`; `cd ../student-app && vercel --prod`.
- [ ] **Step 5: Update the Pi** — `pip install -r requirements.txt` in the kiosk venv, pull the new kiosk code, restart the service.
- [ ] **Step 6: End-to-end smoke** — student places a cash order → appears on admin Cash Payments → Approve → bill prints at that canteen's agent within ~1–2s; second Approve is a no-op; Reprint reprints.

---

## Notes / follow-ups (out of scope)
- **Part 3 (Windows app):** separate spec — reuses Tasks 4's contract (`print-queue`, `ack`, `realtime-token`) with a Windows scanner/printer adapter + setup screen + PyInstaller packaging.
- Cash orders collected by **printed token** (no pickup QR) per the spec's defaulted decision.
- Optional later: auto-expire abandoned `payment_pending` cash orders.
