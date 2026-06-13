-- ════════════════════════════════════════════════════════════════════════
-- MunchAdda — Institute Subscriptions (Phase 1)
-- Run this in the Supabase SQL editor.
--
-- Adds: subscription_plans (catalog), institute_subscriptions (one per
-- institute), subscription_invoices (history), institute flags, a sync trigger
-- that keeps institutes.is_active_subscriber in step with the subscription
-- status, an overview function for the admin console, and an expiry function
-- for the daily cron. Existing institutes default to active so nothing breaks.
--
-- SECURITY HARDENING (Fix 5): the institute-scoped read policies now require a
-- super_admin/canteen_admin role so students can no longer read their
-- institute's billing data. See also security-hardening.sql.
-- ════════════════════════════════════════════════════════════════════════

-- 1. Flags on institutes (default active so current institutes stay visible)
ALTER TABLE institutes
  ADD COLUMN IF NOT EXISTS subscription_status  text    NOT NULL DEFAULT 'trialing',
  ADD COLUMN IF NOT EXISTS is_active_subscriber boolean NOT NULL DEFAULT true;

-- 2. Plan catalog (display/limits; exact price is computed in app code)
CREATE TABLE IF NOT EXISTS subscription_plans (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                text UNIQUE NOT NULL,        -- starter|growth|campus|enterprise
  name                text NOT NULL,
  max_canteens        int,                          -- null = unlimited
  max_students        int,                          -- null = unlimited
  monthly_price_paise int  NOT NULL DEFAULT 0,      -- indicative list price
  sort_order          int  NOT NULL DEFAULT 0,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

INSERT INTO subscription_plans (code, name, max_canteens, max_students, monthly_price_paise, sort_order)
VALUES
  ('starter',    'Starter',     1,    1000,   200000,  1),
  ('growth',     'Growth',      3,    5000,   750000,  2),
  ('campus',     'Campus',      6,    15000,  1600000, 3),
  ('enterprise', 'Enterprise',  NULL, NULL,   0,       4)
ON CONFLICT (code) DO NOTHING;

-- 3. One current subscription per institute (history lives in invoices)
CREATE TABLE IF NOT EXISTS institute_subscriptions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id         uuid NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  plan_code            text,
  billing_cycle        text NOT NULL DEFAULT 'monthly',  -- monthly|biannual|annual
  canteens_count       int  NOT NULL DEFAULT 1,
  students_count       int  NOT NULL DEFAULT 0,
  base_amount_paise    int  NOT NULL DEFAULT 0,           -- per-month base (canteens + tier)
  discount_pct         numeric NOT NULL DEFAULT 0,
  subtotal_paise       int  NOT NULL DEFAULT 0,           -- whole cycle, pre-GST
  gst_paise            int  NOT NULL DEFAULT 0,
  total_paise          int  NOT NULL DEFAULT 0,           -- cycle total incl GST
  status               text NOT NULL DEFAULT 'trialing',  -- trialing|active|past_due|expired|cancelled
  trial_ends_at        timestamptz,
  current_period_start timestamptz,
  current_period_end   timestamptz,
  auto_renew           boolean NOT NULL DEFAULT false,
  razorpay_order_id    text,
  razorpay_payment_id  text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_sub_per_institute ON institute_subscriptions(institute_id);
CREATE INDEX IF NOT EXISTS idx_sub_period_end ON institute_subscriptions(current_period_end);

-- 4. Invoice / payment history
CREATE TABLE IF NOT EXISTS subscription_invoices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id        uuid NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  subscription_id     uuid REFERENCES institute_subscriptions(id) ON DELETE SET NULL,
  billing_cycle       text NOT NULL,
  period_start        timestamptz NOT NULL,
  period_end          timestamptz NOT NULL,
  subtotal_paise      int NOT NULL,
  gst_paise           int NOT NULL,
  total_paise         int NOT NULL,
  status              text NOT NULL DEFAULT 'paid',   -- paid|pending|failed|comp
  method              text,                            -- razorpay|manual|comp
  razorpay_order_id   text,
  razorpay_payment_id text,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
-- (idempotent, in case the table already existed from an earlier run)
ALTER TABLE subscription_invoices ADD COLUMN IF NOT EXISTS razorpay_order_id text;
CREATE INDEX IF NOT EXISTS idx_invoice_institute ON subscription_invoices(institute_id);
CREATE INDEX IF NOT EXISTS idx_invoice_rzp_order ON subscription_invoices(razorpay_order_id);

-- 5. Keep institutes.is_active_subscriber in sync with the subscription status
CREATE OR REPLACE FUNCTION sync_institute_subscription_flag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE institutes
     SET is_active_subscriber = (NEW.status IN ('trialing', 'active', 'past_due')),
         subscription_status  = NEW.status,
         updated_at           = now()
   WHERE id = NEW.institute_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_sub_flag ON institute_subscriptions;
CREATE TRIGGER trg_sync_sub_flag
  AFTER INSERT OR UPDATE OF status ON institute_subscriptions
  FOR EACH ROW EXECUTE FUNCTION sync_institute_subscription_flag();

-- 6. Overview for the admin console (per-institute counts + status)
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
         (SELECT count(*) FROM canteens c WHERE c.institute_id = i.id),
         (SELECT count(*) FROM users u WHERE u.institute_id = i.id AND u.role = 'student')
    FROM institutes i
   ORDER BY i.name;
$$;

-- 7. Daily-cron helper: lapse subscriptions whose period ended (5-day grace).
--    The sync trigger then flips is_active_subscriber automatically.
CREATE OR REPLACE FUNCTION expire_due_subscriptions()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- active/trialing past period end → past_due
  UPDATE institute_subscriptions
     SET status = 'past_due', updated_at = now()
   WHERE status IN ('active', 'trialing')
     AND current_period_end IS NOT NULL
     AND current_period_end < now();

  -- past_due beyond the 5-day grace → expired
  UPDATE institute_subscriptions
     SET status = 'expired', updated_at = now()
   WHERE status = 'past_due'
     AND current_period_end IS NOT NULL
     AND current_period_end < (now() - interval '5 days');
END; $$;

-- 8. RLS (service-role API bypasses this; these are defense-in-depth)
ALTER TABLE subscription_plans        ENABLE ROW LEVEL SECURITY;
ALTER TABLE institute_subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_invoices     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plans_admin_read"        ON subscription_plans;
DROP POLICY IF EXISTS "subs_super_admin_all"    ON institute_subscriptions;
DROP POLICY IF EXISTS "subs_institute_read"     ON institute_subscriptions;
DROP POLICY IF EXISTS "invoices_super_admin_all" ON subscription_invoices;
DROP POLICY IF EXISTS "invoices_institute_read" ON subscription_invoices;

CREATE POLICY "plans_admin_read" ON subscription_plans
  FOR SELECT USING (current_user_role() IN ('super_admin', 'canteen_admin', 'staff'));

CREATE POLICY "subs_super_admin_all" ON institute_subscriptions
  FOR ALL USING (current_user_role() = 'super_admin')
  WITH CHECK (current_user_role() = 'super_admin');

-- Fix 5: add a role check. Previously these matched on institute_id with NO
-- role gate, so any STUDENT of the institute could read its subscription and
-- invoices (amounts, Razorpay order/payment IDs). Now only super_admin and the
-- institute's canteen_admin can read; students get nothing.
CREATE POLICY "subs_institute_read" ON institute_subscriptions
  FOR SELECT USING (
    current_user_role() IN ('super_admin', 'canteen_admin')
    AND institute_id = (SELECT institute_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "invoices_super_admin_all" ON subscription_invoices
  FOR ALL USING (current_user_role() = 'super_admin')
  WITH CHECK (current_user_role() = 'super_admin');

CREATE POLICY "invoices_institute_read" ON subscription_invoices
  FOR SELECT USING (
    current_user_role() IN ('super_admin', 'canteen_admin')
    AND institute_id = (SELECT institute_id FROM users WHERE id = auth.uid())
  );

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
