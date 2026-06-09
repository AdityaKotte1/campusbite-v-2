-- ============================================================
-- CampusBite — Row Level Security (RLS) Policies
-- Idempotent: safe to re-run at any time.
-- Run AFTER schema.sql.
-- ============================================================

-- Helper: current user's role
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

-- Helper: current user's assigned canteen ID
CREATE OR REPLACE FUNCTION current_user_canteen_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT assigned_canteen_id FROM public.users WHERE id = auth.uid();
$$;

-- ============================================================
-- 1. INSTITUTES
-- ============================================================
ALTER TABLE institutes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "institutes_public_read"      ON institutes;
DROP POLICY IF EXISTS "institutes_super_admin_all"  ON institutes;

CREATE POLICY "institutes_public_read"
  ON institutes FOR SELECT USING (is_active = true);

CREATE POLICY "institutes_super_admin_all"
  ON institutes FOR ALL
  USING (current_user_role() = 'super_admin')
  WITH CHECK (current_user_role() = 'super_admin');

-- ============================================================
-- 2. CANTEENS
-- ============================================================
ALTER TABLE canteens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "canteens_public_read"  ON canteens;
DROP POLICY IF EXISTS "canteens_admin_all"    ON canteens;

CREATE POLICY "canteens_public_read"
  ON canteens FOR SELECT USING (is_active = true);

CREATE POLICY "canteens_admin_all"
  ON canteens FOR ALL
  USING (current_user_role() IN ('super_admin', 'canteen_admin'))
  WITH CHECK (current_user_role() IN ('super_admin', 'canteen_admin'));

-- ============================================================
-- 3. CATEGORIES
-- ============================================================
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories_public_read"   ON categories;
DROP POLICY IF EXISTS "categories_staff_read"    ON categories;
DROP POLICY IF EXISTS "categories_admin_write"   ON categories;
DROP POLICY IF EXISTS "categories_admin_update"  ON categories;
DROP POLICY IF EXISTS "categories_admin_delete"  ON categories;

CREATE POLICY "categories_public_read"
  ON categories FOR SELECT USING (is_active = true);

CREATE POLICY "categories_staff_read"
  ON categories FOR SELECT
  USING (
    current_user_role() IN ('staff', 'canteen_admin', 'super_admin')
    AND (current_user_role() = 'super_admin' OR canteen_id = current_user_canteen_id())
  );

CREATE POLICY "categories_admin_write"
  ON categories FOR INSERT
  WITH CHECK (
    current_user_role() IN ('canteen_admin', 'super_admin')
    AND (current_user_role() = 'super_admin' OR canteen_id = current_user_canteen_id())
  );

CREATE POLICY "categories_admin_update"
  ON categories FOR UPDATE
  USING (
    current_user_role() IN ('canteen_admin', 'super_admin')
    AND (current_user_role() = 'super_admin' OR canteen_id = current_user_canteen_id())
  )
  WITH CHECK (current_user_role() IN ('canteen_admin', 'super_admin'));

CREATE POLICY "categories_admin_delete"
  ON categories FOR DELETE
  USING (
    current_user_role() IN ('canteen_admin', 'super_admin')
    AND (current_user_role() = 'super_admin' OR canteen_id = current_user_canteen_id())
  );

-- ============================================================
-- 4. MENU ITEMS
-- ============================================================
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "menu_items_public_read"   ON menu_items;
DROP POLICY IF EXISTS "menu_items_staff_read"    ON menu_items;
DROP POLICY IF EXISTS "menu_items_admin_insert"  ON menu_items;
DROP POLICY IF EXISTS "menu_items_admin_update"  ON menu_items;
DROP POLICY IF EXISTS "menu_items_staff_update"  ON menu_items;
DROP POLICY IF EXISTS "menu_items_admin_delete"  ON menu_items;

CREATE POLICY "menu_items_public_read"
  ON menu_items FOR SELECT USING (is_available = true);

CREATE POLICY "menu_items_staff_read"
  ON menu_items FOR SELECT
  USING (
    current_user_role() IN ('staff', 'canteen_admin', 'super_admin')
    AND (current_user_role() = 'super_admin' OR canteen_id = current_user_canteen_id())
  );

CREATE POLICY "menu_items_admin_insert"
  ON menu_items FOR INSERT
  WITH CHECK (
    current_user_role() IN ('canteen_admin', 'super_admin')
    AND (current_user_role() = 'super_admin' OR canteen_id = current_user_canteen_id())
  );

-- Staff can update availability and stock; admins can update everything
CREATE POLICY "menu_items_staff_update"
  ON menu_items FOR UPDATE
  USING (
    current_user_role() IN ('staff', 'canteen_admin', 'super_admin')
    AND (current_user_role() = 'super_admin' OR canteen_id = current_user_canteen_id())
  )
  WITH CHECK (
    current_user_role() IN ('staff', 'canteen_admin', 'super_admin')
  );

CREATE POLICY "menu_items_admin_delete"
  ON menu_items FOR DELETE
  USING (
    current_user_role() IN ('canteen_admin', 'super_admin')
    AND (current_user_role() = 'super_admin' OR canteen_id = current_user_canteen_id())
  );

-- ============================================================
-- 5. USERS
-- ============================================================
-- IMPORTANT: Do NOT add policies on this table that call current_user_role().
-- current_user_role() queries public.users → triggers these same policies → infinite recursion.
-- All admin operations on users use createServiceClient() (service role) which bypasses RLS.
-- Only safe policies here are ones using id = auth.uid() directly.
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_profile_read"    ON users;
DROP POLICY IF EXISTS "users_admin_read"          ON users;
DROP POLICY IF EXISTS "users_staff_read"          ON users;
DROP POLICY IF EXISTS "users_own_profile_update"  ON users;
DROP POLICY IF EXISTS "users_super_admin_update"  ON users;

-- Users can read their own row (used by middleware role check and student profile page)
CREATE POLICY "users_own_profile_read"
  ON users FOR SELECT
  USING (id = auth.uid());

-- Users can update their own profile (used by /api/v1/users/me PATCH)
CREATE POLICY "users_own_profile_update"
  ON users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admin reads/updates of OTHER users go through service role (bypasses RLS).
-- No additional policies needed here — they would cause infinite recursion.

-- ============================================================
-- 6. ADDRESSES
-- ============================================================
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "addresses_own_only"          ON addresses;
DROP POLICY IF EXISTS "addresses_super_admin_read"  ON addresses;

CREATE POLICY "addresses_own_only"
  ON addresses FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "addresses_super_admin_read"
  ON addresses FOR SELECT USING (current_user_role() = 'super_admin');

-- ============================================================
-- 7. ORDERS
-- ============================================================
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_own_read"              ON orders;
DROP POLICY IF EXISTS "orders_own_insert"            ON orders;
DROP POLICY IF EXISTS "orders_staff_canteen_read"    ON orders;
DROP POLICY IF EXISTS "orders_canteen_admin_update"  ON orders;
DROP POLICY IF EXISTS "orders_super_admin_all"       ON orders;

CREATE POLICY "orders_own_read"
  ON orders FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "orders_own_insert"
  ON orders FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "orders_staff_canteen_read"
  ON orders FOR SELECT
  USING (
    current_user_role() IN ('staff', 'canteen_admin')
    AND canteen_id = current_user_canteen_id()
  );

CREATE POLICY "orders_canteen_admin_update"
  ON orders FOR UPDATE
  USING (
    current_user_role() IN ('canteen_admin', 'staff')
    AND canteen_id = current_user_canteen_id()
  )
  WITH CHECK (current_user_role() IN ('canteen_admin', 'staff'));

CREATE POLICY "orders_super_admin_all"
  ON orders FOR ALL
  USING (current_user_role() = 'super_admin')
  WITH CHECK (current_user_role() = 'super_admin');

-- ============================================================
-- 8. ORDER ITEMS
-- ============================================================
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_items_own_read"        ON order_items;
DROP POLICY IF EXISTS "order_items_own_insert"      ON order_items;
DROP POLICY IF EXISTS "order_items_staff_read"      ON order_items;
DROP POLICY IF EXISTS "order_items_super_admin_read" ON order_items;

CREATE POLICY "order_items_own_read"
  ON order_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid()
  ));

CREATE POLICY "order_items_own_insert"
  ON order_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid()
  ));

CREATE POLICY "order_items_staff_read"
  ON order_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM orders
    WHERE orders.id = order_items.order_id
      AND orders.canteen_id = current_user_canteen_id()
      AND current_user_role() IN ('staff', 'canteen_admin')
  ));

CREATE POLICY "order_items_super_admin_read"
  ON order_items FOR SELECT USING (current_user_role() = 'super_admin');

-- ============================================================
-- 9. QR TOKENS
-- ============================================================
ALTER TABLE qr_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qr_tokens_own_read"       ON qr_tokens;
DROP POLICY IF EXISTS "qr_tokens_own_insert"     ON qr_tokens;
DROP POLICY IF EXISTS "qr_tokens_staff_read"     ON qr_tokens;
DROP POLICY IF EXISTS "qr_tokens_super_admin_all" ON qr_tokens;

CREATE POLICY "qr_tokens_own_read"
  ON qr_tokens FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM orders WHERE orders.id = qr_tokens.order_id AND orders.user_id = auth.uid()
  ));

CREATE POLICY "qr_tokens_own_insert"
  ON qr_tokens FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM orders WHERE orders.id = qr_tokens.order_id AND orders.user_id = auth.uid()
  ));

CREATE POLICY "qr_tokens_staff_read"
  ON qr_tokens FOR SELECT
  USING (
    current_user_role() IN ('staff', 'canteen_admin')
    AND EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = qr_tokens.order_id AND orders.canteen_id = current_user_canteen_id()
    )
  );

CREATE POLICY "qr_tokens_super_admin_all"
  ON qr_tokens FOR ALL
  USING (current_user_role() = 'super_admin')
  WITH CHECK (current_user_role() = 'super_admin');

-- ============================================================
-- 10. KIOSKS
-- ============================================================
ALTER TABLE kiosks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kiosks_admin_read"         ON kiosks;
DROP POLICY IF EXISTS "kiosks_super_admin_write"  ON kiosks;
DROP POLICY IF EXISTS "kiosks_admin_update"       ON kiosks;
DROP POLICY IF EXISTS "kiosks_super_admin_delete" ON kiosks;

CREATE POLICY "kiosks_admin_read"
  ON kiosks FOR SELECT
  USING (
    current_user_role() = 'super_admin'
    OR (current_user_role() = 'canteen_admin' AND canteen_id = current_user_canteen_id())
  );

CREATE POLICY "kiosks_super_admin_write"
  ON kiosks FOR INSERT WITH CHECK (current_user_role() = 'super_admin');

CREATE POLICY "kiosks_admin_update"
  ON kiosks FOR UPDATE
  USING (
    current_user_role() = 'super_admin'
    OR (current_user_role() = 'canteen_admin' AND canteen_id = current_user_canteen_id())
  )
  WITH CHECK (current_user_role() IN ('super_admin', 'canteen_admin'));

CREATE POLICY "kiosks_super_admin_delete"
  ON kiosks FOR DELETE USING (current_user_role() = 'super_admin');

-- ============================================================
-- 11. KIOSK SCANS
-- ============================================================
ALTER TABLE kiosk_scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kiosk_scans_admin_read" ON kiosk_scans;

CREATE POLICY "kiosk_scans_admin_read"
  ON kiosk_scans FOR SELECT
  USING (
    current_user_role() = 'super_admin'
    OR (
      current_user_role() = 'canteen_admin'
      AND EXISTS (
        SELECT 1 FROM kiosks
        WHERE kiosks.id = kiosk_scans.kiosk_id AND kiosks.canteen_id = current_user_canteen_id()
      )
    )
  );

-- ============================================================
-- 12. DAILY TOKENS
-- ============================================================
ALTER TABLE daily_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_tokens_staff_read" ON daily_tokens;
DROP POLICY IF EXISTS "daily_tokens_own_read"   ON daily_tokens;

CREATE POLICY "daily_tokens_staff_read"
  ON daily_tokens FOR SELECT
  USING (
    current_user_role() IN ('staff', 'canteen_admin', 'super_admin')
    AND (current_user_role() = 'super_admin' OR canteen_id = current_user_canteen_id())
  );

CREATE POLICY "daily_tokens_own_read"
  ON daily_tokens FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM orders WHERE orders.id = daily_tokens.order_id AND orders.user_id = auth.uid()
  ));

-- ============================================================
-- 13. KIOSK OFFLINE QUEUE
-- ============================================================
ALTER TABLE kiosk_offline_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kiosk_offline_queue_admin_read" ON kiosk_offline_queue;

CREATE POLICY "kiosk_offline_queue_admin_read"
  ON kiosk_offline_queue FOR SELECT
  USING (
    current_user_role() = 'super_admin'
    OR (
      current_user_role() = 'canteen_admin'
      AND EXISTS (
        SELECT 1 FROM kiosks
        WHERE kiosks.id = kiosk_offline_queue.kiosk_id AND kiosks.canteen_id = current_user_canteen_id()
      )
    )
  );

-- ============================================================
-- 14. STAFF
-- ============================================================
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_own_read"    ON staff;
DROP POLICY IF EXISTS "staff_admin_read"  ON staff;
DROP POLICY IF EXISTS "staff_admin_write" ON staff;
DROP POLICY IF EXISTS "staff_admin_update" ON staff;
DROP POLICY IF EXISTS "staff_admin_delete" ON staff;

CREATE POLICY "staff_own_read"
  ON staff FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "staff_admin_read"
  ON staff FOR SELECT
  USING (
    current_user_role() = 'super_admin'
    OR (current_user_role() = 'canteen_admin' AND canteen_id = current_user_canteen_id())
  );

CREATE POLICY "staff_admin_write"
  ON staff FOR INSERT
  WITH CHECK (current_user_role() IN ('super_admin', 'canteen_admin'));

CREATE POLICY "staff_admin_update"
  ON staff FOR UPDATE
  USING (
    current_user_role() = 'super_admin'
    OR (current_user_role() = 'canteen_admin' AND canteen_id = current_user_canteen_id())
  )
  WITH CHECK (current_user_role() IN ('super_admin', 'canteen_admin'));

CREATE POLICY "staff_admin_delete"
  ON staff FOR DELETE
  USING (
    current_user_role() = 'super_admin'
    OR (current_user_role() = 'canteen_admin' AND canteen_id = current_user_canteen_id())
  );

-- ============================================================
-- 15. COUPONS
-- ============================================================
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coupons_public_read_active" ON coupons;
DROP POLICY IF EXISTS "coupons_admin_read_all"     ON coupons;
DROP POLICY IF EXISTS "coupons_admin_write"        ON coupons;
DROP POLICY IF EXISTS "coupons_admin_update"       ON coupons;
DROP POLICY IF EXISTS "coupons_admin_delete"       ON coupons;

CREATE POLICY "coupons_public_read_active"
  ON coupons FOR SELECT
  USING (is_active = true AND valid_from <= NOW() AND (valid_until IS NULL OR valid_until >= NOW()));

CREATE POLICY "coupons_admin_read_all"
  ON coupons FOR SELECT
  USING (current_user_role() IN ('canteen_admin', 'super_admin'));

CREATE POLICY "coupons_admin_write"
  ON coupons FOR INSERT
  WITH CHECK (current_user_role() IN ('canteen_admin', 'super_admin'));

CREATE POLICY "coupons_admin_update"
  ON coupons FOR UPDATE
  USING (
    current_user_role() = 'super_admin'
    OR (current_user_role() = 'canteen_admin'
        AND (canteen_id = current_user_canteen_id() OR canteen_id IS NULL))
  )
  WITH CHECK (current_user_role() IN ('super_admin', 'canteen_admin'));

CREATE POLICY "coupons_admin_delete"
  ON coupons FOR DELETE
  USING (
    current_user_role() = 'super_admin'
    OR (current_user_role() = 'canteen_admin' AND canteen_id = current_user_canteen_id())
  );

-- ============================================================
-- 16. USER COUPONS
-- ============================================================
ALTER TABLE user_coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_coupons_own_read"   ON user_coupons;
DROP POLICY IF EXISTS "user_coupons_admin_read" ON user_coupons;

CREATE POLICY "user_coupons_own_read"
  ON user_coupons FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_coupons_admin_read"
  ON user_coupons FOR SELECT
  USING (current_user_role() IN ('canteen_admin', 'super_admin'));

-- ============================================================
-- 17. FAVORITES
-- ============================================================
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "favorites_own_all" ON favorites;

CREATE POLICY "favorites_own_all"
  ON favorites FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 18. REVIEWS
-- ============================================================
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reviews_approved_read" ON reviews;
DROP POLICY IF EXISTS "reviews_own_read"      ON reviews;
DROP POLICY IF EXISTS "reviews_own_insert"    ON reviews;
DROP POLICY IF EXISTS "reviews_own_update"    ON reviews;
DROP POLICY IF EXISTS "reviews_admin_all"     ON reviews;

CREATE POLICY "reviews_approved_read"
  ON reviews FOR SELECT USING (is_approved = true);

CREATE POLICY "reviews_own_read"
  ON reviews FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "reviews_own_insert"
  ON reviews FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "reviews_own_update"
  ON reviews FOR UPDATE
  USING (user_id = auth.uid() AND is_approved = false)
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "reviews_admin_all"
  ON reviews FOR ALL
  USING (
    current_user_role() = 'super_admin'
    OR (current_user_role() = 'canteen_admin' AND canteen_id = current_user_canteen_id())
  )
  WITH CHECK (current_user_role() IN ('super_admin', 'canteen_admin'));

-- ============================================================
-- 19. LOYALTY POINTS
-- ============================================================
ALTER TABLE loyalty_points ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loyalty_points_own_read"   ON loyalty_points;
DROP POLICY IF EXISTS "loyalty_points_admin_read" ON loyalty_points;

CREATE POLICY "loyalty_points_own_read"
  ON loyalty_points FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "loyalty_points_admin_read"
  ON loyalty_points FOR SELECT
  USING (current_user_role() IN ('canteen_admin', 'super_admin'));

-- ============================================================
-- 20. AUDIT LOGS
-- ============================================================
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_own_read"           ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_super_admin_read"   ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_canteen_admin_read" ON audit_logs;

CREATE POLICY "audit_logs_own_read"
  ON audit_logs FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "audit_logs_super_admin_read"
  ON audit_logs FOR SELECT USING (current_user_role() = 'super_admin');

-- Canteen admins see logs for their own canteen's entities
CREATE POLICY "audit_logs_canteen_admin_read"
  ON audit_logs FOR SELECT
  USING (
    current_user_role() = 'canteen_admin'
    AND resource_type IN ('order', 'menu_item', 'category', 'review', 'coupon', 'staff', 'kiosk')
  );

-- ============================================================
-- 21. NOTIFICATIONS
-- ============================================================
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_own_all" ON notifications;

CREATE POLICY "notifications_own_all"
  ON notifications FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 22. PAYMENT TRANSACTIONS
-- ============================================================
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_transactions_own_read"         ON payment_transactions;
DROP POLICY IF EXISTS "payment_transactions_own_insert"       ON payment_transactions;
DROP POLICY IF EXISTS "payment_transactions_admin_read"       ON payment_transactions;
DROP POLICY IF EXISTS "payment_transactions_super_admin_update" ON payment_transactions;

CREATE POLICY "payment_transactions_own_read"
  ON payment_transactions FOR SELECT USING (user_id = auth.uid());

-- SECURITY: insert only for orders that belong to this user
CREATE POLICY "payment_transactions_own_insert"
  ON payment_transactions FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = payment_transactions.order_id AND orders.user_id = auth.uid()
    )
  );

CREATE POLICY "payment_transactions_admin_read"
  ON payment_transactions FOR SELECT
  USING (
    current_user_role() = 'super_admin'
    OR (
      current_user_role() = 'canteen_admin'
      AND EXISTS (
        SELECT 1 FROM orders
        WHERE orders.id = payment_transactions.order_id
          AND orders.canteen_id = current_user_canteen_id()
      )
    )
  );

CREATE POLICY "payment_transactions_super_admin_update"
  ON payment_transactions FOR UPDATE
  USING (current_user_role() = 'super_admin')
  WITH CHECK (current_user_role() = 'super_admin');
