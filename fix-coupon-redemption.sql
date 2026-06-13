-- ============================================================================
-- fix-coupon-redemption.sql
-- ----------------------------------------------------------------------------
-- Closes the coupon abuse findings from the security audit:
--   • The order route called a NON-EXISTENT rpc `increment_coupon_usage`, so
--     `used_count` never advanced and a coupon's global `usage_limit` was never
--     enforced → unlimited redemptions.
--   • Per-user enforcement used `.ilike('coupon_code', ...)` on orders (pattern
--     metacharacters) and counted not-yet-paid orders → bypassable.
--
-- This adds an atomic, row-locked `claim_coupon` (validates scope/min/global
-- limit/per-user limit and reserves a global slot in one locked statement) plus
-- a compensating `release_coupon` for the rare case the order fails after claim.
-- SECURITY DEFINER so it can update coupons.used_count regardless of caller RLS.
--
-- NOTE on units: flat `discount_value` is stored in RUPEES (the app multiplies
-- by 100 to get paise); percentage is a whole-number percent. The earlier
-- `validate_and_reserve_coupon` got the flat unit wrong AND referenced a
-- non-existent `user_coupons.is_used` column — it is superseded by this and
-- should not be used.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_coupon(
  p_code           TEXT,
  p_user_id        UUID,
  p_subtotal_paise INTEGER,
  p_canteen_id     UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c         public.coupons%ROWTYPE;
  v_user_uses INTEGER;
  v_discount  INTEGER;
BEGIN
  -- Lock the coupon row so the global/per-user checks and the increment are
  -- atomic against concurrent redemptions of the same coupon.
  SELECT * INTO v_c
    FROM public.coupons
   WHERE code = upper(p_code)
     AND is_active = true
     AND valid_from <= now()
     AND (valid_until IS NULL OR valid_until >= now())
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'COUPON_NOT_FOUND');
  END IF;

  IF v_c.canteen_id IS NOT NULL AND v_c.canteen_id <> p_canteen_id THEN
    RETURN jsonb_build_object('valid', false, 'error', 'NOT_APPLICABLE');
  END IF;

  IF p_subtotal_paise < COALESCE(v_c.min_order_paise, 0) THEN
    RETURN jsonb_build_object('valid', false, 'error', 'ORDER_TOO_SMALL');
  END IF;

  IF v_c.usage_limit IS NOT NULL AND v_c.used_count >= v_c.usage_limit THEN
    RETURN jsonb_build_object('valid', false, 'error', 'EXHAUSTED');
  END IF;

  SELECT count(*) INTO v_user_uses
    FROM public.user_coupons
   WHERE coupon_id = v_c.id AND user_id = p_user_id;

  IF v_user_uses >= v_c.per_user_limit THEN
    RETURN jsonb_build_object('valid', false, 'error', 'USER_LIMIT');
  END IF;

  IF v_c.discount_type = 'percentage' THEN
    v_discount := floor(p_subtotal_paise * v_c.discount_value / 100.0);
    IF v_c.max_discount_paise IS NOT NULL THEN
      v_discount := least(v_discount, v_c.max_discount_paise);
    END IF;
  ELSE -- flat: discount_value is in rupees
    v_discount := floor(v_c.discount_value * 100);
  END IF;
  IF v_discount < 0 THEN v_discount := 0; END IF;

  -- Reserve a global slot (atomic under the row lock held above).
  UPDATE public.coupons SET used_count = used_count + 1 WHERE id = v_c.id;

  RETURN jsonb_build_object(
    'valid',          true,
    'coupon_id',      v_c.id,
    'discount_paise', v_discount
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_coupon(p_coupon_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.coupons
     SET used_count = greatest(0, used_count - 1)
   WHERE id = p_coupon_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_coupon(TEXT, UUID, INTEGER, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_coupon(UUID) TO authenticated, service_role;
