-- ============================================================================
-- fix-order-integrity.sql  —  CRITICAL: close the "free food" hole.
--
-- Students hold the PUBLIC anon key + their own JWT, so they can call PostgREST
-- directly (not just the Next.js API routes). The orders / order_items /
-- qr_tokens INSERT policies only checked `user_id = auth.uid()` — NOT status,
-- payment_status or totals. So a logged-in student could POST directly:
--   orders { user_id: me, status:'confirmed', payment_status:'paid', total_paise:1 }
--   + order_items + a qr_tokens row, then scan at the kiosk and collect for free.
--
-- Fix: orders and QR tokens are now created ONLY server-side (service role) by
-- the API routes, which compute prices from the DB and only mint a QR for a
-- paid, owned order. Removing the student INSERT policies makes a direct
-- PostgREST insert impossible.
--
-- DEPLOY ORDER: deploy the matching student-app changes FIRST (orders + qr
-- routes now insert with the service client), THEN run this. If you run it
-- before deploying, legit order creation (old user-client insert) breaks.
-- ============================================================================

DROP POLICY IF EXISTS "orders_own_insert"      ON public.orders;
DROP POLICY IF EXISTS "order_items_own_insert" ON public.order_items;
DROP POLICY IF EXISTS "qr_tokens_own_insert"   ON public.qr_tokens;

-- Students keep their SELECT policies (they still read their own orders / items
-- / tokens) and any cancel-UPDATE policy — only the privileged-field INSERT
-- vectors are removed. Reviews/support/etc. are unaffected.
