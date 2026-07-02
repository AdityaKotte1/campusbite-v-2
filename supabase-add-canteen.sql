-- ════════════════════════════════════════════════════════════════════════
-- MunchAdda — Self-serve Add Canteen (prorated billing)
-- Run this in the Supabase SQL editor AFTER supabase-subscriptions.sql.
-- ════════════════════════════════════════════════════════════════════════

-- 1. Canteen billing lifecycle. 'active' = counts toward the bill & visible.
--    'pending_payment' = a self-serve canteen awaiting its prorated payment;
--    excluded from billing counts and (being is_active=false) hidden from students.
ALTER TABLE canteens
  ADD COLUMN IF NOT EXISTS billing_state text NOT NULL DEFAULT 'active';

-- 2. Link an add-on invoice to the canteen it pays for (verify uses this).
ALTER TABLE subscription_invoices
  ADD COLUMN IF NOT EXISTS canteen_id uuid REFERENCES canteens(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_canteen ON subscription_invoices(canteen_id);

-- 3. Overview function counts only billing-active canteens.
CREATE OR REPLACE FUNCTION institute_subscription_overview()
RETURNS TABLE (
  institute_id         uuid,
  institute_name       text,
  is_active_subscriber boolean,
  subscription_status  text,
  canteen_count        bigint,
  student_count        bigint
) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.name, i.is_active_subscriber, i.subscription_status,
         (SELECT count(*) FROM canteens c
            WHERE c.institute_id = i.id AND c.billing_state = 'active'),
         (SELECT count(*) FROM users u
            WHERE u.institute_id = i.id AND u.role = 'student')
    FROM institutes i
   ORDER BY i.name;
$$;

NOTIFY pgrst, 'reload schema';
