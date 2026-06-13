-- ============================================================================
-- fix-duplicate-institute-fk.sql
-- ----------------------------------------------------------------------------
-- ROOT CAUSE FIX for the student-app profile bug where Phone and Institute
-- revert to "Not set" after a refresh (data stayed correct in the DB).
--
-- Two FOREIGN KEY constraints exist on users.institute_id -> institutes(id)
-- (one from schema.sql, one from supabase-schema-update.sql's
-- `ADD COLUMN ... REFERENCES`). PostgREST then cannot resolve the embed
-- `institute:institutes(...)` and fails with:
--
--   PGRST201: Could not embed because more than one relationship was found
--             for 'users' and 'institutes'
--
-- The browser query in use-auth.ts therefore returned no data and fell back to
-- a stripped user object (phone: null, institute_id: null) — purely a UI-level
-- revert, exactly as reported.
--
-- This migration drops every DUPLICATE FK from users.institute_id -> institutes,
-- keeps exactly one, and normalises its name to `users_institute_id_fkey` so the
-- app can pin the relationship unambiguously. Idempotent and name-agnostic —
-- safe to run multiple times.
-- ============================================================================

DO $$
DECLARE
  c         record;
  keep_name text := NULL;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid  = 'public.users'::regclass
      AND confrelid = 'public.institutes'::regclass
      AND contype   = 'f'
    ORDER BY conname
  LOOP
    IF keep_name IS NULL THEN
      keep_name := c.conname;                       -- keep the first
    ELSE
      EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', c.conname);
      RAISE NOTICE 'Dropped duplicate FK users -> institutes: %', c.conname;
    END IF;
  END LOOP;

  IF keep_name IS NULL THEN
    RAISE NOTICE 'No users -> institutes FK found (nothing to do).';
  ELSIF keep_name <> 'users_institute_id_fkey' THEN
    EXECUTE format(
      'ALTER TABLE public.users RENAME CONSTRAINT %I TO users_institute_id_fkey',
      keep_name
    );
    RAISE NOTICE 'Renamed surviving FK % -> users_institute_id_fkey', keep_name;
  ELSE
    RAISE NOTICE 'Surviving FK already named users_institute_id_fkey (ok).';
  END IF;
END $$;

-- Verify (optional): should return exactly ONE row named users_institute_id_fkey
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.users'::regclass
--   AND confrelid = 'public.institutes'::regclass;
