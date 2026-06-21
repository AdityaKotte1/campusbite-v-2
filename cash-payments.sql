-- ============================================================================
-- cash-payments.sql — cash orders confirmed by staff approval.
--
-- Approving a cash order = the equivalent of an online payment succeeding:
-- the order becomes confirmed + paid, the student's pickup QR unlocks (the
-- existing /orders/[id]/qr flow gates on payment_status = 'paid'), and the
-- student collects at the kiosk exactly like an online order.
-- NO print queue / Realtime / kiosk changes.
--
-- Safe to run repeatedly. It ALSO removes the earlier print-queue machinery if
-- a previous version of this migration was applied.
-- ============================================================================

-- 1) Orders: payment method + approval-audit columns.
--    NOTE: orders.payment_method may already exist with other values
--    (razorpay/upi/NULL) that the analytics payment-mix reads — so we add no
--    strict CHECK and rewrite no existing values. approved_by is audit-only and
--    intentionally NOT a foreign key (a 2nd orders→users FK makes the
--    `user:users(...)` PostgREST embed ambiguous → PGRST201 → 500).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS approved_by    UUID,
  ADD COLUMN IF NOT EXISTS approved_at    TIMESTAMPTZ;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_approved_by_fkey;

-- 2) Approve a cash order: confirm + mark paid (idempotent under double-click).
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

  RETURN jsonb_build_object('ok', true, 'order_id', p_order_id);
END $$;
GRANT EXECUTE ON FUNCTION public.approve_cash_order(UUID, UUID) TO service_role;

-- 3) Remove the print-queue machinery from the earlier (over-engineered) version.
DROP FUNCTION IF EXISTS public.reprint_cash_bill(UUID);
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'print_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.print_jobs;
  END IF;
END $$;
DROP TABLE IF EXISTS public.print_jobs CASCADE;
