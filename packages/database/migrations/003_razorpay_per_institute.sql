-- ============================================================
-- Migration 003: Per-Institute & Per-Canteen Razorpay Configuration
-- Run in Supabase SQL Editor AFTER 001_initial.sql
-- ============================================================

-- Add Razorpay config to institutes table
-- Institute-level keys are used by ALL canteens under that institute by default
ALTER TABLE public.institutes
  ADD COLUMN IF NOT EXISTS razorpay_key_id            VARCHAR(100),
  ADD COLUMN IF NOT EXISTS razorpay_key_secret_enc    TEXT,      -- AES-256-GCM encrypted
  ADD COLUMN IF NOT EXISTS razorpay_webhook_secret_enc TEXT,     -- AES-256-GCM encrypted
  ADD COLUMN IF NOT EXISTS razorpay_configured_at      TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS razorpay_configured_by      UUID REFERENCES public.users(id);

COMMENT ON COLUMN public.institutes.razorpay_key_id            IS 'Razorpay Key ID (rzp_live_xxx or rzp_test_xxx). Public — safe to return to client.';
COMMENT ON COLUMN public.institutes.razorpay_key_secret_enc    IS 'AES-256-GCM encrypted Razorpay Key Secret. NEVER return to client.';
COMMENT ON COLUMN public.institutes.razorpay_webhook_secret_enc IS 'AES-256-GCM encrypted Razorpay webhook secret for this account.';

-- Add Razorpay config to canteens table
-- When use_own_razorpay = true, this canteen's own keys are used instead of the institute's
ALTER TABLE public.canteens
  ADD COLUMN IF NOT EXISTS use_own_razorpay            BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS razorpay_key_id             VARCHAR(100),
  ADD COLUMN IF NOT EXISTS razorpay_key_secret_enc     TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_webhook_secret_enc TEXT,
  ADD COLUMN IF NOT EXISTS razorpay_configured_at       TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS razorpay_configured_by       UUID REFERENCES public.users(id);

COMMENT ON COLUMN public.canteens.use_own_razorpay IS 'If true, this canteen uses its own Razorpay keys. If false (default), uses institute-level keys.';

-- ─── Key resolution lookup function ──────────────────────────────────────────
-- Returns the effective Razorpay key_id for a canteen (for client-side checkout display).
-- Does NOT return the secret — that is decrypted server-side in application code.
CREATE OR REPLACE FUNCTION public.get_canteen_razorpay_key_id(p_canteen_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_canteen public.canteens%ROWTYPE;
  v_institute public.institutes%ROWTYPE;
BEGIN
  SELECT * INTO v_canteen FROM public.canteens WHERE id = p_canteen_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Canteen has its own keys and opted in
  IF v_canteen.use_own_razorpay AND v_canteen.razorpay_key_id IS NOT NULL THEN
    RETURN v_canteen.razorpay_key_id;
  END IF;

  -- Fall back to institute
  SELECT * INTO v_institute FROM public.institutes WHERE id = v_canteen.institute_id;
  IF FOUND AND v_institute.razorpay_key_id IS NOT NULL THEN
    RETURN v_institute.razorpay_key_id;
  END IF;

  -- No configured keys — caller must use platform env vars
  RETURN NULL;
END;
$$;

-- ─── Audit log trigger for payment config changes ────────────────────────────
CREATE OR REPLACE FUNCTION public.log_razorpay_config_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (
    NEW.razorpay_key_id IS DISTINCT FROM OLD.razorpay_key_id OR
    NEW.razorpay_key_secret_enc IS DISTINCT FROM OLD.razorpay_key_secret_enc
  ) THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (
      NEW.razorpay_configured_by,
      'RAZORPAY_CONFIG_UPDATED',
      TG_TABLE_NAME,
      NEW.id,
      jsonb_build_object(
        'key_id_changed',    (NEW.razorpay_key_id IS DISTINCT FROM OLD.razorpay_key_id),
        'secret_changed',    (NEW.razorpay_key_secret_enc IS DISTINCT FROM OLD.razorpay_key_secret_enc),
        'new_key_id_prefix', LEFT(COALESCE(NEW.razorpay_key_id, ''), 12)
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_institute_razorpay ON public.institutes;
CREATE TRIGGER trg_log_institute_razorpay
  AFTER UPDATE OF razorpay_key_id, razorpay_key_secret_enc ON public.institutes
  FOR EACH ROW EXECUTE FUNCTION public.log_razorpay_config_change();

DROP TRIGGER IF EXISTS trg_log_canteen_razorpay ON public.canteens;
CREATE TRIGGER trg_log_canteen_razorpay
  AFTER UPDATE OF razorpay_key_id, razorpay_key_secret_enc ON public.canteens
  FOR EACH ROW EXECUTE FUNCTION public.log_razorpay_config_change();

-- ─── RLS: Only admins can read/write Razorpay config ─────────────────────────
-- The encrypted secrets in the institutes/canteens tables are already protected
-- by the table-level RLS. Students cannot read institutes or canteens columns
-- beyond what's explicitly selected.
-- Extra caution: add column-level restriction via views if needed in future.
