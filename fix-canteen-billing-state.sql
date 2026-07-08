-- Make canteens.billing_state the reliable "is this canteen live" gate.
--
-- Context: student visibility + billing now key off `billing_state = 'active'`.
-- A positive equality filter silently excludes NULLs (SQL: NULL = 'active' is
-- unknown), so any legacy canteen with a NULL billing_state would vanish from
-- the student app and billing counts. This migration removes that risk.
--
-- Run once in Supabase (SQL editor). Safe/idempotent.

-- 1) Backfill legacy NULLs to 'active' (an existing canteen with no billing
--    state was a normally-provisioned, live canteen).
UPDATE canteens SET billing_state = 'active' WHERE billing_state IS NULL;

-- 2) Default new rows to 'active'. Payment-gated creation (the paid add-on
--    flow) still sets 'pending_payment' explicitly; the super-admin create
--    path sets 'active' explicitly. This default just prevents future NULLs.
ALTER TABLE canteens ALTER COLUMN billing_state SET DEFAULT 'active';
