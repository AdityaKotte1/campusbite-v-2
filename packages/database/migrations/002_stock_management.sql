-- ============================================================
-- Migration 002: Stock Management for Menu Items
-- Run this in Supabase SQL Editor AFTER 001_initial.sql
-- ============================================================

-- Add stock columns to menu_items
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS stock_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_count   INTEGER DEFAULT NULL;

-- stock_enabled = false → no stock tracking (unlimited, always available by default)
-- stock_enabled = true, stock_count = 25 → 25 units remaining
-- stock_enabled = true, stock_count = 0  → sold out (auto-disabled)

COMMENT ON COLUMN public.menu_items.stock_enabled IS 'Whether stock tracking is active for this item';
COMMENT ON COLUMN public.menu_items.stock_count   IS 'Units remaining. NULL = unlimited (only meaningful when stock_enabled = true)';

-- ─── TRIGGER: Auto-manage availability when stock changes ─────────────────────
CREATE OR REPLACE FUNCTION public.auto_manage_stock_availability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only act when stock tracking is on
  IF NEW.stock_enabled THEN
    IF NEW.stock_count IS NOT NULL AND NEW.stock_count <= 0 THEN
      -- Stock just hit zero → mark unavailable
      NEW.stock_count   := 0;
      NEW.is_available  := false;
    ELSIF NEW.stock_count > 0 AND (OLD.stock_count IS NULL OR OLD.stock_count <= 0) THEN
      -- Stock was zero/null and is now being refilled → mark available again
      NEW.is_available := true;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_manage_stock ON public.menu_items;
CREATE TRIGGER trg_auto_manage_stock
  BEFORE UPDATE OF stock_count, stock_enabled ON public.menu_items
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_manage_stock_availability();

-- ─── FUNCTION: Atomically decrement stock for an ordered item ─────────────────
-- Called once per order item at order-creation time.
-- Uses SELECT FOR UPDATE to prevent race conditions (two orders grabbing the last unit).
CREATE OR REPLACE FUNCTION public.decrement_item_stock(
  p_menu_item_id UUID,
  p_quantity      INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_item public.menu_items%ROWTYPE;
BEGIN
  -- Lock the row so concurrent orders don't race
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

  -- If stock tracking is off, nothing to decrement
  IF NOT v_item.stock_enabled THEN
    RETURN jsonb_build_object('success', true, 'stock_tracked', false);
  END IF;

  -- Null stock_count treated as unlimited
  IF v_item.stock_count IS NULL THEN
    RETURN jsonb_build_object('success', true, 'stock_tracked', true, 'remaining', NULL);
  END IF;

  -- Check sufficient stock
  IF v_item.stock_count < p_quantity THEN
    RETURN jsonb_build_object(
      'success',   false,
      'error',     'INSUFFICIENT_STOCK',
      'item_id',   p_menu_item_id,
      'item_name', v_item.name,
      'available', v_item.stock_count,
      'requested', p_quantity
    );
  END IF;

  -- Decrement — the trigger auto-sets is_available=false if this hits 0
  UPDATE public.menu_items
     SET stock_count = stock_count - p_quantity
   WHERE id = p_menu_item_id;

  RETURN jsonb_build_object(
    'success',       true,
    'stock_tracked', true,
    'remaining',     v_item.stock_count - p_quantity
  );
END;
$$;

-- ─── FUNCTION: Refill stock for an item ──────────────────────────────────────
-- Also re-enables stock tracking and marks the item available if count > 0.
CREATE OR REPLACE FUNCTION public.refill_item_stock(
  p_menu_item_id UUID,
  p_new_count    INTEGER  -- The new total (not incremental), e.g. "50 fresh idlis"
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_item public.menu_items%ROWTYPE;
BEGIN
  IF p_new_count < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_COUNT');
  END IF;

  SELECT * INTO v_item FROM public.menu_items WHERE id = p_menu_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ITEM_NOT_FOUND');
  END IF;

  UPDATE public.menu_items
     SET stock_enabled = true,
         stock_count   = p_new_count,
         -- Trigger handles is_available; but also set here for clarity
         is_available  = (p_new_count > 0)
   WHERE id = p_menu_item_id;

  RETURN jsonb_build_object(
    'success',   true,
    'new_count', p_new_count,
    'available', (p_new_count > 0)
  );
END;
$$;
