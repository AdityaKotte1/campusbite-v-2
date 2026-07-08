-- ============================================================================
-- canteen-cash-toggle.sql — per-canteen "Pay by cash" on/off switch.
--
-- Adds canteens.cash_payments_enabled. When FALSE, students can no longer choose
-- "Pay by cash" for that canteen at checkout — the option is hidden in the cart
-- and rejected server-side by the order API. Online payment is unaffected.
--
-- Default TRUE so every EXISTING canteen keeps accepting cash exactly as before;
-- an admin (super_admin, or the canteen_admin who owns the canteen) turns it off
-- per canteen from the Canteens page.
--
-- Turning cash off only blocks NEW cash orders. Cash orders already placed and
-- awaiting counter approval stay approvable via the Cash Payments screen.
--
-- Safe to run repeatedly.
-- ============================================================================

ALTER TABLE public.canteens
  ADD COLUMN IF NOT EXISTS cash_payments_enabled BOOLEAN NOT NULL DEFAULT true;
