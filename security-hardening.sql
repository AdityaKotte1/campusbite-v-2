-- ════════════════════════════════════════════════════════════════════════
-- MunchAdda — SECURITY HARDENING (single combined migration)
-- Run this ONCE in the Supabase SQL editor.
--
-- This script consolidates every database-side security fix from the audit.
-- It is idempotent (DROP POLICY IF EXISTS / CREATE OR REPLACE) and safe to
-- re-run. The same changes are also baked into the canonical install files
-- (packages/database/rls.sql, packages/database/functions.sql,
-- supabase-schema-update.sql, supabase-support.sql, supabase-subscriptions.sql)
-- so fresh installs are correct too.
--
-- NOTE: The open-redirect fix (Fix 1) lives in application code
-- (apps/admin-app/src/app/auth/callback/route.ts) — not in this SQL.
--
-- Fixes included:
--   2. Drop USING(true) "*_authenticated_read" policies that overrode gating.
--   3. Tenant-scope support_tickets so staff can't read other tenants' PII.
--   4. Restrict audit_logs reads to super_admin only.
--   5. Add role check to subscription/invoice institute-read policies.
--   6. Pin canteen_id in UPDATE WITH CHECK clauses (anti re-parenting).
--   7. SET search_path = public on SECURITY DEFINER helper functions.
--   8. validate_and_use_qr_token: reject scans from the wrong canteen's kiosk.
--   9. validate_and_reserve_coupon: fix NULL valid_until (function still needs
--      schema reconciliation before use — see functions.sql).
--  10. Unique index on payment_transactions(<razorpay payment id>) for
--      payment replay protection.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ════════════════════════════════════════════════════════════════════════
-- Fix 7 — SECURITY DEFINER helper functions get a fixed search_path.
-- Also (re)defines the institute helpers used by tenant-scoped policies.
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_user_canteen_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT assigned_canteen_id FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_user_institute_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT institute_id FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.user_institute_id(p_user_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT institute_id FROM public.users WHERE id = p_user_id;
$$;

-- ════════════════════════════════════════════════════════════════════════
-- Fix 2 — Remove the USING(true) "authenticated_read" policies.
-- They OR-ed with the scoped policies in rls.sql and nullified the
-- is_active=true / is_available=true gating. Do NOT recreate them.
-- ════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "institutes_authenticated_read" ON institutes;
DROP POLICY IF EXISTS "canteens_authenticated_read"   ON canteens;
DROP POLICY IF EXISTS "categories_authenticated_read" ON categories;
DROP POLICY IF EXISTS "menu_items_authenticated_read" ON menu_items;

-- ════════════════════════════════════════════════════════════════════════
-- Fix 6 — Pin canteen_id in UPDATE WITH CHECK so rows cannot be re-parented
-- to another tenant. (USING clauses are unchanged; only WITH CHECK tightened.)
-- ════════════════════════════════════════════════════════════════════════

-- categories
DROP POLICY IF EXISTS "categories_admin_update" ON categories;
CREATE POLICY "categories_admin_update"
  ON categories FOR UPDATE
  USING (
    current_user_role() IN ('canteen_admin', 'super_admin')
    AND (current_user_role() = 'super_admin' OR canteen_id = current_user_canteen_id())
  )
  WITH CHECK (
    current_user_role() IN ('canteen_admin', 'super_admin')
    AND (current_user_role() = 'super_admin' OR canteen_id = current_user_canteen_id())
  );

-- menu_items (staff/admin). TODO: RLS can't restrict staff to availability/stock
-- columns only — that needs a trigger/RPC. We at least pin canteen_id here.
DROP POLICY IF EXISTS "menu_items_staff_update" ON menu_items;
CREATE POLICY "menu_items_staff_update"
  ON menu_items FOR UPDATE
  USING (
    current_user_role() IN ('staff', 'canteen_admin', 'super_admin')
    AND (current_user_role() = 'super_admin' OR canteen_id = current_user_canteen_id())
  )
  WITH CHECK (
    current_user_role() IN ('staff', 'canteen_admin', 'super_admin')
    AND (current_user_role() = 'super_admin' OR canteen_id = current_user_canteen_id())
  );

-- orders
DROP POLICY IF EXISTS "orders_canteen_admin_update" ON orders;
CREATE POLICY "orders_canteen_admin_update"
  ON orders FOR UPDATE
  USING (
    current_user_role() IN ('canteen_admin', 'staff')
    AND canteen_id = current_user_canteen_id()
  )
  WITH CHECK (
    current_user_role() IN ('canteen_admin', 'staff')
    AND canteen_id = current_user_canteen_id()
  );

-- kiosks
DROP POLICY IF EXISTS "kiosks_admin_update" ON kiosks;
CREATE POLICY "kiosks_admin_update"
  ON kiosks FOR UPDATE
  USING (
    current_user_role() = 'super_admin'
    OR (current_user_role() = 'canteen_admin' AND canteen_id = current_user_canteen_id())
  )
  WITH CHECK (
    current_user_role() = 'super_admin'
    OR (current_user_role() = 'canteen_admin' AND canteen_id = current_user_canteen_id())
  );

-- staff
DROP POLICY IF EXISTS "staff_admin_update" ON staff;
CREATE POLICY "staff_admin_update"
  ON staff FOR UPDATE
  USING (
    current_user_role() = 'super_admin'
    OR (current_user_role() = 'canteen_admin' AND canteen_id = current_user_canteen_id())
  )
  WITH CHECK (
    current_user_role() = 'super_admin'
    OR (current_user_role() = 'canteen_admin' AND canteen_id = current_user_canteen_id())
  );

-- coupons (canteen_id nullable = platform-wide; mirror USING).
DROP POLICY IF EXISTS "coupons_admin_update" ON coupons;
CREATE POLICY "coupons_admin_update"
  ON coupons FOR UPDATE
  USING (
    current_user_role() = 'super_admin'
    OR (current_user_role() = 'canteen_admin'
        AND (canteen_id = current_user_canteen_id() OR canteen_id IS NULL))
  )
  WITH CHECK (
    current_user_role() = 'super_admin'
    OR (current_user_role() = 'canteen_admin'
        AND (canteen_id = current_user_canteen_id() OR canteen_id IS NULL))
  );

-- reviews (FOR ALL policy)
DROP POLICY IF EXISTS "reviews_admin_all" ON reviews;
CREATE POLICY "reviews_admin_all"
  ON reviews FOR ALL
  USING (
    current_user_role() = 'super_admin'
    OR (current_user_role() = 'canteen_admin' AND canteen_id = current_user_canteen_id())
  )
  WITH CHECK (
    current_user_role() = 'super_admin'
    OR (current_user_role() = 'canteen_admin' AND canteen_id = current_user_canteen_id())
  );

-- ════════════════════════════════════════════════════════════════════════
-- Fix 4 — audit_logs: drop the un-scoped canteen_admin read policy.
-- audit_logs has no canteen_id/institute_id to scope on, so reads are now
-- super_admin only. (super_admin + own-row policies remain.)
-- ════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "audit_logs_canteen_admin_read" ON audit_logs;

-- ════════════════════════════════════════════════════════════════════════
-- Fix 3 — support_tickets: tenant-scope the admin policy.
-- ════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "support_admin_all" ON support_tickets;
CREATE POLICY "support_admin_all" ON support_tickets
  FOR ALL USING (
    current_user_role() = 'super_admin'
    OR (
      current_user_role() IN ('canteen_admin', 'staff')
      AND support_tickets.user_id IS NOT NULL
      AND public.current_user_institute_id() IS NOT NULL
      AND public.user_institute_id(support_tickets.user_id) = public.current_user_institute_id()
    )
  )
  WITH CHECK (
    current_user_role() = 'super_admin'
    OR (
      current_user_role() IN ('canteen_admin', 'staff')
      AND support_tickets.user_id IS NOT NULL
      AND public.current_user_institute_id() IS NOT NULL
      AND public.user_institute_id(support_tickets.user_id) = public.current_user_institute_id()
    )
  );

-- ════════════════════════════════════════════════════════════════════════
-- Fix 5 — subscriptions/invoices: students must not read institute billing.
-- ════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "subs_institute_read" ON institute_subscriptions;
CREATE POLICY "subs_institute_read" ON institute_subscriptions
  FOR SELECT USING (
    current_user_role() IN ('super_admin', 'canteen_admin')
    AND institute_id = (SELECT institute_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "invoices_institute_read" ON subscription_invoices;
CREATE POLICY "invoices_institute_read" ON subscription_invoices
  FOR SELECT USING (
    current_user_role() IN ('super_admin', 'canteen_admin')
    AND institute_id = (SELECT institute_id FROM users WHERE id = auth.uid())
  );

COMMIT;

-- ════════════════════════════════════════════════════════════════════════
-- Fix 10 — Payment replay protection.
-- Unique partial index on the Razorpay payment id so the same gateway payment
-- cannot be recorded twice. NOTE: schema.sql names this column
-- `gateway_payment_id`, but the live app writes `razorpay_payment_id`. This
-- block targets whichever column actually exists. Runs outside the txn above
-- so a pre-existing duplicate doesn't roll back the policy fixes.
-- ════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_col TEXT;
BEGIN
  SELECT column_name INTO v_col
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'payment_transactions'
     AND column_name IN ('razorpay_payment_id', 'gateway_payment_id')
   ORDER BY (column_name = 'razorpay_payment_id') DESC   -- prefer razorpay_payment_id
   LIMIT 1;

  IF v_col IS NULL THEN
    RAISE NOTICE 'payment_transactions: no razorpay/gateway payment-id column found — skipping replay-protection index';
  ELSE
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_tx_razorpay_payment_id
         ON public.payment_transactions (%I) WHERE %I IS NOT NULL',
      v_col, v_col
    );
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════
-- Fix 8 (DB side of kiosk QR fix) — wrong-canteen redemption guard.
-- The full corrected validate_and_use_qr_token() lives in
-- packages/database/functions.sql. Re-run that file (or the function block) to
-- apply: it now rejects a scan when the kiosk's canteen_id IS DISTINCT FROM the
-- order's canteen_id (returns error_code 'WRONG_CANTEEN' and re-activates the
-- token). It is reproduced here so this script is self-contained.
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.validate_and_use_qr_token(
  p_token       UUID,
  p_kiosk_id    UUID,
  p_kiosk_meta  JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_row        qr_tokens%ROWTYPE;
  v_order_row        orders%ROWTYPE;
  v_kiosk_canteen_id UUID;
  v_canteen_name     TEXT;
  v_student_name     TEXT;
  v_daily_number     INTEGER;
  v_items            JSONB;
  v_scan_result      VARCHAR(30);
  v_receipt          JSONB;
BEGIN
  -- Step 1: Lock & fetch the token row for update
  SELECT *
    INTO v_token_row
    FROM qr_tokens
   WHERE token = p_token
   FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    INSERT INTO kiosk_scans (
      kiosk_id, qr_token_id, raw_token_value, scan_result, offline_scan, scanned_at
    ) VALUES (p_kiosk_id, NULL, p_token::TEXT, 'invalid_token', false, NOW());
    RETURN jsonb_build_object(
      'success', false, 'error_code', 'INVALID_TOKEN',
      'message', 'QR token does not exist');
  END IF;

  -- Step 2: Check token status
  IF v_token_row.status = 'used' THEN
    INSERT INTO kiosk_scans (
      kiosk_id, qr_token_id, raw_token_value, scan_result, offline_scan, scanned_at
    ) VALUES (p_kiosk_id, v_token_row.id, p_token::TEXT, 'already_used', false, NOW());
    RETURN jsonb_build_object(
      'success', false, 'error_code', 'ALREADY_USED',
      'message', 'This QR code has already been scanned', 'used_at', v_token_row.used_at);
  END IF;

  IF v_token_row.status = 'expired' OR v_token_row.expires_at < NOW() THEN
    IF v_token_row.status = 'active' THEN
      UPDATE qr_tokens SET status = 'expired', updated_at = NOW() WHERE id = v_token_row.id;
    END IF;
    INSERT INTO kiosk_scans (
      kiosk_id, qr_token_id, raw_token_value, scan_result, offline_scan, scanned_at
    ) VALUES (p_kiosk_id, v_token_row.id, p_token::TEXT, 'expired', false, NOW());
    RETURN jsonb_build_object(
      'success', false, 'error_code', 'EXPIRED',
      'message', 'This QR code has expired', 'expired_at', v_token_row.expires_at);
  END IF;

  IF v_token_row.status = 'revoked' THEN
    INSERT INTO kiosk_scans (
      kiosk_id, qr_token_id, raw_token_value, scan_result, offline_scan, scanned_at
    ) VALUES (p_kiosk_id, v_token_row.id, p_token::TEXT, 'revoked', false, NOW());
    RETURN jsonb_build_object(
      'success', false, 'error_code', 'REVOKED',
      'message', 'This QR code has been revoked');
  END IF;

  -- Step 3: Mark the token as used (optimistic lock via version)
  UPDATE qr_tokens
     SET status        = 'used',
         used_at       = NOW(),
         kiosk_id      = p_kiosk_id,
         scan_metadata = p_kiosk_meta,
         version       = version + 1,
         updated_at    = NOW()
   WHERE id      = v_token_row.id
     AND version = v_token_row.version;

  IF NOT FOUND THEN
    INSERT INTO kiosk_scans (
      kiosk_id, qr_token_id, raw_token_value, scan_result, offline_scan, scanned_at
    ) VALUES (p_kiosk_id, v_token_row.id, p_token::TEXT, 'already_used', false, NOW());
    RETURN jsonb_build_object(
      'success', false, 'error_code', 'ALREADY_USED',
      'message', 'Concurrent scan detected — this token was just used');
  END IF;

  -- Step 4: Fetch the associated order
  SELECT * INTO v_order_row FROM orders WHERE id = v_token_row.order_id FOR UPDATE;

  -- SECURITY (Fix 8): the scanning kiosk must belong to the order's canteen.
  SELECT canteen_id INTO v_kiosk_canteen_id FROM kiosks WHERE id = p_kiosk_id;
  IF v_kiosk_canteen_id IS DISTINCT FROM v_order_row.canteen_id THEN
    UPDATE public.qr_tokens
      SET status = 'active', used_at = NULL, kiosk_id = NULL
    WHERE id = v_token_row.id;
    RETURN jsonb_build_object(
      'success', false, 'error_code', 'WRONG_CANTEEN',
      'message', 'This order belongs to a different canteen and cannot be collected at this kiosk');
  END IF;

  -- SECURITY: order must be collectable
  IF v_order_row.status NOT IN ('confirmed', 'preparing', 'ready') THEN
    UPDATE public.qr_tokens
      SET status = 'active', used_at = NULL, kiosk_id = NULL
    WHERE id = v_token_row.id;
    RETURN jsonb_build_object(
      'success', false, 'error_code', 'ORDER_NOT_COLLECTABLE',
      'message', format('Order is in "%s" status and cannot be collected', v_order_row.status));
  END IF;

  UPDATE orders
     SET status = 'collected', collected_at = NOW(), updated_at = NOW()
   WHERE id = v_order_row.id;

  -- Step 5: canteen + student info
  SELECT c.name INTO v_canteen_name FROM canteens c WHERE c.id = v_order_row.canteen_id;
  SELECT u.full_name INTO v_student_name FROM users u WHERE u.id = v_order_row.user_id;

  -- Step 6: sequential daily token number
  SELECT COALESCE(MAX(token_number), 0) + 1 INTO v_daily_number
    FROM daily_tokens
   WHERE canteen_id = v_order_row.canteen_id AND date = CURRENT_DATE;

  INSERT INTO daily_tokens (canteen_id, order_id, date, token_number)
  VALUES (v_order_row.canteen_id, v_order_row.id, CURRENT_DATE, v_daily_number)
  ON CONFLICT (canteen_id, date, token_number)
  DO UPDATE SET token_number = daily_tokens.token_number + 1
  RETURNING token_number INTO v_daily_number;

  -- Step 7: order items for receipt
  SELECT jsonb_agg(
    jsonb_build_object(
      'name', oi.menu_item_name, 'quantity', oi.quantity,
      'unit_price_paise', oi.unit_price_paise, 'total_price_paise', oi.total_price_paise
    ) ORDER BY oi.created_at)
  INTO v_items FROM order_items oi WHERE oi.order_id = v_order_row.id;

  -- Step 8: record successful scan
  INSERT INTO kiosk_scans (
    kiosk_id, qr_token_id, raw_token_value, scan_result, print_attempted, offline_scan, scanned_at
  ) VALUES (p_kiosk_id, v_token_row.id, p_token::TEXT, 'success', true, false, NOW());

  -- Step 9: build receipt
  v_receipt := jsonb_build_object(
    'success', true, 'token_number', v_daily_number,
    'order_number', v_order_row.order_number, 'canteen_name', v_canteen_name,
    'student_name', v_student_name, 'items', COALESCE(v_items, '[]'::JSONB),
    'subtotal_paise', v_order_row.subtotal_paise, 'tax_paise', v_order_row.tax_paise,
    'discount_paise', v_order_row.discount_paise, 'total_paise', v_order_row.total_paise,
    'collected_at', NOW());
  RETURN v_receipt;

EXCEPTION
  WHEN lock_not_available THEN
    RETURN jsonb_build_object(
      'success', false, 'error_code', 'ALREADY_USED',
      'message', 'Token is currently being processed by another request');
  WHEN OTHERS THEN
    RAISE WARNING 'validate_and_use_qr_token error: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object(
      'success', false, 'error_code', 'INTERNAL_ERROR',
      'message', 'An unexpected error occurred while processing the QR token',
      'detail', SQLERRM);
END;
$$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════
-- Fix 9 — validate_and_reserve_coupon (NULL valid_until) is fixed in
-- packages/database/functions.sql. That function is NOT included here because
-- it still references a non-existent user_coupons.is_used column and an
-- ON CONFLICT without a matching unique constraint. It is currently UNUSED by
-- application code and must be reconciled to schema.sql before being wired up.
-- ════════════════════════════════════════════════════════════════════════
