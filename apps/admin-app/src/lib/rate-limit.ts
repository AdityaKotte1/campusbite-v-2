// Shared, cross-instance rate limiter backed by Postgres (see fix-rate-limit.sql).
//
// The previous implementation used an in-memory Map, which on serverless gives
// each instance its own counter (and resets on cold start) — i.e. no real
// limit. This calls the atomic `check_rate_limit` RPC so the cap holds across
// all instances. Limiter functions are ASYNC — callers must `await` them.
//
// Fails OPEN (allows the request) if the limiter backend errors, trading strict
// enforcement for availability during a DB hiccup. Keys are namespaced per
// limiter so different limiters don't share a bucket.

import { createServiceClient } from '@/lib/supabase/server';

export interface RateLimitConfig {
  requests: number; // max requests per window
  windowMs: number; // window length in milliseconds
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

// `failClosed` controls behaviour when the limiter backend errors or the RPC is
// missing/misconfigured. Security-sensitive limiters (auth, payment) fail CLOSED
// (deny) so a broken RPC can't silently disable the cap; availability-oriented
// ones fail OPEN (allow) so a DB hiccup doesn't block real traffic.
export function rateLimit(name: string, config: RateLimitConfig, failClosed = false) {
  const windowSeconds = Math.max(1, Math.ceil(config.windowMs / 1000));

  // Result to return when we cannot evaluate the limit.
  const onBackendFailure = (): RateLimitResult => ({
    allowed: !failClosed,
    remaining: failClosed ? 0 : config.requests,
    resetAt: Date.now() + config.windowMs,
  });

  return async function check(key: string): Promise<RateLimitResult> {
    try {
      const service = createServiceClient();
      const { data, error } = await service.rpc('check_rate_limit', {
        p_key: `${name}:${key}`,
        p_max: config.requests,
        p_window_seconds: windowSeconds,
      });

      if (error || !data) {
        if (failClosed) {
          // Surface the underlying error so a missing/broken RPC is visible in logs.
          console.error(`[rate-limit:${name}] backend error — failing closed`, error ?? 'no data returned');
        }
        return onBackendFailure();
      }

      return {
        allowed: Boolean(data.allowed),
        remaining: typeof data.remaining === 'number' ? data.remaining : 0,
        resetAt: data.reset_at ? new Date(data.reset_at).getTime() : Date.now() + config.windowMs,
      };
    } catch (err) {
      if (failClosed) {
        console.error(`[rate-limit:${name}] threw — failing closed`, err);
      }
      return onBackendFailure();
    }
  };
}

// Pre-configured limiters (keys are namespaced by the first arg).
// auth + payment fail CLOSED; order + kiosk_scan fail OPEN for availability.
export const authLimiter = rateLimit('auth', { requests: 5, windowMs: 60_000 }, true);        // 5/min
export const orderLimiter = rateLimit('order', { requests: 20, windowMs: 60_000 });     // 20/min
export const paymentLimiter = rateLimit('payment', { requests: 10, windowMs: 60_000 }, true); // 10/min
export const kioskScanLimiter = rateLimit('kiosk_scan', { requests: 120, windowMs: 60_000 }); // 120/min per kiosk
