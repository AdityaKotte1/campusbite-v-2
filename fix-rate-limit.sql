-- ============================================================================
-- fix-rate-limit.sql
-- ----------------------------------------------------------------------------
-- The app's rate limiter was an in-memory Map (lib/rate-limit.ts) — on Vercel/
-- serverless each instance has its own counter and cold starts reset it, so the
-- auth/payment/order/kiosk-scan limits were effectively unenforced.
--
-- This provides a SHARED store: a `rate_limits` table + an atomic
-- `check_rate_limit` RPC (single upsert, so concurrent requests can't race past
-- the cap). SECURITY DEFINER; the table is RLS-locked and only touched by the
-- function / service role.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key      TEXT PRIMARY KEY,
  count    INTEGER     NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies: only SECURITY DEFINER / service_role may touch it.

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key            TEXT,
  p_max            INTEGER,
  p_window_seconds INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_reset TIMESTAMPTZ;
BEGIN
  INSERT INTO public.rate_limits AS r (key, count, reset_at)
  VALUES (p_key, 1, now() + make_interval(secs => p_window_seconds))
  ON CONFLICT (key) DO UPDATE SET
    count = CASE WHEN r.reset_at < now() THEN 1 ELSE r.count + 1 END,
    reset_at = CASE WHEN r.reset_at < now()
                    THEN now() + make_interval(secs => p_window_seconds)
                    ELSE r.reset_at END
  RETURNING r.count, r.reset_at INTO v_count, v_reset;

  RETURN jsonb_build_object(
    'allowed',   v_count <= p_max,
    'remaining', greatest(0, p_max - v_count),
    'reset_at',  v_reset
  );
END;
$$;

-- `p_key` is caller-supplied, so granting to `authenticated` lets any logged-in
-- user tamper with (or reset) any rate-limit bucket. The route calls this via the
-- service client only — restrict to service_role and defensively revoke the rest.
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) FROM authenticated, PUBLIC;

-- Optional housekeeping: drop expired buckets. Safe to run from a cron.
-- DELETE FROM public.rate_limits WHERE reset_at < now() - interval '1 day';
