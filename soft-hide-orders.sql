-- ============================================================================
-- soft-hide-orders.sql
-- ----------------------------------------------------------------------------
-- Canteen admins can "delete" order history from THEIR OWN view, but the rows
-- (and all financial data) must be preserved and stay visible to super admins.
--
-- This replaces the old hard-delete with a SOFT HIDE. The DELETE /api/v1/admin/
-- orders route now stamps hidden_at/hidden_by instead of removing rows. The
-- admin orders GET filters `hidden_at IS NULL` for non-super-admins; super
-- admins see every row and badge the hidden ones in the UI.
--
-- Idempotent — safe to re-run.
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hidden_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.orders.hidden_at IS
  'When a canteen admin hid this order from their history view. NULL = visible. The row is never deleted; super admins still see it.';
COMMENT ON COLUMN public.orders.hidden_by IS
  'The canteen admin who hid this order (audit trail).';
