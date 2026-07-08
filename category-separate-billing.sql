-- ════════════════════════════════════════════════════════════════════════
-- MunchAdda — Separate-billing (order-alone) categories
-- Run this in the Supabase SQL editor.
--
-- A category flagged separate_billing = true may only be ordered on its own:
-- its items cannot share a cart/order with items from any other category.
-- Default false preserves today's freely-mixable behavior. Enforced in the
-- student cart (client) and in POST /api/v1/orders (server, authoritative).
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS separate_billing boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
