-- ──────────────────────────────────────────────────────────
-- Kiosks table — add columns the app writes/reads but schema.sql omitted
-- Run this in the Supabase SQL editor.
--
-- Fixes: "Could not find the 'location' column of 'kiosks' in the schema cache"
-- and the same error that would otherwise occur on the first kiosk heartbeat
-- (heartbeat_data, firmware_version).
-- ──────────────────────────────────────────────────────────
ALTER TABLE kiosks
  ADD COLUMN IF NOT EXISTS location         text,
  ADD COLUMN IF NOT EXISTS heartbeat_data   jsonb,
  ADD COLUMN IF NOT EXISTS firmware_version text;

-- Force PostgREST to reload its schema cache so the new columns are visible
-- to the API immediately (otherwise the error can persist until the next reload).
NOTIFY pgrst, 'reload schema';
