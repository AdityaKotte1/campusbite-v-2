-- ============================================================
-- CampusBite: Run this in Supabase SQL Editor
-- Safe to run multiple times (IF NOT EXISTS / IF NOT EXISTS guards)
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1. INSTITUTES TABLE (new)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS institutes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  code          text        NOT NULL,
  address       text,
  city          text,
  state         text,
  country       text        NOT NULL DEFAULT 'IN',
  pincode       text,
  contact_email text,
  contact_phone text,
  logo_url      text,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────
-- 2. CANTEENS TABLE (new, or add missing columns)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS canteens (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id   uuid        NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
  name           text        NOT NULL,
  code           text        NOT NULL DEFAULT '',
  description    text,
  location       text,
  building       text,
  floor          text,
  opens_at       text        NOT NULL DEFAULT '08:00',
  closes_at      text        NOT NULL DEFAULT '20:00',
  is_open        boolean     NOT NULL DEFAULT false,
  image_url      text,
  cover_url      text,
  rating         numeric(3,2) NOT NULL DEFAULT 0,
  total_reviews  integer     NOT NULL DEFAULT 0,
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────
-- 3. USERS TABLE — add new columns (safe if already exist)
-- ──────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS institute_id        uuid REFERENCES institutes(id),
  ADD COLUMN IF NOT EXISTS assigned_canteen_id uuid REFERENCES canteens(id),
  ADD COLUMN IF NOT EXISTS full_name           text,
  ADD COLUMN IF NOT EXISTS avatar_url          text,
  ADD COLUMN IF NOT EXISTS phone               text,
  ADD COLUMN IF NOT EXISTS is_email_verified   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_phone_verified   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_login_at       timestamptz;

-- Make sure role and is_active exist (they likely already do)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role      text    NOT NULL DEFAULT 'student',
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- ──────────────────────────────────────────────────────────
-- 4. CATEGORIES TABLE (new)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  canteen_id  uuid        NOT NULL REFERENCES canteens(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  description text,
  icon        text,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────
-- 5. MENU_ITEMS TABLE — create or add missing stock columns
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_items (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  canteen_id         uuid        NOT NULL REFERENCES canteens(id) ON DELETE CASCADE,
  category_id        uuid        REFERENCES categories(id) ON DELETE SET NULL,
  name               text        NOT NULL,
  description        text,
  price_paise        integer     NOT NULL,
  image_url          text,
  is_available       boolean     NOT NULL DEFAULT true,
  is_veg             boolean     NOT NULL DEFAULT true,
  prep_time_minutes  integer     NOT NULL DEFAULT 15,
  sort_order         integer     NOT NULL DEFAULT 0,
  stock_enabled      boolean     NOT NULL DEFAULT false,
  stock_count        integer,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- If menu_items already exists, just add the stock columns
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS stock_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_count   integer,
  ADD COLUMN IF NOT EXISTS image_url     text;

-- ──────────────────────────────────────────────────────────
-- 6. ORDERS TABLE — ensure canteen_id FK exists
-- ──────────────────────────────────────────────────────────
-- (Orders table likely exists already — just ensure columns exist)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS canteen_id uuid REFERENCES canteens(id);

-- ──────────────────────────────────────────────────────────
-- 7. RLS POLICIES — Enable RLS and allow service role
-- ──────────────────────────────────────────────────────────

-- Institutes
ALTER TABLE institutes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "institutes_service_all" ON institutes
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "institutes_authenticated_read" ON institutes
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Canteens
ALTER TABLE canteens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "canteens_service_all" ON canteens
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "canteens_authenticated_read" ON canteens
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Categories
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "categories_service_all" ON categories
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "categories_authenticated_read" ON categories
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Menu items
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "menu_items_service_all" ON menu_items
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "menu_items_authenticated_read" ON menu_items
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ──────────────────────────────────────────────────────────
-- 8. STORAGE BUCKET for menu item & canteen photos
-- ──────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'menu-images',
  'menu-images',
  true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated admins to upload
DO $$ BEGIN
  CREATE POLICY "menu_images_admin_upload" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'menu-images');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Allow authenticated admins to delete/update their uploads
DO $$ BEGIN
  CREATE POLICY "menu_images_admin_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'menu-images');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Public read for all (so student app can see food photos)
DO $$ BEGIN
  CREATE POLICY "menu_images_public_read" ON storage.objects
    FOR SELECT TO public
    USING (bucket_id = 'menu-images');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ──────────────────────────────────────────────────────────
-- 9. INDEXES for performance
-- ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_canteens_institute_id   ON canteens(institute_id);
CREATE INDEX IF NOT EXISTS idx_categories_canteen_id   ON categories(canteen_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_canteen_id   ON menu_items(canteen_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_category_id  ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_users_institute_id      ON users(institute_id);
CREATE INDEX IF NOT EXISTS idx_users_assigned_canteen  ON users(assigned_canteen_id);
CREATE INDEX IF NOT EXISTS idx_users_role              ON users(role);

-- ──────────────────────────────────────────────────────────
-- 10. SET YOUR SUPER ADMIN USER
-- Replace 'your-email@example.com' with your actual email
-- ──────────────────────────────────────────────────────────
UPDATE users
SET role = 'super_admin', is_active = true
WHERE email = 'your-email@example.com';

-- ──────────────────────────────────────────────────────────
-- DONE — refresh your admin app and retry
-- ──────────────────────────────────────────────────────────
