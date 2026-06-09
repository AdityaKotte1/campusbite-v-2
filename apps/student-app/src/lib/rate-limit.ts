// Simple in-memory rate limiter for Next.js API routes.
// For production at scale, replace with Redis-backed solution (Upstash).

const store = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitConfig {
  requests: number;  // max requests
  windowMs: number;  // window in milliseconds
}

export function rateLimit(config: RateLimitConfig) {
  return function check(key: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + config.windowMs });
      return { allowed: true, remaining: config.requests - 1, resetAt: now + config.windowMs };
    }

    if (entry.count >= config.requests) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    entry.count += 1;
    return { allowed: true, remaining: config.requests - entry.count, resetAt: entry.resetAt };
  };
}

// Pre-configured limiters
export const authLimiter = rateLimit({ requests: 5, windowMs: 60_000 });       // 5/min
export const orderLimiter = rateLimit({ requests: 20, windowMs: 60_000 });      // 20/min
export const paymentLimiter = rateLimit({ requests: 10, windowMs: 60_000 });    // 10/min
export const kioskScanLimiter = rateLimit({ requests: 120, windowMs: 60_000 }); // 120/min per kiosk
