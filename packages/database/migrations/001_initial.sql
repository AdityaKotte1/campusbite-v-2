-- ============================================================
-- MunchAdda — Migration 001: Initial Schema
-- This migration runs the full initial setup in a single
-- transaction: schema → RLS → functions.
--
-- HOW TO RUN:
--   Option A (recommended): Copy this entire file into the
--     Supabase SQL Editor and click "Run".
--   Option B: Run via supabase CLI:
--     supabase db push (if using local dev)
--     supabase db execute --file migrations/001_initial.sql
--
-- IDEMPOTENCY:
--   All statements use IF NOT EXISTS / OR REPLACE / ON CONFLICT
--   so this migration is safe to re-run if it partially failed.
-- ============================================================

BEGIN;

-- ============================================================
-- PART 1: SCHEMA
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---- institutes ----
CREATE TABLE IF NOT EXISTS institutes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  short_name  TEXT NOT NULL,
  logo_url    TEXT,
  address     TEXT,
  city        TEXT NOT NULL,
  state       TEXT NOT NULL,
  pincode     VARCHAR(10),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_institutes_is_active ON institutes(is_active);

-- ---- canteens ----
CREATE TABLE IF NOT EXISTS canteens (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id      UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  description       TEXT,
  image_url         TEXT,
  phone             VARCHAR(20),
  email             TEXT,
  opening_time      TIME,
  closing_time      TIME,
  is_open           BOOLEAN NOT NULL DEFAULT true,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  prep_time_minutes INTEGER NOT NULL DEFAULT 15 CHECK (prep_time_minutes >= 0),
  tax_percentage    NUMERIC(5,2) NOT NULL DEFAULT 5.00 CHECK (tax_percentage >= 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_canteens_institute_id ON canteens(institute_id);
CREATE INDEX IF NOT EXISTS idx_canteens_is_active    ON canteens(is_active);

-- ---- categories ----
CREATE TABLE IF NOT EXISTS categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canteen_id  UUID NOT NULL REFERENCES canteens(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  image_url   TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_categories_canteen_id ON categories(canteen_id);
CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON categories(canteen_id, sort_order);

-- ---- menu_items ----
CREATE TABLE IF NOT EXISTS menu_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canteen_id           UUID NOT NULL REFERENCES canteens(id) ON DELETE CASCADE,
  category_id          UUID NOT NULL REFERENCES categories(id) ON DELETE SET NULL,
  name                 TEXT NOT NULL,
  description          TEXT,
  price_paise          INTEGER NOT NULL CHECK (price_paise > 0),
  original_price_paise INTEGER CHECK (original_price_paise > 0),
  images               JSONB NOT NULL DEFAULT '[]'::JSONB,
  allergens            TEXT[] NOT NULL DEFAULT '{}',
  is_vegetarian        BOOLEAN NOT NULL DEFAULT false,
  is_vegan             BOOLEAN NOT NULL DEFAULT false,
  is_available         BOOLEAN NOT NULL DEFAULT true,
  is_featured          BOOLEAN NOT NULL DEFAULT false,
  prep_time_minutes    INTEGER CHECK (prep_time_minutes >= 0),
  nutritional_info     JSONB,
  sort_order           INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_menu_items_canteen_id   ON menu_items(canteen_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_category_id  ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_is_available ON menu_items(canteen_id, is_available);
CREATE INDEX IF NOT EXISTS idx_menu_items_is_featured  ON menu_items(canteen_id, is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_menu_items_sort_order   ON menu_items(canteen_id, sort_order);

-- ---- users ----
CREATE TABLE IF NOT EXISTS users (
  id                     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                  TEXT NOT NULL UNIQUE,
  full_name              TEXT NOT NULL,
  phone                  VARCHAR(20),
  avatar_url             TEXT,
  role                   VARCHAR(50) NOT NULL DEFAULT 'student'
                           CHECK (role IN ('student','staff','canteen_admin','super_admin')),
  institute_id           UUID REFERENCES institutes(id) ON DELETE SET NULL,
  assigned_canteen_id    UUID REFERENCES canteens(id) ON DELETE SET NULL,
  is_active              BOOLEAN NOT NULL DEFAULT true,
  is_email_verified      BOOLEAN NOT NULL DEFAULT false,
  loyalty_points_balance INTEGER NOT NULL DEFAULT 0 CHECK (loyalty_points_balance >= 0),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email               ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role                ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_institute_id        ON users(institute_id);
CREATE INDEX IF NOT EXISTS idx_users_assigned_canteen_id ON users(assigned_canteen_id);

-- ---- addresses ----
CREATE TABLE IF NOT EXISTS addresses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  line1       TEXT NOT NULL,
  line2       TEXT,
  city        TEXT NOT NULL,
  state       TEXT NOT NULL,
  pincode     VARCHAR(10) NOT NULL,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);

-- ---- orders ----
CREATE TABLE IF NOT EXISTS orders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number         TEXT NOT NULL UNIQUE,
  user_id              UUID NOT NULL REFERENCES users(id),
  canteen_id           UUID NOT NULL REFERENCES canteens(id),
  status               VARCHAR(30) NOT NULL DEFAULT 'payment_pending',
  payment_status       VARCHAR(30) NOT NULL DEFAULT 'pending'
                         CHECK (payment_status IN ('pending','paid','failed','refunded','partially_refunded')),
  delivery_type        VARCHAR(20) NOT NULL DEFAULT 'pickup'
                         CHECK (delivery_type IN ('pickup','table_delivery')),
  subtotal_paise       INTEGER NOT NULL CHECK (subtotal_paise >= 0),
  tax_paise            INTEGER NOT NULL DEFAULT 0 CHECK (tax_paise >= 0),
  discount_paise       INTEGER NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
  total_paise          INTEGER NOT NULL CHECK (total_paise >= 0),
  special_instructions TEXT,
  coupon_id            UUID,
  coupon_code          TEXT,
  estimated_ready_at   TIMESTAMPTZ,
  confirmed_at         TIMESTAMPTZ,
  preparing_at         TIMESTAMPTZ,
  ready_at             TIMESTAMPTZ,
  collected_at         TIMESTAMPTZ,
  cancelled_at         TIMESTAMPTZ,
  cancellation_reason  TEXT,
  refunded_at          TIMESTAMPTZ,
  refund_amount_paise  INTEGER CHECK (refund_amount_paise >= 0),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_user_id        ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_canteen_id     ON orders(canteen_id);
CREATE INDEX IF NOT EXISTS idx_orders_status         ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at     ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_canteen_status ON orders(canteen_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_order_number   ON orders(order_number);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_status_valid'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_status_valid CHECK (status IN (
      'payment_pending','payment_failed','confirmed','preparing',
      'ready','collected','cancelled','refunded'
    ));
  END IF;
END;
$$;

-- ---- order_items ----
CREATE TABLE IF NOT EXISTS order_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id        UUID REFERENCES menu_items(id) ON DELETE SET NULL,
  menu_item_name      TEXT NOT NULL,
  menu_item_image_url TEXT,
  quantity            INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_paise    INTEGER NOT NULL CHECK (unit_price_paise > 0),
  total_price_paise   INTEGER NOT NULL CHECK (total_price_paise > 0),
  customization_notes TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id     ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item_id ON order_items(menu_item_id);

-- ---- kiosks ----
CREATE TABLE IF NOT EXISTS kiosks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canteen_id        UUID NOT NULL REFERENCES canteens(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  device_id         TEXT NOT NULL UNIQUE,
  api_key_encrypted TEXT NOT NULL,
  last_heartbeat    TIMESTAMPTZ,
  printer_config    JSONB,
  offline_mode      BOOLEAN NOT NULL DEFAULT false,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kiosks_canteen_id ON kiosks(canteen_id);
CREATE INDEX IF NOT EXISTS idx_kiosks_device_id  ON kiosks(device_id);

-- ---- qr_tokens ----
CREATE TABLE IF NOT EXISTS qr_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  token         UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  status        VARCHAR(20) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','used','expired','revoked')),
  kiosk_id      UUID REFERENCES kiosks(id) ON DELETE SET NULL,
  scan_metadata JSONB,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  version       INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qr_tokens_order_id   ON qr_tokens(order_id);
CREATE INDEX IF NOT EXISTS idx_qr_tokens_token      ON qr_tokens(token);
CREATE INDEX IF NOT EXISTS idx_qr_tokens_status     ON qr_tokens(status);
CREATE INDEX IF NOT EXISTS idx_qr_tokens_expires_at ON qr_tokens(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_tokens_active_order
  ON qr_tokens(order_id) WHERE status = 'active';

-- ---- kiosk_scans ----
CREATE TABLE IF NOT EXISTS kiosk_scans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosk_id        UUID NOT NULL REFERENCES kiosks(id) ON DELETE CASCADE,
  qr_token_id     UUID REFERENCES qr_tokens(id) ON DELETE SET NULL,
  raw_token_value TEXT NOT NULL,
  scan_result     VARCHAR(30) NOT NULL
                    CHECK (scan_result IN (
                      'success','already_used','expired',
                      'revoked','invalid_token','network_error'
                    )),
  print_attempted BOOLEAN NOT NULL DEFAULT false,
  print_success   BOOLEAN,
  offline_scan    BOOLEAN NOT NULL DEFAULT false,
  synced_at       TIMESTAMPTZ,
  scanned_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kiosk_scans_kiosk_id    ON kiosk_scans(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_kiosk_scans_qr_token_id ON kiosk_scans(qr_token_id);
CREATE INDEX IF NOT EXISTS idx_kiosk_scans_scanned_at  ON kiosk_scans(scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_kiosk_scans_scan_result ON kiosk_scans(scan_result);

-- ---- daily_tokens ----
CREATE TABLE IF NOT EXISTS daily_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canteen_id   UUID NOT NULL REFERENCES canteens(id) ON DELETE CASCADE,
  order_id     UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  token_number INTEGER NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (canteen_id, date, token_number)
);
CREATE INDEX IF NOT EXISTS idx_daily_tokens_canteen_date ON daily_tokens(canteen_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_tokens_order_id     ON daily_tokens(order_id);

-- ---- kiosk_offline_queue ----
CREATE TABLE IF NOT EXISTS kiosk_offline_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosk_id        UUID NOT NULL REFERENCES kiosks(id) ON DELETE CASCADE,
  raw_token_value TEXT NOT NULL,
  scanned_at      TIMESTAMPTZ NOT NULL,
  synced          BOOLEAN NOT NULL DEFAULT false,
  synced_at       TIMESTAMPTZ,
  sync_result     JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kiosk_offline_queue_kiosk_id ON kiosk_offline_queue(kiosk_id);
CREATE INDEX IF NOT EXISTS idx_kiosk_offline_queue_synced
  ON kiosk_offline_queue(kiosk_id, synced) WHERE synced = false;

-- ---- staff ----
CREATE TABLE IF NOT EXISTS staff (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  canteen_id  UUID NOT NULL REFERENCES canteens(id) ON DELETE CASCADE,
  employee_id TEXT,
  designation TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_staff_canteen_id ON staff(canteen_id);
CREATE INDEX IF NOT EXISTS idx_staff_user_id    ON staff(user_id);

-- ---- coupons ----
CREATE TABLE IF NOT EXISTS coupons (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canteen_id         UUID REFERENCES canteens(id) ON DELETE CASCADE,
  code               TEXT NOT NULL UNIQUE,
  description        TEXT,
  discount_type      VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage','flat')),
  discount_value     NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
  min_order_paise    INTEGER CHECK (min_order_paise >= 0),
  max_discount_paise INTEGER CHECK (max_discount_paise >= 0),
  usage_limit        INTEGER CHECK (usage_limit > 0),
  used_count         INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  per_user_limit     INTEGER NOT NULL DEFAULT 1 CHECK (per_user_limit > 0),
  valid_from         TIMESTAMPTZ NOT NULL,
  valid_until        TIMESTAMPTZ,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coupons_code       ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_canteen_id ON coupons(canteen_id);
CREATE INDEX IF NOT EXISTS idx_coupons_is_active  ON coupons(is_active, valid_from, valid_until);

-- ---- user_coupons ----
CREATE TABLE IF NOT EXISTS user_coupons (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coupon_id              UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  order_id               UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  discount_applied_paise INTEGER NOT NULL CHECK (discount_applied_paise >= 0),
  used_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_coupons_user_id   ON user_coupons(user_id);
CREATE INDEX IF NOT EXISTS idx_user_coupons_coupon_id ON user_coupons(coupon_id);

-- ---- favorites ----
CREATE TABLE IF NOT EXISTS favorites (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, menu_item_id)
);
CREATE INDEX IF NOT EXISTS idx_favorites_user_id      ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_menu_item_id ON favorites(menu_item_id);

-- ---- reviews ----
CREATE TABLE IF NOT EXISTS reviews (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id             UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  canteen_id           UUID NOT NULL REFERENCES canteens(id) ON DELETE CASCADE,
  menu_item_id         UUID REFERENCES menu_items(id) ON DELETE SET NULL,
  rating               SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title                TEXT,
  body                 TEXT,
  is_verified_purchase BOOLEAN NOT NULL DEFAULT false,
  is_approved          BOOLEAN NOT NULL DEFAULT false,
  approved_at          TIMESTAMPTZ,
  approved_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reviews_canteen_id   ON reviews(canteen_id, is_approved);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id      ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_menu_item_id ON reviews(menu_item_id, is_approved);
CREATE INDEX IF NOT EXISTS idx_reviews_order_id     ON reviews(order_id);

-- ---- loyalty_points ----
CREATE TABLE IF NOT EXISTS loyalty_points (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id         UUID REFERENCES orders(id) ON DELETE SET NULL,
  transaction_type VARCHAR(30) NOT NULL
                     CHECK (transaction_type IN (
                       'earned_order','redeemed_order','bonus','expiry','adjustment'
                     )),
  points           INTEGER NOT NULL,
  balance_after    INTEGER NOT NULL CHECK (balance_after >= 0),
  description      TEXT,
  expires_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_points_user_id  ON loyalty_points(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_points_order_id ON loyalty_points(order_id);

-- ---- audit_logs ----
CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  action        VARCHAR(30) NOT NULL
                  CHECK (action IN ('create','update','delete','login','logout','view','export')),
  resource_type TEXT NOT NULL,
  resource_id   UUID,
  old_values    JSONB,
  new_values    JSONB,
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id    ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource   ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action     ON audit_logs(action);

-- ---- notifications ----
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  data        JSONB,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id    ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(user_id, created_at DESC);

-- ---- payment_transactions ----
CREATE TABLE IF NOT EXISTS payment_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES users(id),
  gateway               VARCHAR(30) NOT NULL DEFAULT 'razorpay'
                          CHECK (gateway IN ('razorpay','manual','wallet')),
  gateway_order_id      TEXT,
  gateway_payment_id    TEXT,
  gateway_signature     TEXT,
  amount_paise          INTEGER NOT NULL CHECK (amount_paise > 0),
  currency              VARCHAR(5) NOT NULL DEFAULT 'INR',
  status                VARCHAR(30) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','paid','failed','refunded','partially_refunded')),
  failure_reason        TEXT,
  refund_id             TEXT,
  refund_amount_paise   INTEGER CHECK (refund_amount_paise >= 0),
  refunded_at           TIMESTAMPTZ,
  raw_response          JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_order_id           ON payment_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id            ON payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_gateway_order_id   ON payment_transactions(gateway_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_gateway_payment_id ON payment_transactions(gateway_payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status             ON payment_transactions(status);


-- ============================================================
-- PART 2: RLS
-- ============================================================

-- Helper functions
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION current_user_canteen_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT assigned_canteen_id FROM public.users WHERE id = auth.uid();
$$;

-- Enable RLS on all tables
ALTER TABLE institutes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE canteens              ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories            ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders                ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_tokens             ENABLE ROW LEVEL SECURITY;
ALTER TABLE kiosks                ENABLE ROW LEVEL SECURITY;
ALTER TABLE kiosk_scans           ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_tokens          ENABLE ROW LEVEL SECURITY;
ALTER TABLE kiosk_offline_queue   ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons               ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_coupons          ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites             ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews               ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_points        ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions  ENABLE ROW LEVEL SECURITY;

-- institutes
CREATE POLICY "institutes_public_read"    ON institutes FOR SELECT USING (is_active = true);
CREATE POLICY "institutes_super_admin_all" ON institutes FOR ALL
  USING (current_user_role() = 'super_admin') WITH CHECK (current_user_role() = 'super_admin');

-- canteens
CREATE POLICY "canteens_public_read" ON canteens FOR SELECT USING (is_active = true);
CREATE POLICY "canteens_admin_all"   ON canteens FOR ALL
  USING (current_user_role() IN ('super_admin','canteen_admin'))
  WITH CHECK (current_user_role() IN ('super_admin','canteen_admin'));

-- categories
CREATE POLICY "categories_public_read" ON categories FOR SELECT USING (is_active = true);
CREATE POLICY "categories_admin_write" ON categories FOR INSERT
  WITH CHECK (current_user_role() IN ('canteen_admin','super_admin'));
CREATE POLICY "categories_admin_update" ON categories FOR UPDATE
  USING (current_user_role() IN ('canteen_admin','super_admin'))
  WITH CHECK (current_user_role() IN ('canteen_admin','super_admin'));
CREATE POLICY "categories_admin_delete" ON categories FOR DELETE
  USING (current_user_role() IN ('canteen_admin','super_admin'));

-- menu_items
CREATE POLICY "menu_items_public_read" ON menu_items FOR SELECT USING (is_available = true);
CREATE POLICY "menu_items_staff_read"  ON menu_items FOR SELECT
  USING (current_user_role() IN ('staff','canteen_admin','super_admin'));
CREATE POLICY "menu_items_admin_insert" ON menu_items FOR INSERT
  WITH CHECK (current_user_role() IN ('canteen_admin','super_admin'));
CREATE POLICY "menu_items_admin_update" ON menu_items FOR UPDATE
  USING (current_user_role() IN ('canteen_admin','super_admin'))
  WITH CHECK (current_user_role() IN ('canteen_admin','super_admin'));
CREATE POLICY "menu_items_admin_delete" ON menu_items FOR DELETE
  USING (current_user_role() IN ('canteen_admin','super_admin'));

-- users
-- NOTE: Only id = auth.uid() policies here. current_user_role() queries users → infinite recursion.
-- Admin user operations use service role (bypasses RLS entirely).
CREATE POLICY "users_own_profile_read"   ON users FOR SELECT USING (id = auth.uid());
CREATE POLICY "users_own_profile_update" ON users FOR UPDATE
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- addresses
CREATE POLICY "addresses_own_only"         ON addresses FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "addresses_super_admin_read" ON addresses FOR SELECT
  USING (current_user_role() = 'super_admin');

-- orders
CREATE POLICY "orders_own_read"            ON orders FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "orders_own_insert"          ON orders FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "orders_staff_canteen_read"  ON orders FOR SELECT
  USING (current_user_role() IN ('staff','canteen_admin') AND canteen_id = current_user_canteen_id());
CREATE POLICY "orders_canteen_admin_update" ON orders FOR UPDATE
  USING (current_user_role() IN ('canteen_admin','staff') AND canteen_id = current_user_canteen_id())
  WITH CHECK (current_user_role() IN ('canteen_admin','staff'));
CREATE POLICY "orders_super_admin_all"     ON orders FOR ALL
  USING (current_user_role() = 'super_admin') WITH CHECK (current_user_role() = 'super_admin');

-- order_items
CREATE POLICY "order_items_own_read" ON order_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid()));
CREATE POLICY "order_items_own_insert" ON order_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid()));
CREATE POLICY "order_items_staff_read" ON order_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.canteen_id = current_user_canteen_id() AND current_user_role() IN ('staff','canteen_admin')));
CREATE POLICY "order_items_super_admin_read" ON order_items FOR SELECT
  USING (current_user_role() = 'super_admin');

-- qr_tokens
CREATE POLICY "qr_tokens_own_read" ON qr_tokens FOR SELECT
  USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = qr_tokens.order_id AND orders.user_id = auth.uid()));
CREATE POLICY "qr_tokens_own_insert" ON qr_tokens FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM orders WHERE orders.id = qr_tokens.order_id AND orders.user_id = auth.uid()));
CREATE POLICY "qr_tokens_staff_read" ON qr_tokens FOR SELECT
  USING (current_user_role() IN ('staff','canteen_admin') AND EXISTS (SELECT 1 FROM orders WHERE orders.id = qr_tokens.order_id AND orders.canteen_id = current_user_canteen_id()));
CREATE POLICY "qr_tokens_super_admin_all" ON qr_tokens FOR ALL
  USING (current_user_role() = 'super_admin') WITH CHECK (current_user_role() = 'super_admin');

-- kiosks
CREATE POLICY "kiosks_admin_read" ON kiosks FOR SELECT
  USING (current_user_role() = 'super_admin' OR (current_user_role() = 'canteen_admin' AND canteen_id = current_user_canteen_id()));
CREATE POLICY "kiosks_super_admin_write"  ON kiosks FOR INSERT WITH CHECK (current_user_role() = 'super_admin');
CREATE POLICY "kiosks_admin_update" ON kiosks FOR UPDATE
  USING (current_user_role() IN ('super_admin','canteen_admin'))
  WITH CHECK (current_user_role() IN ('super_admin','canteen_admin'));
CREATE POLICY "kiosks_super_admin_delete" ON kiosks FOR DELETE USING (current_user_role() = 'super_admin');

-- kiosk_scans (service role for inserts)
CREATE POLICY "kiosk_scans_admin_read" ON kiosk_scans FOR SELECT
  USING (current_user_role() = 'super_admin' OR (current_user_role() = 'canteen_admin' AND EXISTS (SELECT 1 FROM kiosks WHERE kiosks.id = kiosk_scans.kiosk_id AND kiosks.canteen_id = current_user_canteen_id())));

-- daily_tokens
CREATE POLICY "daily_tokens_staff_read" ON daily_tokens FOR SELECT
  USING (current_user_role() IN ('staff','canteen_admin','super_admin') AND (current_user_role() = 'super_admin' OR canteen_id = current_user_canteen_id()));
CREATE POLICY "daily_tokens_own_read" ON daily_tokens FOR SELECT
  USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = daily_tokens.order_id AND orders.user_id = auth.uid()));

-- kiosk_offline_queue
CREATE POLICY "kiosk_offline_queue_admin_read" ON kiosk_offline_queue FOR SELECT
  USING (current_user_role() = 'super_admin' OR (current_user_role() = 'canteen_admin' AND EXISTS (SELECT 1 FROM kiosks WHERE kiosks.id = kiosk_offline_queue.kiosk_id AND kiosks.canteen_id = current_user_canteen_id())));

-- staff
CREATE POLICY "staff_own_read"   ON staff FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "staff_admin_read" ON staff FOR SELECT
  USING (current_user_role() = 'super_admin' OR (current_user_role() = 'canteen_admin' AND canteen_id = current_user_canteen_id()));
CREATE POLICY "staff_admin_write" ON staff FOR INSERT WITH CHECK (current_user_role() IN ('super_admin','canteen_admin'));
CREATE POLICY "staff_admin_update" ON staff FOR UPDATE
  USING (current_user_role() IN ('super_admin','canteen_admin')) WITH CHECK (current_user_role() IN ('super_admin','canteen_admin'));
CREATE POLICY "staff_admin_delete" ON staff FOR DELETE USING (current_user_role() IN ('super_admin','canteen_admin'));

-- coupons
CREATE POLICY "coupons_public_read_active" ON coupons FOR SELECT
  USING (is_active = true AND valid_from <= NOW() AND (valid_until IS NULL OR valid_until >= NOW()));
CREATE POLICY "coupons_admin_read_all" ON coupons FOR SELECT
  USING (current_user_role() IN ('canteen_admin','super_admin'));
CREATE POLICY "coupons_admin_write" ON coupons FOR INSERT
  WITH CHECK (current_user_role() IN ('canteen_admin','super_admin'));
CREATE POLICY "coupons_admin_update" ON coupons FOR UPDATE
  USING (current_user_role() IN ('super_admin','canteen_admin')) WITH CHECK (current_user_role() IN ('super_admin','canteen_admin'));
CREATE POLICY "coupons_admin_delete" ON coupons FOR DELETE
  USING (current_user_role() = 'super_admin' OR (current_user_role() = 'canteen_admin' AND canteen_id = current_user_canteen_id()));

-- user_coupons
CREATE POLICY "user_coupons_own_read"   ON user_coupons FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "user_coupons_admin_read" ON user_coupons FOR SELECT
  USING (current_user_role() IN ('canteen_admin','super_admin'));

-- favorites
CREATE POLICY "favorites_own_all" ON favorites FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- reviews
CREATE POLICY "reviews_approved_read" ON reviews FOR SELECT USING (is_approved = true);
CREATE POLICY "reviews_own_read"      ON reviews FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "reviews_own_insert"    ON reviews FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "reviews_own_update"    ON reviews FOR UPDATE
  USING (user_id = auth.uid() AND is_approved = false) WITH CHECK (user_id = auth.uid());
CREATE POLICY "reviews_admin_all"     ON reviews FOR ALL
  USING (current_user_role() = 'super_admin' OR (current_user_role() = 'canteen_admin' AND canteen_id = current_user_canteen_id()))
  WITH CHECK (current_user_role() IN ('super_admin','canteen_admin'));

-- loyalty_points
CREATE POLICY "loyalty_points_own_read"   ON loyalty_points FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "loyalty_points_admin_read" ON loyalty_points FOR SELECT
  USING (current_user_role() IN ('canteen_admin','super_admin'));

-- audit_logs
CREATE POLICY "audit_logs_own_read"          ON audit_logs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "audit_logs_super_admin_read"  ON audit_logs FOR SELECT USING (current_user_role() = 'super_admin');
CREATE POLICY "audit_logs_canteen_admin_read" ON audit_logs FOR SELECT
  USING (current_user_role() = 'canteen_admin' AND resource_type IN ('order','menu_item','category','review','coupon','staff','kiosk'));

-- notifications
CREATE POLICY "notifications_own_all" ON notifications FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- payment_transactions
CREATE POLICY "payment_transactions_own_read"   ON payment_transactions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "payment_transactions_own_insert" ON payment_transactions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "payment_transactions_admin_read" ON payment_transactions FOR SELECT
  USING (current_user_role() = 'super_admin' OR (current_user_role() = 'canteen_admin' AND EXISTS (SELECT 1 FROM orders WHERE orders.id = payment_transactions.order_id AND orders.canteen_id = current_user_canteen_id())));
CREATE POLICY "payment_transactions_super_admin_update" ON payment_transactions FOR UPDATE
  USING (current_user_role() = 'super_admin') WITH CHECK (current_user_role() = 'super_admin');


-- ============================================================
-- PART 3: FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto update_updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

-- Attach updated_at triggers
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'institutes','canteens','categories','menu_items','users','addresses',
    'orders','kiosks','qr_tokens','staff','coupons','reviews','payment_transactions'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_update_updated_at ON %I;
      CREATE TRIGGER trg_update_updated_at BEFORE UPDATE ON %I
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();', t, t);
  END LOOP;
END; $$;

-- handle_new_user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_full_name TEXT; v_avatar_url TEXT;
BEGIN
  v_full_name  := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1));
  v_avatar_url := COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture');
  INSERT INTO public.users(id,email,full_name,avatar_url,role,is_email_verified,created_at,updated_at)
  VALUES(NEW.id,NEW.email,v_full_name,v_avatar_url,'student',(NEW.email_confirmed_at IS NOT NULL),NOW(),NOW())
  ON CONFLICT(id) DO UPDATE SET
    email=EXCLUDED.email, full_name=COALESCE(EXCLUDED.full_name,public.users.full_name),
    avatar_url=COALESCE(EXCLUDED.avatar_url,public.users.avatar_url),
    is_email_verified=EXCLUDED.is_email_verified OR public.users.is_email_verified, updated_at=NOW();
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- handle_email_confirmation trigger
CREATE OR REPLACE FUNCTION public.handle_email_confirmation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
    UPDATE public.users SET is_email_verified=true, updated_at=NOW() WHERE id=NEW.id;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS on_auth_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_email_confirmed AFTER UPDATE OF email_confirmed_at ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_email_confirmation();

-- get_user_role function
CREATE OR REPLACE FUNCTION public.get_user_role(p_user_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.users WHERE id = p_user_id;
$$;

-- validate_order_total trigger
CREATE OR REPLACE FUNCTION public.validate_order_total()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_expected INTEGER;
BEGIN
  v_expected := NEW.subtotal_paise + NEW.tax_paise - NEW.discount_paise;
  IF v_expected < 0 THEN RAISE EXCEPTION 'Order total cannot be negative'; END IF;
  NEW.total_paise := v_expected;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_validate_order_total ON orders;
CREATE TRIGGER trg_validate_order_total BEFORE INSERT OR UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION public.validate_order_total();

-- increment_coupon_used_count trigger
CREATE OR REPLACE FUNCTION public.increment_coupon_used_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE coupons SET used_count=used_count+1, updated_at=NOW() WHERE id=NEW.coupon_id;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_increment_coupon_used_count ON user_coupons;
CREATE TRIGGER trg_increment_coupon_used_count AFTER INSERT ON user_coupons FOR EACH ROW EXECUTE FUNCTION public.increment_coupon_used_count();

-- notify_order_status_change trigger
CREATE OR REPLACE FUNCTION public.notify_order_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_title TEXT; v_body TEXT; v_type TEXT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  CASE NEW.status
    WHEN 'confirmed' THEN v_type:='order_confirmed'; v_title:='Order Confirmed!';
      v_body:=format('Your order %s has been confirmed.',NEW.order_number);
    WHEN 'preparing' THEN v_type:='order_preparing'; v_title:='We''re Preparing Your Order';
      v_body:=format('Order %s is now being prepared.',NEW.order_number);
    WHEN 'ready' THEN v_type:='order_ready'; v_title:='Your Order is Ready!';
      v_body:=format('Order %s is ready for pickup. Show your QR code.',NEW.order_number);
    WHEN 'collected' THEN v_type:='order_collected'; v_title:='Order Collected';
      v_body:=format('Order %s collected. Enjoy your meal!',NEW.order_number);
    WHEN 'cancelled' THEN v_type:='order_cancelled'; v_title:='Order Cancelled';
      v_body:=format('Order %s cancelled. %s',NEW.order_number,COALESCE(NEW.cancellation_reason,''));
    WHEN 'refunded' THEN v_type:='refund_initiated'; v_title:='Refund Initiated';
      v_body:=format('Refund of ₹%.2f for order %s initiated.',NEW.refund_amount_paise::NUMERIC/100,NEW.order_number);
    ELSE RETURN NEW;
  END CASE;
  INSERT INTO notifications(user_id,type,title,body,data)
  VALUES(NEW.user_id,v_type,v_title,v_body,
    jsonb_build_object('order_id',NEW.id,'order_number',NEW.order_number,'canteen_id',NEW.canteen_id));
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notify_order_status_change ON orders;
CREATE TRIGGER trg_notify_order_status_change AFTER UPDATE OF status ON orders FOR EACH ROW EXECUTE FUNCTION public.notify_order_status_change();

-- validate_and_use_qr_token (full atomic function)
CREATE OR REPLACE FUNCTION public.validate_and_use_qr_token(p_token UUID, p_kiosk_id UUID, p_kiosk_meta JSONB DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_token_row   qr_tokens%ROWTYPE;
  v_order_row   orders%ROWTYPE;
  v_canteen_name TEXT; v_student_name TEXT;
  v_daily_number INTEGER; v_items JSONB;
BEGIN
  SELECT * INTO v_token_row FROM qr_tokens WHERE token=p_token FOR UPDATE NOWAIT;
  IF NOT FOUND THEN
    INSERT INTO kiosk_scans(kiosk_id,raw_token_value,scan_result,offline_scan,scanned_at)
    VALUES(p_kiosk_id,p_token::TEXT,'invalid_token',false,NOW());
    RETURN jsonb_build_object('success',false,'error_code','INVALID_TOKEN','message','QR token does not exist');
  END IF;
  IF v_token_row.status='used' THEN
    INSERT INTO kiosk_scans(kiosk_id,qr_token_id,raw_token_value,scan_result,offline_scan,scanned_at)
    VALUES(p_kiosk_id,v_token_row.id,p_token::TEXT,'already_used',false,NOW());
    RETURN jsonb_build_object('success',false,'error_code','ALREADY_USED','message','This QR code has already been scanned','used_at',v_token_row.used_at);
  END IF;
  IF v_token_row.status='expired' OR v_token_row.expires_at<NOW() THEN
    IF v_token_row.status='active' THEN UPDATE qr_tokens SET status='expired',updated_at=NOW() WHERE id=v_token_row.id; END IF;
    INSERT INTO kiosk_scans(kiosk_id,qr_token_id,raw_token_value,scan_result,offline_scan,scanned_at)
    VALUES(p_kiosk_id,v_token_row.id,p_token::TEXT,'expired',false,NOW());
    RETURN jsonb_build_object('success',false,'error_code','EXPIRED','message','This QR code has expired','expired_at',v_token_row.expires_at);
  END IF;
  IF v_token_row.status='revoked' THEN
    INSERT INTO kiosk_scans(kiosk_id,qr_token_id,raw_token_value,scan_result,offline_scan,scanned_at)
    VALUES(p_kiosk_id,v_token_row.id,p_token::TEXT,'revoked',false,NOW());
    RETURN jsonb_build_object('success',false,'error_code','REVOKED','message','This QR code has been revoked');
  END IF;
  UPDATE qr_tokens SET status='used',used_at=NOW(),kiosk_id=p_kiosk_id,scan_metadata=p_kiosk_meta,version=version+1,updated_at=NOW()
  WHERE id=v_token_row.id AND version=v_token_row.version;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success',false,'error_code','ALREADY_USED','message','Concurrent scan detected');
  END IF;
  SELECT * INTO v_order_row FROM orders WHERE id=v_token_row.order_id FOR UPDATE;
  UPDATE orders SET status='collected',collected_at=NOW(),updated_at=NOW() WHERE id=v_order_row.id;
  SELECT name INTO v_canteen_name FROM canteens WHERE id=v_order_row.canteen_id;
  SELECT full_name INTO v_student_name FROM users WHERE id=v_order_row.user_id;
  SELECT COALESCE(MAX(token_number),0)+1 INTO v_daily_number FROM daily_tokens WHERE canteen_id=v_order_row.canteen_id AND date=CURRENT_DATE;
  INSERT INTO daily_tokens(canteen_id,order_id,date,token_number)
  VALUES(v_order_row.canteen_id,v_order_row.id,CURRENT_DATE,v_daily_number)
  ON CONFLICT(canteen_id,date,token_number) DO UPDATE SET token_number=daily_tokens.token_number+1
  RETURNING token_number INTO v_daily_number;
  SELECT jsonb_agg(jsonb_build_object('name',oi.menu_item_name,'quantity',oi.quantity,'unit_price_paise',oi.unit_price_paise,'total_price_paise',oi.total_price_paise) ORDER BY oi.created_at)
  INTO v_items FROM order_items oi WHERE oi.order_id=v_order_row.id;
  INSERT INTO kiosk_scans(kiosk_id,qr_token_id,raw_token_value,scan_result,print_attempted,offline_scan,scanned_at)
  VALUES(p_kiosk_id,v_token_row.id,p_token::TEXT,'success',true,false,NOW());
  RETURN jsonb_build_object(
    'success',true,'token_number',v_daily_number,'order_number',v_order_row.order_number,
    'canteen_name',v_canteen_name,'student_name',v_student_name,'items',COALESCE(v_items,'[]'::JSONB),
    'subtotal_paise',v_order_row.subtotal_paise,'tax_paise',v_order_row.tax_paise,
    'discount_paise',v_order_row.discount_paise,'total_paise',v_order_row.total_paise,'collected_at',NOW());
EXCEPTION
  WHEN lock_not_available THEN
    RETURN jsonb_build_object('success',false,'error_code','ALREADY_USED','message','Token is being processed by another request');
  WHEN OTHERS THEN
    RAISE WARNING 'validate_and_use_qr_token: % %',SQLERRM,SQLSTATE;
    RETURN jsonb_build_object('success',false,'error_code','INTERNAL_ERROR','message',SQLERRM);
END; $$;

COMMIT;
