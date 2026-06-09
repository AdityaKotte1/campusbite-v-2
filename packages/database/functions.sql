-- ============================================================
-- CampusBite — PostgreSQL Functions & Triggers
-- Run AFTER schema.sql and rls.sql.
-- ============================================================

-- ============================================================
-- 1. handle_new_user() — Trigger on auth.users INSERT
-- Auto-creates the public.users profile when a new auth user is
-- created (handles both email/password and Google OAuth sign-ups).
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
  v_avatar_url TEXT;
BEGIN
  -- Extract full_name from metadata (Google sets "full_name" or "name")
  v_full_name := COALESCE(
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name',
    split_part(NEW.email, '@', 1)  -- fallback: email prefix
  );

  -- Extract avatar from Google OAuth metadata
  v_avatar_url := COALESCE(
    NEW.raw_user_meta_data ->> 'avatar_url',
    NEW.raw_user_meta_data ->> 'picture'
  );

  INSERT INTO public.users (
    id,
    email,
    full_name,
    avatar_url,
    role,
    is_email_verified,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    v_avatar_url,
    'student',
    -- Mark as verified if email_confirmed_at is already set (OAuth)
    (NEW.email_confirmed_at IS NOT NULL),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
    SET
      email             = EXCLUDED.email,
      full_name         = COALESCE(EXCLUDED.full_name, public.users.full_name),
      avatar_url        = COALESCE(EXCLUDED.avatar_url, public.users.avatar_url),
      is_email_verified = EXCLUDED.is_email_verified OR public.users.is_email_verified,
      updated_at        = NOW();

  RETURN NEW;
END;
$$;

-- Attach trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 2. handle_email_confirmation() — Trigger on auth.users UPDATE
-- Marks is_email_verified=true when the user confirms their email.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_email_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when email_confirmed_at transitions from NULL → non-NULL
  IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
    UPDATE public.users
    SET
      is_email_verified = true,
      updated_at        = NOW()
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_email_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_email_confirmation();

-- ============================================================
-- 3. get_user_role(user_id UUID) RETURNS TEXT
-- Returns the role string for a given user ID.
-- Used internally by RLS helper functions.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_role(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = p_user_id;
$$;

-- ============================================================
-- 4. validate_and_use_qr_token(p_token, p_kiosk_id, p_kiosk_meta)
-- RETURNS JSONB
--
-- ATOMIC function that:
--   1. Marks the QR token as 'used' (optimistic locking via version)
--   2. Updates the order status to 'collected'
--   3. Assigns a sequential daily token number
--   4. Records the kiosk scan
--   5. Returns a full receipt JSON
-- ============================================================

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
  v_token_row       qr_tokens%ROWTYPE;
  v_order_row       orders%ROWTYPE;
  v_canteen_name    TEXT;
  v_student_name    TEXT;
  v_daily_number    INTEGER;
  v_items           JSONB;
  v_scan_result     VARCHAR(30);
  v_scan_insert_ok  BOOLEAN := false;
  v_receipt         JSONB;
BEGIN
  -- --------------------------------------------------------
  -- Step 1: Lock & fetch the token row for update
  -- --------------------------------------------------------
  SELECT *
    INTO v_token_row
    FROM qr_tokens
   WHERE token = p_token
   FOR UPDATE NOWAIT;

  IF NOT FOUND THEN
    -- Record the failed scan attempt
    INSERT INTO kiosk_scans (
      kiosk_id, qr_token_id, raw_token_value,
      scan_result, offline_scan, scanned_at
    ) VALUES (
      p_kiosk_id, NULL, p_token::TEXT,
      'invalid_token', false, NOW()
    );

    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVALID_TOKEN',
      'message', 'QR token does not exist'
    );
  END IF;

  -- --------------------------------------------------------
  -- Step 2: Check token status
  -- --------------------------------------------------------
  IF v_token_row.status = 'used' THEN
    v_scan_result := 'already_used';
    INSERT INTO kiosk_scans (
      kiosk_id, qr_token_id, raw_token_value,
      scan_result, offline_scan, scanned_at
    ) VALUES (
      p_kiosk_id, v_token_row.id, p_token::TEXT,
      v_scan_result, false, NOW()
    );
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'ALREADY_USED',
      'message', 'This QR code has already been scanned',
      'used_at', v_token_row.used_at
    );
  END IF;

  IF v_token_row.status = 'expired' OR v_token_row.expires_at < NOW() THEN
    -- Mark it expired if still showing 'active'
    IF v_token_row.status = 'active' THEN
      UPDATE qr_tokens SET status = 'expired', updated_at = NOW()
       WHERE id = v_token_row.id;
    END IF;

    v_scan_result := 'expired';
    INSERT INTO kiosk_scans (
      kiosk_id, qr_token_id, raw_token_value,
      scan_result, offline_scan, scanned_at
    ) VALUES (
      p_kiosk_id, v_token_row.id, p_token::TEXT,
      v_scan_result, false, NOW()
    );
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'EXPIRED',
      'message', 'This QR code has expired',
      'expired_at', v_token_row.expires_at
    );
  END IF;

  IF v_token_row.status = 'revoked' THEN
    v_scan_result := 'revoked';
    INSERT INTO kiosk_scans (
      kiosk_id, qr_token_id, raw_token_value,
      scan_result, offline_scan, scanned_at
    ) VALUES (
      p_kiosk_id, v_token_row.id, p_token::TEXT,
      v_scan_result, false, NOW()
    );
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'REVOKED',
      'message', 'This QR code has been revoked'
    );
  END IF;

  -- --------------------------------------------------------
  -- Step 3: Mark the token as used (optimistic lock via version)
  -- --------------------------------------------------------
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
    -- Concurrent update raced us — treat as already used
    INSERT INTO kiosk_scans (
      kiosk_id, qr_token_id, raw_token_value,
      scan_result, offline_scan, scanned_at
    ) VALUES (
      p_kiosk_id, v_token_row.id, p_token::TEXT,
      'already_used', false, NOW()
    );
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'ALREADY_USED',
      'message', 'Concurrent scan detected — this token was just used'
    );
  END IF;

  -- --------------------------------------------------------
  -- Step 4: Fetch the associated order
  -- --------------------------------------------------------
  SELECT * INTO v_order_row
    FROM orders
   WHERE id = v_token_row.order_id
   FOR UPDATE;

  -- SECURITY: Verify order is in a collectable state before proceeding
  IF v_order_row.status NOT IN ('confirmed', 'preparing', 'ready') THEN
    -- Rollback the token update by re-marking it active
    UPDATE public.qr_tokens
      SET status = 'active', used_at = NULL, kiosk_id = NULL
    WHERE id = v_token_row.id;

    RETURN jsonb_build_object(
      'success',    false,
      'error_code', 'ORDER_NOT_COLLECTABLE',
      'message',    format('Order is in "%s" status and cannot be collected', v_order_row.status)
    );
  END IF;

  -- Update order to 'collected'
  UPDATE orders
     SET status       = 'collected',
         collected_at = NOW(),
         updated_at   = NOW()
   WHERE id = v_order_row.id;

  -- --------------------------------------------------------
  -- Step 5: Fetch canteen and student info
  -- --------------------------------------------------------
  SELECT c.name INTO v_canteen_name
    FROM canteens c
   WHERE c.id = v_order_row.canteen_id;

  SELECT u.full_name INTO v_student_name
    FROM users u
   WHERE u.id = v_order_row.user_id;

  -- --------------------------------------------------------
  -- Step 6: Assign sequential daily token number
  -- --------------------------------------------------------
  SELECT COALESCE(MAX(token_number), 0) + 1
    INTO v_daily_number
    FROM daily_tokens
   WHERE canteen_id = v_order_row.canteen_id
     AND date       = CURRENT_DATE;

  INSERT INTO daily_tokens (canteen_id, order_id, date, token_number)
  VALUES (v_order_row.canteen_id, v_order_row.id, CURRENT_DATE, v_daily_number)
  ON CONFLICT (canteen_id, date, token_number)
  DO UPDATE SET token_number = daily_tokens.token_number + 1
  RETURNING token_number INTO v_daily_number;

  -- --------------------------------------------------------
  -- Step 7: Fetch order items for receipt
  -- --------------------------------------------------------
  SELECT jsonb_agg(
    jsonb_build_object(
      'name',             oi.menu_item_name,
      'quantity',         oi.quantity,
      'unit_price_paise', oi.unit_price_paise,
      'total_price_paise',oi.total_price_paise
    )
    ORDER BY oi.created_at
  )
  INTO v_items
  FROM order_items oi
  WHERE oi.order_id = v_order_row.id;

  -- --------------------------------------------------------
  -- Step 8: Record the successful kiosk scan
  -- --------------------------------------------------------
  INSERT INTO kiosk_scans (
    kiosk_id, qr_token_id, raw_token_value,
    scan_result, print_attempted, offline_scan, scanned_at
  ) VALUES (
    p_kiosk_id, v_token_row.id, p_token::TEXT,
    'success', true, false, NOW()
  );

  -- --------------------------------------------------------
  -- Step 9: Build and return the receipt JSON
  -- --------------------------------------------------------
  v_receipt := jsonb_build_object(
    'success',        true,
    'token_number',   v_daily_number,
    'order_number',   v_order_row.order_number,
    'canteen_name',   v_canteen_name,
    'student_name',   v_student_name,
    'items',          COALESCE(v_items, '[]'::JSONB),
    'subtotal_paise', v_order_row.subtotal_paise,
    'tax_paise',      v_order_row.tax_paise,
    'discount_paise', v_order_row.discount_paise,
    'total_paise',    v_order_row.total_paise,
    'collected_at',   NOW()
  );

  RETURN v_receipt;

EXCEPTION
  WHEN lock_not_available THEN
    -- Token row is locked by another concurrent transaction
    RETURN jsonb_build_object(
      'success',    false,
      'error_code', 'ALREADY_USED',
      'message',    'Token is currently being processed by another request'
    );
  WHEN OTHERS THEN
    -- Log and surface generic error
    RAISE WARNING 'validate_and_use_qr_token error: % %', SQLERRM, SQLSTATE;
    RETURN jsonb_build_object(
      'success',    false,
      'error_code', 'INTERNAL_ERROR',
      'message',    'An unexpected error occurred while processing the QR token',
      'detail',     SQLERRM
    );
END;
$$;

-- ============================================================
-- 5. generate_order_number() — Generates a unique order number
-- Format: CB-YYYYMMDD-NNNN (e.g. CB-20241215-0042)
-- Sequence resets per day.
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS order_number_daily_seq;

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date_str  TEXT;
  v_seq       INTEGER;
  v_number    TEXT;
BEGIN
  v_date_str := TO_CHAR(NOW() AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD');

  -- Count today's orders and use that for sequential numbering
  SELECT COUNT(*) + 1
    INTO v_seq
    FROM orders
   WHERE DATE(created_at AT TIME ZONE 'Asia/Kolkata') = CURRENT_DATE;

  v_number := 'CB-' || v_date_str || '-' || LPAD(v_seq::TEXT, 4, '0');

  -- Ensure uniqueness (handle concurrent inserts)
  WHILE EXISTS (SELECT 1 FROM orders WHERE order_number = v_number) LOOP
    v_seq   := v_seq + 1;
    v_number := 'CB-' || v_date_str || '-' || LPAD(v_seq::TEXT, 4, '0');
  END LOOP;

  RETURN v_number;
END;
$$;

-- ============================================================
-- 6. expire_qr_tokens() — Called by a scheduled job (pg_cron)
-- Marks all active tokens past their expiry as 'expired'.
-- ============================================================

CREATE OR REPLACE FUNCTION public.expire_qr_tokens()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE qr_tokens
     SET status     = 'expired',
         updated_at = NOW()
   WHERE status     = 'active'
     AND expires_at < NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================================
-- 7. update_updated_at() — Generic trigger function
-- Keeps updated_at columns in sync automatically.
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Attach updated_at triggers to all relevant tables
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'institutes', 'canteens', 'categories', 'menu_items',
    'users', 'addresses', 'orders', 'kiosks', 'qr_tokens',
    'staff', 'coupons', 'reviews', 'payment_transactions'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_update_updated_at ON %I;
       CREATE TRIGGER trg_update_updated_at
         BEFORE UPDATE ON %I
         FOR EACH ROW
         EXECUTE FUNCTION public.update_updated_at();',
      t, t
    );
  END LOOP;
END;
$$;

-- ============================================================
-- 8. increment_coupon_used_count() — Trigger on user_coupons INSERT
-- Automatically increments coupons.used_count when a coupon is redeemed.
-- ============================================================

CREATE OR REPLACE FUNCTION public.increment_coupon_used_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE coupons
     SET used_count = used_count + 1,
         updated_at = NOW()
   WHERE id = NEW.coupon_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_coupon_used_count ON user_coupons;
CREATE TRIGGER trg_increment_coupon_used_count
  AFTER INSERT ON user_coupons
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_coupon_used_count();

-- ============================================================
-- 9. validate_order_total() — Trigger on orders BEFORE INSERT/UPDATE
-- Ensures total_paise = subtotal_paise + tax_paise - discount_paise
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_order_total()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_expected_total INTEGER;
BEGIN
  v_expected_total := NEW.subtotal_paise + NEW.tax_paise - NEW.discount_paise;

  IF v_expected_total < 0 THEN
    RAISE EXCEPTION 'Order total cannot be negative (subtotal=%, tax=%, discount=%)',
      NEW.subtotal_paise, NEW.tax_paise, NEW.discount_paise;
  END IF;

  -- Auto-correct total to match components (avoids rounding drift)
  NEW.total_paise := v_expected_total;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_order_total ON orders;
CREATE TRIGGER trg_validate_order_total
  BEFORE INSERT OR UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_order_total();

-- ============================================================
-- 10. notify_order_status_change() — Trigger on orders UPDATE
-- Inserts a notification record when order status changes.
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title   TEXT;
  v_body    TEXT;
  v_type    TEXT;
BEGIN
  -- Only act when status actually changed
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  CASE NEW.status
    WHEN 'confirmed' THEN
      v_type  := 'order_confirmed';
      v_title := 'Order Confirmed!';
      v_body  := format('Your order %s has been confirmed. Estimated ready in %s minutes.',
                        NEW.order_number,
                        COALESCE(
                          EXTRACT(EPOCH FROM (NEW.estimated_ready_at - NOW()))::INTEGER / 60,
                          15
                        ));
    WHEN 'preparing' THEN
      v_type  := 'order_preparing';
      v_title := 'We''re Preparing Your Order';
      v_body  := format('Order %s is now being prepared by the canteen.', NEW.order_number);
    WHEN 'ready' THEN
      v_type  := 'order_ready';
      v_title := 'Your Order is Ready!';
      v_body  := format('Order %s is ready for pickup. Please show your QR code at the counter.', NEW.order_number);
    WHEN 'collected' THEN
      v_type  := 'order_collected';
      v_title := 'Order Collected';
      v_body  := format('Order %s has been collected. Enjoy your meal!', NEW.order_number);
    WHEN 'cancelled' THEN
      v_type  := 'order_cancelled';
      v_title := 'Order Cancelled';
      v_body  := format('Order %s has been cancelled. %s',
                        NEW.order_number,
                        COALESCE(NEW.cancellation_reason, ''));
    WHEN 'refunded' THEN
      v_type  := 'refund_initiated';
      v_title := 'Refund Initiated';
      v_body  := format('Refund of ₹%.2f for order %s has been initiated.',
                        NEW.refund_amount_paise::NUMERIC / 100,
                        NEW.order_number);
    ELSE
      RETURN NEW;  -- Don't notify for payment_pending / payment_failed (handled elsewhere)
  END CASE;

  INSERT INTO notifications (user_id, type, title, body, data)
  VALUES (
    NEW.user_id,
    v_type,
    v_title,
    v_body,
    jsonb_build_object(
      'order_id',     NEW.id,
      'order_number', NEW.order_number,
      'canteen_id',   NEW.canteen_id
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_order_status_change ON orders;
CREATE TRIGGER trg_notify_order_status_change
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_order_status_change();

-- ============================================================
-- SECURITY: Prevent role escalation via UPDATE on users table
-- ============================================================
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only admins can change roles; students cannot promote themselves
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- Allow only if the actor is a super_admin (checked via service role context)
    -- Client-side updates cannot change role — only service role functions can
    IF current_setting('role', true) != 'service_role' THEN
      RAISE EXCEPTION 'Role changes must be performed by a super_admin via the admin panel'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Also prevent deactivating yourself
  IF NEW.is_active IS DISTINCT FROM OLD.is_active AND NEW.id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot deactivate your own account'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.users;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_escalation();

-- ============================================================
-- SECURITY: Validate order status transitions
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_order_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Allow same-status updates (idempotent)
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Enforce state machine
  CASE OLD.status
    WHEN 'payment_pending' THEN
      IF NEW.status NOT IN ('payment_failed', 'confirmed', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot transition order from payment_pending to %', NEW.status;
      END IF;
    WHEN 'payment_failed' THEN
      IF NEW.status NOT IN ('cancelled', 'payment_pending') THEN
        RAISE EXCEPTION 'Cannot transition order from payment_failed to %', NEW.status;
      END IF;
    WHEN 'confirmed' THEN
      IF NEW.status NOT IN ('preparing', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot transition order from confirmed to %', NEW.status;
      END IF;
    WHEN 'preparing' THEN
      IF NEW.status NOT IN ('ready', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot transition order from preparing to %', NEW.status;
      END IF;
    WHEN 'ready' THEN
      IF NEW.status NOT IN ('collected', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot transition order from ready to %', NEW.status;
      END IF;
    WHEN 'collected' THEN
      IF NEW.status NOT IN ('refunded') THEN
        RAISE EXCEPTION 'Cannot transition order from collected to %', NEW.status;
      END IF;
    WHEN 'cancelled' THEN
      IF NEW.status NOT IN ('refunded') THEN
        RAISE EXCEPTION 'Cannot transition from cancelled to %', NEW.status;
      END IF;
    WHEN 'refunded' THEN
      RAISE EXCEPTION 'Refunded orders cannot change status';
    ELSE
      NULL; -- allow unknown → known transitions for legacy data
  END CASE;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_order_status ON public.orders;
CREATE TRIGGER trg_validate_order_status
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_order_status_transition();

-- ============================================================
-- SECURITY: QR token expiry cap at 4 hours maximum
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_qr_token_expiry()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Token cannot expire more than 4 hours in the future
  IF NEW.expires_at > NOW() + INTERVAL '4 hours' THEN
    RAISE EXCEPTION 'QR token expiry cannot exceed 4 hours from now';
  END IF;
  -- Token must expire in the future
  IF NEW.expires_at <= NOW() THEN
    RAISE EXCEPTION 'QR token expiry must be in the future';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_qr_token_expiry ON public.qr_tokens;
CREATE TRIGGER trg_validate_qr_token_expiry
  BEFORE INSERT ON public.qr_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_qr_token_expiry();

-- ============================================================
-- Atomic coupon validation and reservation
-- Prevents race conditions when multiple users apply the same coupon
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_and_reserve_coupon(
  p_code        TEXT,
  p_user_id     UUID,
  p_subtotal    INTEGER  -- in paise
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_coupon    coupons%ROWTYPE;
  v_used      INTEGER;
  v_discount  INTEGER;
BEGIN
  -- Lock the coupon row for update to prevent concurrent reservations
  SELECT * INTO v_coupon
    FROM public.coupons
   WHERE code = UPPER(p_code)
     AND is_active = true
     AND valid_from <= NOW()
     AND valid_until >= NOW()
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'COUPON_NOT_FOUND');
  END IF;

  -- Check minimum order value
  IF p_subtotal < v_coupon.min_order_paise THEN
    RETURN jsonb_build_object('valid', false, 'error', 'ORDER_TOO_SMALL',
      'min_order_paise', v_coupon.min_order_paise);
  END IF;

  -- Check usage limit (atomic — we hold the row lock)
  IF v_coupon.usage_limit IS NOT NULL AND v_coupon.used_count >= v_coupon.usage_limit THEN
    RETURN jsonb_build_object('valid', false, 'error', 'COUPON_EXHAUSTED');
  END IF;

  -- Check if user already used this coupon
  IF EXISTS (
    SELECT 1 FROM public.user_coupons
    WHERE coupon_id = v_coupon.id AND user_id = p_user_id AND is_used = true
  ) THEN
    RETURN jsonb_build_object('valid', false, 'error', 'COUPON_ALREADY_USED');
  END IF;

  -- Calculate discount
  IF v_coupon.discount_type = 'percentage' THEN
    v_discount := (p_subtotal * v_coupon.discount_value) / 100;
    IF v_coupon.max_discount_paise IS NOT NULL THEN
      v_discount := LEAST(v_discount, v_coupon.max_discount_paise);
    END IF;
  ELSE -- flat
    v_discount := v_coupon.discount_value;
  END IF;

  -- Atomically increment used_count
  UPDATE public.coupons
     SET used_count = used_count + 1
   WHERE id = v_coupon.id;

  -- Record user coupon usage reservation
  INSERT INTO public.user_coupons (user_id, coupon_id, is_used)
  VALUES (p_user_id, v_coupon.id, false)
  ON CONFLICT (user_id, coupon_id) DO NOTHING;

  RETURN jsonb_build_object(
    'valid',          true,
    'coupon_id',      v_coupon.id,
    'discount_paise', v_discount,
    'discount_type',  v_coupon.discount_type
  );
END;
$$;
