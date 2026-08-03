import type { MiddlewareHandler } from 'hono';
import type { ApiEnv } from '../middleware/session.js';

/**
 * Minimal in-memory per-user rate limiter for expensive or state-changing
 * routes (security review M1). Sliding window, no dependencies — sufficient
 * for the single-instance Railway deployment; a multi-instance setup would
 * need a shared store instead.
 *
 * Sits behind the session middleware, so `c.get('user')` is always present;
 * anonymous (guest) accounts are rate-limited like any other user.
 */
export function rateLimit(opts: { windowMs: number; max: number }): MiddlewareHandler<ApiEnv> {
  const hits = new Map<string, number[]>();

  return async (c, next) => {
    const now = Date.now();
    const key = c.get('user').id;
    const recent = (hits.get(key) ?? []).filter((ts) => now - ts < opts.windowMs);

    if (recent.length >= opts.max) {
      hits.set(key, recent);
      return c.json({ error: 'Too many requests — try again later' }, 429);
    }

    recent.push(now);
    hits.set(key, recent);

    // Opportunistic cleanup so the map cannot grow unboundedly across users.
    if (hits.size > 1000) {
      for (const [k, stamps] of hits) {
        if (stamps.every((ts) => now - ts >= opts.windowMs)) hits.delete(k);
      }
    }

    await next();
  };
}
