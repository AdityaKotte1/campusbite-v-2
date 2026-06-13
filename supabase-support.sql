-- ════════════════════════════════════════════════════════════════════════
-- MunchAdda — Support tickets
-- Run in the Supabase SQL editor.
-- ════════════════════════════════════════════════════════════════════════
-- SECURITY HARDENING (Fix 3): the old "support_admin_all" policy let ANY
-- super_admin/canteen_admin/staff read & edit EVERY tenant's tickets (PII).
-- It is now tenant-scoped: super_admin sees all; canteen_admin/staff only see
-- tickets whose owner belongs to the SAME institute as the caller. See also
-- security-hardening.sql.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS support_tickets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  email         text,
  name          text,
  category      text NOT NULL DEFAULT 'other',   -- order|payment|refund|account|other
  order_number  text,
  subject       text NOT NULL,
  message       text NOT NULL,
  status        text NOT NULL DEFAULT 'open',     -- open|in_progress|resolved|closed
  admin_response text,
  responded_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_user   ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_status ON support_tickets(status);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_own_read"   ON support_tickets;
DROP POLICY IF EXISTS "support_own_insert" ON support_tickets;
DROP POLICY IF EXISTS "support_admin_all"  ON support_tickets;

-- Users read + create their own tickets
CREATE POLICY "support_own_read" ON support_tickets
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "support_own_insert" ON support_tickets
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Fix 3: tenant-scoping helpers (SECURITY DEFINER so they bypass the users-table
-- RLS, which only exposes the caller's own row). Idempotent — also defined in
-- rls.sql / security-hardening.sql.
CREATE OR REPLACE FUNCTION public.current_user_institute_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT institute_id FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.user_institute_id(p_user_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT institute_id FROM public.users WHERE id = p_user_id;
$$;

-- Admins manage tickets, tenant-scoped:
--   super_admin            → all tickets
--   canteen_admin / staff  → only tickets whose owner is in the SAME institute.
-- (Tickets with NULL user_id, or an owner with NULL institute_id, are visible to
--  super_admin only — the safe default.)
CREATE POLICY "support_admin_all" ON support_tickets
  FOR ALL USING (
    current_user_role() = 'super_admin'
    OR (
      current_user_role() IN ('canteen_admin', 'staff')
      AND support_tickets.user_id IS NOT NULL
      AND public.current_user_institute_id() IS NOT NULL
      AND public.user_institute_id(support_tickets.user_id) = public.current_user_institute_id()
    )
  )
  WITH CHECK (
    current_user_role() = 'super_admin'
    OR (
      current_user_role() IN ('canteen_admin', 'staff')
      AND support_tickets.user_id IS NOT NULL
      AND public.current_user_institute_id() IS NOT NULL
      AND public.user_institute_id(support_tickets.user_id) = public.current_user_institute_id()
    )
  );

NOTIFY pgrst, 'reload schema';
