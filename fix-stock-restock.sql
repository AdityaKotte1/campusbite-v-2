-- ============================================================================
-- fix-stock-restock.sql
-- ----------------------------------------------------------------------------
-- MUST be run in Supabase (SQL Editor) BEFORE deploy.
--
-- Closes a stock-leak found in the security audit:
--   `decrement_item_stock` (packages/database/migrations/002_stock_management.sql)
--   is called at ORDER-CREATION time, while the order is still payment_pending.
--   There is NO restock path anywhere, so orders that are never paid — cancelled,
--   failed, or abandoned payment_pending — permanently consume stock. Items go
--   "sold out" without a single unit actually leaving the kitchen.
--
-- This adds a restock mechanism that mirrors decrement_item_stock's semantics:
--   • respects stock_enabled (tracking off  → no-op)
--   • NULL stock_count = unlimited          → no-op
--   • row-locked (FOR UPDATE)               → safe under concurrency
--   • the existing BEFORE UPDATE trigger trg_auto_manage_stock flips
--     is_available back on when stock climbs above zero.
--
-- An `orders.stock_restocked` idempotency guard ensures a given order can never
-- be restocked twice (double payment webhooks, retries, race between cancel and
-- expiry sweep, etc.).
--
-- Everything here is idempotent (ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE).
-- ============================================================================

-- ─── 1. Idempotency guard on orders ──────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stock_restocked BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orders.stock_restocked IS
  'True once the order''s reserved stock has been returned. Prevents double-restock.';

-- ─── 2. FUNCTION: increment stock for a single item ──────────────────────────
-- Mirror image of decrement_item_stock. Adds p_quantity back to a tracked item.
-- Used for one-off / manual restocks; restock_order updates menu_items directly
-- (see note in restock_order) to stay in a single locked transaction.
CREATE OR REPLACE FUNCTION public.increment_item_stock(
  p_menu_item_id UUID,
  p_quantity      INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.menu_items%ROWTYPE;
BEGIN
  -- Lock the row so concurrent stock changes don't race
  SELECT * INTO v_item
    FROM public.menu_items
   WHERE id = p_menu_item_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'ITEM_NOT_FOUND',
      'item_id', p_menu_item_id
    );
  END IF;

  -- If stock tracking is off, nothing to restock
  IF NOT v_item.stock_enabled THEN
    RETURN jsonb_build_object('success', true, 'stock_tracked', false);
  END IF;

  -- Null stock_count treated as unlimited → nothing to restock
  IF v_item.stock_count IS NULL THEN
    RETURN jsonb_build_object('success', true, 'stock_tracked', true, 'remaining', NULL);
  END IF;

  -- Add the units back — the BEFORE UPDATE trigger trg_auto_manage_stock
  -- re-enables is_available if this lifts stock above zero.
  UPDATE public.menu_items
     SET stock_count = stock_count + p_quantity
   WHERE id = p_menu_item_id;

  RETURN jsonb_build_object(
    'success',       true,
    'stock_tracked', true,
    'remaining',     v_item.stock_count + p_quantity
  );
END;
$$;

-- ─── 3. FUNCTION: restock every item of an order (idempotent) ────────────────
-- Called when an order will never be fulfilled (cancelled / payment failed /
-- expired). Returns the reserved stock for every tracked item, exactly once.
CREATE OR REPLACE FUNCTION public.restock_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order   public.orders%ROWTYPE;
  r         RECORD;
  v_count   INTEGER := 0;
BEGIN
  -- Lock the order so two concurrent callers can't both pass the guard.
  SELECT * INTO v_order
    FROM public.orders
   WHERE id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  END IF;

  -- Idempotency guard: already restocked → no-op success.
  IF v_order.stock_restocked IS TRUE THEN
    RETURN jsonb_build_object('success', true, 'already_restocked', true);
  END IF;

  -- Return stock for every tracked (stock_enabled, finite stock_count) item.
  -- We UPDATE menu_items directly inside the loop rather than calling
  -- increment_item_stock, to stay within one function/transaction and avoid
  -- nested-lock surprises. The trg_auto_manage_stock trigger flips is_available
  -- back on when a count climbs above zero.
  FOR r IN
    SELECT oi.menu_item_id, oi.quantity
      FROM public.order_items oi
      JOIN public.menu_items mi ON mi.id = oi.menu_item_id
     WHERE oi.order_id = p_order_id
       AND mi.stock_enabled = true
       AND mi.stock_count IS NOT NULL
  LOOP
    UPDATE public.menu_items
       SET stock_count = stock_count + r.quantity
     WHERE id = r.menu_item_id;
    v_count := v_count + 1;
  END LOOP;

  -- Flip the guard so this order is never restocked again.
  UPDATE public.orders SET stock_restocked = true WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success',         true,
    'already_restocked', false,
    'items_restocked', v_count
  );
END;
$$;

-- ─── 4. Grants: service_role ONLY ────────────────────────────────────────────
-- These are compensating/administrative operations, invoked exclusively by the
-- service client (order cancel / payment-failure / expiry sweep). Never expose
-- them to `authenticated` — a caller-supplied order/item id could otherwise be
-- used to inflate stock arbitrarily.
GRANT EXECUTE ON FUNCTION public.increment_item_stock(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.restock_order(UUID)                 TO service_role;

REVOKE ALL ON FUNCTION public.increment_item_stock(UUID, INTEGER) FROM authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.restock_order(UUID)                 FROM authenticated, PUBLIC;
