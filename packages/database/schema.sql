-- ============================================================
-- MunchAdda — Complete PostgreSQL Schema
-- Run this in Supabase SQL editor (or via migration).
-- All monetary values in paise (integer).
-- All IDs are UUIDs (gen_random_uuid()).
-- ============================================================

-- Enable UUID extension (already enabled in Supabase by default)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. INSTITUTES
-- ============================================================

CREATE TABLE IF NOT EXISTS institutes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  short_name        TEXT NOT NULL,
  logo_url          TEXT,
  address           TEXT,
  city              TEXT NOT NULL,
  state             TEXT NOT NULL,
  pincode           VARCHAR(10),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_institutes_is_active ON institutes(is_active);

-- ============================================================
-- 2. CANTEENS
-- ============================================================

CREATE TABLE IF NOT EXISTS canteens (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id        UUID NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  description         TEXT,
  image_url           TEXT,
  phone               VARCHAR(20),
  email               TEXT,
  opening_time        TIME,                         -- e.g. 08:00
  closing_time        TIME,                         -- e.g. 20:00
  is_open             BOOLEAN NOT NULL DEFAULT true, -- manual override (e.g. holiday)
  is_active           BOOLEAN NOT NULL DEFAULT true,
  prep_time_minutes   INTEGER NOT NULL DEFAULT 15 CHECK (prep_time_minutes >= 0),
  tax_percentage      NUMERIC(5,2) NOT NULL DEFAULT 5.00 CHECK (tax_percentage >= 0),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_canteens_institute_id ON canteens(institute_id);
CREATE INDEX idx_canteens_is_active    ON canteens(is_active);

-- ============================================================
-- 3. CATEGORIES
-- ============================================================

CREATE TABLE IF NOT EXISTS categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canteen_id    UUID NOT NULL REFERENCES canteens(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  image_url     TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_categories_canteen_id ON categories(canteen_id);
CREATE INDEX idx_categories_sort_order ON categories(canteen_id, sort_order);

-- ============================================================
-- 4. MENU ITEMS
-- ============================================================

CREATE TABLE IF NOT EXISTS menu_items (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canteen_id              UUID NOT NULL REFERENCES canteens(id) ON DELETE CASCADE,
  category_id             UUID NOT NULL REFERENCES categories(id) ON DELETE SET NULL,
  name                    TEXT NOT NULL,
  description             TEXT,
  price_paise             INTEGER NOT NULL CHECK (price_paise > 0),        -- e.g. 5000 = ₹50
  original_price_paise    INTEGER CHECK (original_price_paise > 0),        -- strikethrough price
  images                  JSONB NOT NULL DEFAULT '[]'::JSONB,              -- [{url, alt, is_primary}]
  allergens               TEXT[] NOT NULL DEFAULT '{}',                    -- e.g. {gluten, dairy}
  is_vegetarian           BOOLEAN NOT NULL DEFAULT false,
  is_vegan                BOOLEAN NOT NULL DEFAULT false,
  is_available            BOOLEAN NOT NULL DEFAULT true,
  is_featured             BOOLEAN NOT NULL DEFAULT false,
  prep_time_minutes       INTEGER CHECK (prep_time_minutes >= 0),
  nutritional_info        JSONB,                                            -- {calories, protein_g, ...}
  sort_order              INTEGER NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_menu_items_canteen_id   ON menu_items(canteen_id);
CREATE INDEX idx_menu_items_category_id  ON menu_items(category_id);
CREATE INDEX idx_menu_items_is_available ON menu_items(canteen_id, is_available);
CREATE INDEX idx_menu_items_is_featured  ON menu_items(canteen_id, is_featured) WHERE is_featured = true;
CREATE INDEX idx_menu_items_sort_order   ON menu_items(canteen_id, sort_order);

-- ============================================================
-- 5. USERS (mirrors auth.users, public profile)
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id                      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                   TEXT NOT NULL UNIQUE,
  full_name               TEXT NOT NULL,
  phone                   VARCHAR(20),
  avatar_url              TEXT,
  role                    VARCHAR(50) NOT NULL DEFAULT 'student'
                            CHECK (role IN ('student', 'staff', 'canteen_admin', 'super_admin')),
  institute_id            UUID REFERENCES institutes(id) ON DELETE SET NULL,
  assigned_canteen_id     UUID REFERENCES canteens(id) ON DELETE SET NULL,
  is_active               BOOLEAN NOT NULL DEFAULT true,
  is_email_verified       BOOLEAN NOT NULL DEFAULT false,
  loyalty_points_balance  INTEGER NOT NULL DEFAULT 0 CHECK (loyalty_points_balance >= 0),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email               ON users(email);
CREATE INDEX idx_users_role                ON users(role);
CREATE INDEX idx_users_institute_id        ON users(institute_id);
CREATE INDEX idx_users_assigned_canteen_id ON users(assigned_canteen_id);

-- ============================================================
-- 6. ADDRESSES
-- ============================================================

CREATE TABLE IF NOT EXISTS addresses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,                  -- e.g. "Home", "Hostel A"
  line1         TEXT NOT NULL,
  line2         TEXT,
  city          TEXT NOT NULL,
  state         TEXT NOT NULL,
  pincode       VARCHAR(10) NOT NULL,
  is_default    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_addresses_user_id ON addresses(user_id);

-- ============================================================
-- 7. ORDERS
-- ============================================================

CREATE TABLE IF NOT EXISTS orders (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number            TEXT NOT NULL UNIQUE,   -- e.g. "CB-20241215-0042"
  user_id                 UUID NOT NULL REFERENCES users(id),
  canteen_id              UUID NOT NULL REFERENCES canteens(id),
  status                  VARCHAR(30) NOT NULL DEFAULT 'payment_pending',
  payment_status          VARCHAR(30) NOT NULL DEFAULT 'pending'
                            CHECK (payment_status IN ('pending','paid','failed','refunded','partially_refunded')),
  delivery_type           VARCHAR(20) NOT NULL DEFAULT 'pickup'
                            CHECK (delivery_type IN ('pickup', 'table_delivery')),
  subtotal_paise          INTEGER NOT NULL CHECK (subtotal_paise >= 0),
  tax_paise               INTEGER NOT NULL DEFAULT 0 CHECK (tax_paise >= 0),
  discount_paise          INTEGER NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
  total_paise             INTEGER NOT NULL CHECK (total_paise >= 0),
  special_instructions    TEXT,
  coupon_id               UUID,
  coupon_code             TEXT,
  estimated_ready_at      TIMESTAMPTZ,
  confirmed_at            TIMESTAMPTZ,
  preparing_at            TIMESTAMPTZ,
  ready_at                TIMESTAMPTZ,
  collected_at            TIMESTAMPTZ,
  cancelled_at            TIMESTAMPTZ,
  cancellation_reason     TEXT,
  refunded_at             TIMESTAMPTZ,
  refund_amount_paise     INTEGER CHECK (refund_amount_paise >= 0),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_user_id        ON orders(user_id);
CREATE INDEX idx_orders_canteen_id     ON orders(canteen_id);
CREATE INDEX idx_orders_status         ON orders(status);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);
CREATE INDEX idx_orders_created_at     ON orders(created_at DESC);
CREATE INDEX idx_orders_canteen_status ON orders(canteen_id, status);
CREATE INDEX idx_orders_order_number   ON orders(order_number);

-- Status constraint (applied after table creation for clarity)
ALTER TABLE orders ADD CONSTRAINT orders_status_valid CHECK (status IN (
  'payment_pending',
  'payment_failed',
  'confirmed',
  'preparing',
  'ready',
  'collected',
  'cancelled',
  'refunded'
));

-- ============================================================
-- 8. ORDER ITEMS
-- ============================================================

CREATE TABLE IF NOT EXISTS order_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id          UUID REFERENCES menu_items(id) ON DELETE SET NULL,
  menu_item_name        TEXT NOT NULL,             -- snapshot at order time
  menu_item_image_url   TEXT,                      -- snapshot at order time
  quantity              INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_paise      INTEGER NOT NULL CHECK (unit_price_paise > 0),  -- snapshot
  total_price_paise     INTEGER NOT NULL CHECK (total_price_paise > 0),
  customization_notes   TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_items_order_id     ON order_items(order_id);
CREATE INDEX idx_order_items_menu_item_id ON order_items(menu_item_id);

-- ============================================================
-- 9. KIOSKS
-- ============================================================

CREATE TABLE IF NOT EXISTS kiosks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canteen_id          UUID NOT NULL REFERENCES canteens(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  device_id           TEXT NOT NULL UNIQUE,
  location            TEXT,                          -- e.g. "Block A Ground Floor"
  api_key_encrypted   TEXT NOT NULL,               -- AES-256 encrypted API key
  last_heartbeat      TIMESTAMPTZ,
  heartbeat_data      JSONB,                        -- {printer_status, app_version, stats, reported_at}
  firmware_version    TEXT,
  printer_config      JSONB,                        -- {enabled, paper_width_mm, copies, ...}
  offline_mode        BOOLEAN NOT NULL DEFAULT false,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kiosks_canteen_id ON kiosks(canteen_id);
CREATE INDEX idx_kiosks_device_id  ON kiosks(device_id);

-- ============================================================
-- 10. QR TOKENS (enhanced with kiosk_id, scan_metadata, version)
-- ============================================================

CREATE TABLE IF NOT EXISTS qr_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  token           UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'used', 'expired', 'revoked')),
  kiosk_id        UUID REFERENCES kiosks(id) ON DELETE SET NULL,
  scan_metadata   JSONB,                          -- {device_os, app_version, ip_address, ...}
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  version         INTEGER NOT NULL DEFAULT 1,     -- optimistic locking
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_qr_tokens_order_id  ON qr_tokens(order_id);
CREATE INDEX idx_qr_tokens_token     ON qr_tokens(token);
CREATE INDEX idx_qr_tokens_status    ON qr_tokens(status);
CREATE INDEX idx_qr_tokens_expires_at ON qr_tokens(expires_at);

-- Only one active QR token allowed per order
CREATE UNIQUE INDEX idx_qr_tokens_active_order
  ON qr_tokens(order_id) WHERE status = 'active';

-- ============================================================
-- 11. KIOSK SCANS
-- ============================================================

CREATE TABLE IF NOT EXISTS kiosk_scans (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosk_id          UUID NOT NULL REFERENCES kiosks(id) ON DELETE CASCADE,
  qr_token_id       UUID REFERENCES qr_tokens(id) ON DELETE SET NULL,
  raw_token_value   TEXT NOT NULL,
  scan_result       VARCHAR(30) NOT NULL
                      CHECK (scan_result IN (
                        'success', 'already_used', 'expired',
                        'revoked', 'invalid_token', 'network_error'
                      )),
  print_attempted   BOOLEAN NOT NULL DEFAULT false,
  print_success     BOOLEAN,
  offline_scan      BOOLEAN NOT NULL DEFAULT false,
  synced_at         TIMESTAMPTZ,
  scanned_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kiosk_scans_kiosk_id    ON kiosk_scans(kiosk_id);
CREATE INDEX idx_kiosk_scans_qr_token_id ON kiosk_scans(qr_token_id);
CREATE INDEX idx_kiosk_scans_scanned_at  ON kiosk_scans(scanned_at DESC);
CREATE INDEX idx_kiosk_scans_scan_result ON kiosk_scans(scan_result);

-- ============================================================
-- 12. DAILY TOKENS (sequential per-canteen per-day numbering)
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canteen_id    UUID NOT NULL REFERENCES canteens(id) ON DELETE CASCADE,
  order_id      UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  token_number  INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (canteen_id, date, token_number)
);

CREATE INDEX idx_daily_tokens_canteen_date ON daily_tokens(canteen_id, date);
CREATE INDEX idx_daily_tokens_order_id     ON daily_tokens(order_id);

-- ============================================================
-- 13. KIOSK OFFLINE QUEUE (scans buffered during offline mode)
-- ============================================================

CREATE TABLE IF NOT EXISTS kiosk_offline_queue (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosk_id          UUID NOT NULL REFERENCES kiosks(id) ON DELETE CASCADE,
  raw_token_value   TEXT NOT NULL,
  scanned_at        TIMESTAMPTZ NOT NULL,          -- actual scan time (offline)
  synced            BOOLEAN NOT NULL DEFAULT false,
  synced_at         TIMESTAMPTZ,
  sync_result       JSONB,                         -- server response after sync
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kiosk_offline_queue_kiosk_id ON kiosk_offline_queue(kiosk_id);
CREATE INDEX idx_kiosk_offline_queue_synced   ON kiosk_offline_queue(kiosk_id, synced)
  WHERE synced = false;

-- ============================================================
-- 14. STAFF
-- ============================================================

CREATE TABLE IF NOT EXISTS staff (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  canteen_id      UUID NOT NULL REFERENCES canteens(id) ON DELETE CASCADE,
  employee_id     TEXT,
  designation     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_staff_canteen_id ON staff(canteen_id);
CREATE INDEX idx_staff_user_id    ON staff(user_id);

-- ============================================================
-- 15. COUPONS
-- ============================================================

CREATE TABLE IF NOT EXISTS coupons (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canteen_id          UUID REFERENCES canteens(id) ON DELETE CASCADE,  -- NULL = platform-wide
  code                TEXT NOT NULL UNIQUE,
  description         TEXT,
  discount_type       VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'flat')),
  discount_value      NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
  min_order_paise     INTEGER CHECK (min_order_paise >= 0),
  max_discount_paise  INTEGER CHECK (max_discount_paise >= 0),
  usage_limit         INTEGER CHECK (usage_limit > 0),                  -- NULL = unlimited
  used_count          INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  per_user_limit      INTEGER NOT NULL DEFAULT 1 CHECK (per_user_limit > 0),
  valid_from          TIMESTAMPTZ NOT NULL,
  valid_until         TIMESTAMPTZ,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_coupons_code       ON coupons(code);
CREATE INDEX idx_coupons_canteen_id ON coupons(canteen_id);
CREATE INDEX idx_coupons_is_active  ON coupons(is_active, valid_from, valid_until);

-- ============================================================
-- 16. USER COUPONS (per-user redemption tracking)
-- ============================================================

CREATE TABLE IF NOT EXISTS user_coupons (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coupon_id               UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  order_id                UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  discount_applied_paise  INTEGER NOT NULL CHECK (discount_applied_paise >= 0),
  used_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_coupons_user_id   ON user_coupons(user_id);
CREATE INDEX idx_user_coupons_coupon_id ON user_coupons(coupon_id);

-- ============================================================
-- 17. FAVORITES
-- ============================================================

CREATE TABLE IF NOT EXISTS favorites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  menu_item_id    UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, menu_item_id)                       -- prevent duplicate favorites
);

CREATE INDEX idx_favorites_user_id      ON favorites(user_id);
CREATE INDEX idx_favorites_menu_item_id ON favorites(menu_item_id);

-- ============================================================
-- 18. REVIEWS
-- ============================================================

CREATE TABLE IF NOT EXISTS reviews (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id                UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  canteen_id              UUID NOT NULL REFERENCES canteens(id) ON DELETE CASCADE,
  menu_item_id            UUID REFERENCES menu_items(id) ON DELETE SET NULL,   -- NULL = canteen review
  rating                  SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title                   TEXT,
  body                    TEXT,
  is_verified_purchase    BOOLEAN NOT NULL DEFAULT false,
  is_approved             BOOLEAN NOT NULL DEFAULT false,
  approved_at             TIMESTAMPTZ,
  approved_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reviews_canteen_id   ON reviews(canteen_id, is_approved);
CREATE INDEX idx_reviews_user_id      ON reviews(user_id);
CREATE INDEX idx_reviews_menu_item_id ON reviews(menu_item_id, is_approved);
CREATE INDEX idx_reviews_order_id     ON reviews(order_id);

-- ============================================================
-- 19. LOYALTY POINTS
-- ============================================================

CREATE TABLE IF NOT EXISTS loyalty_points (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id            UUID REFERENCES orders(id) ON DELETE SET NULL,
  transaction_type    VARCHAR(30) NOT NULL
                        CHECK (transaction_type IN (
                          'earned_order', 'redeemed_order',
                          'bonus', 'expiry', 'adjustment'
                        )),
  points              INTEGER NOT NULL,        -- positive = earned, negative = redeemed/expired
  balance_after       INTEGER NOT NULL CHECK (balance_after >= 0),
  description         TEXT,
  expires_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_loyalty_points_user_id  ON loyalty_points(user_id);
CREATE INDEX idx_loyalty_points_order_id ON loyalty_points(order_id);

-- ============================================================
-- 20. AUDIT LOGS
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  action          VARCHAR(30) NOT NULL
                    CHECK (action IN ('create','update','delete','login','logout','view','export')),
  resource_type   TEXT NOT NULL,             -- e.g. 'order', 'menu_item', 'user'
  resource_id     UUID,
  old_values      JSONB,
  new_values      JSONB,
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id       ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource      ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created_at    ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action        ON audit_logs(action);

-- ============================================================
-- 21. NOTIFICATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  data        JSONB,                      -- e.g. {"order_id": "uuid"}
  is_read     BOOLEAN NOT NULL DEFAULT false,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id   ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_created_at ON notifications(user_id, created_at DESC);

-- ============================================================
-- 22. PAYMENT TRANSACTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES users(id),
  gateway               VARCHAR(30) NOT NULL DEFAULT 'razorpay'
                          CHECK (gateway IN ('razorpay', 'manual', 'wallet')),
  gateway_order_id      TEXT,                   -- Razorpay order ID
  gateway_payment_id    TEXT,                   -- Razorpay payment ID
  gateway_signature     TEXT,                   -- Razorpay HMAC signature
  amount_paise          INTEGER NOT NULL CHECK (amount_paise > 0),
  currency              VARCHAR(5) NOT NULL DEFAULT 'INR',
  status                VARCHAR(30) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','paid','failed','refunded','partially_refunded')),
  failure_reason        TEXT,
  refund_id             TEXT,
  refund_amount_paise   INTEGER CHECK (refund_amount_paise >= 0),
  refunded_at           TIMESTAMPTZ,
  raw_response          JSONB,                  -- full gateway payload for audit
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_transactions_order_id          ON payment_transactions(order_id);
CREATE INDEX idx_payment_transactions_user_id           ON payment_transactions(user_id);
CREATE INDEX idx_payment_transactions_gateway_order_id  ON payment_transactions(gateway_order_id);
CREATE INDEX idx_payment_transactions_gateway_payment_id ON payment_transactions(gateway_payment_id);
CREATE INDEX idx_payment_transactions_status            ON payment_transactions(status);
