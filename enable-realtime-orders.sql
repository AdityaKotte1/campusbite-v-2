-- enable-realtime-orders.sql
-- Push instant order-status updates to students via Supabase Realtime, so the
-- student app no longer needs to poll every 30s (it now only keeps a slow 60s
-- safety poll as a backstop for dropped sockets).
--
-- SECURITY: delivery is scoped by the EXISTING RLS policy on orders —
--   orders_own_read:  FOR SELECT USING (user_id = auth.uid())
-- so a student's WebSocket only ever receives their OWN order rows. No new
-- policy or minted token is required (students are authenticated Supabase users
-- and the browser client already carries their session JWT). This mirrors the
-- print_jobs Realtime setup used by the kiosk counters.
--
-- Run once in the Supabase SQL editor. Idempotent.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
END $$;

-- Note on replica identity: we only subscribe to INSERT/UPDATE events and filter
-- on id / user_id. For INSERT and UPDATE the NEW row carries every column, so the
-- default replica identity (primary key) is sufficient — no REPLICA IDENTITY FULL
-- needed (which would add WAL overhead). DELETE is not subscribed.

-- Verify (optional):
--   SELECT tablename FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime' AND schemaname = 'public';
-- 'orders' (and 'print_jobs') should appear.
