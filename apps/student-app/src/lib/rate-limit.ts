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

export function rateLimit(name: string, config: RateLimitConfig) {
  const windowSeconds = Math.max(1, Math.ceil(config.windowMs / 1000));

  return async function check(key: string): Promise<RateLimitResult> {
    try {
      const service = createServiceClient();
      const { data, error } = await service.rpc('check_rate_limit', {
        p_key: `${name}:${key}`,
        p_max: config.requests,
        p_window_seconds: windowSeconds,
      });

      if (error || !data) {
        // Fail open — don't block real traffic because the limiter backend is down.
        return { allowed: true, remaining: config.requests, resetAt: Date.now() + config.windowMs };
      }

      return {
        allowed: Boolean(data.allowed),
        remaining: typeof data.remaining === 'number' ? data.remaining : 0,
        resetAt: data.reset_at ? new Date(data.reset_at).getTime() : Date.now() + config.windowMs,
      };
    } catch {
      return { allowed: true, remaining: config.requests, resetAt: Date.now() + config.windowMs };
    }
  };
}

// Pre-configured limiters (keys are namespaced by the first arg).
export const authLimiter = rateLimit('auth', { requests: 5, windowMs: 60_000 });        // 5/min
export const orderLimiter = rateLimit('order', { requests: 20, windowMs: 60_000 });     // 20/min
export const paymentLimiter = rateLimit('payment', { requests: 10, windowMs: 60_000 }); // 10/min
export const kioskScanLimiter = rateLimit('kiosk_scan', { requests: 120, windowMs: 60_000 }); // 120/min per kiosk
