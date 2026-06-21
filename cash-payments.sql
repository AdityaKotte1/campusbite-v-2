-- ============================================================================
-- cash-payments.sql — cash orders + print queue + Realtime scoping
-- ============================================================================

-- 1) Orders: payment method + approval audit columns.
--    NOTE: orders.payment_method may already exist in the live DB with other
--    values (e.g. 'razorpay'/'upi'/NULL) that the analytics payment-mix reads —
--    so we do NOT add a strict CHECK (it would reject existing rows) and we do
--    NOT rewrite existing values. The feature only ever filters
--    `payment_method = 'cash'`; everything else is treated as "online".
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS approved_by    UUID,        -- audit only; intentionally NOT a FK
  ADD COLUMN IF NOT EXISTS approved_at    TIMESTAMPTZ;
-- IMPORTANT: approved_by must NOT be a foreign key to users. A second
-- orders→users FK makes the `user:users(...)` PostgREST embed ambiguous
-- (PGRST201) and 500s the Orders / Cash Payments / Dashboard endpoints.
-- Drop it if a prior run created it.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_approved_by_fkey;

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
CREATE UNIQUE INDEX IF NOT EXISTS uq_print_jobs_pending
  ON public.print_jobs(order_id, kind) WHERE status = 'pending';

-- 3) RLS: print_jobs visible only to the kiosk's own canteen (for Realtime).
ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "print_jobs_kiosk_canteen_read" ON public.print_jobs;
CREATE POLICY "print_jobs_kiosk_canteen_read" ON public.print_jobs
  FOR SELECT
  USING (canteen_id = NULLIF(auth.jwt() ->> 'kiosk_canteen_id','')::uuid);

-- 4) Atomic approval: confirm + paid + enqueue print job. Idempotent.
CREATE OR REPLACE FUNCTION public.approve_cash_order(p_order_id UUID, p_staff_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); END IF;
  IF v.payment_method <> 'cash' THEN RETURN jsonb_build_object('ok', false, 'error', 'NOT_CASH'); END IF;
  IF v.payment_status = 'paid' THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'order_id', p_order_id);
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

-- 5) Re-enqueue a bill (reprint)
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

-- 6) Enable Realtime on print_jobs (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'print_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.print_jobs;
  END IF;
END $$;
