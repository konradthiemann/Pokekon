import { Hono } from 'hono';
import { seedDemoData } from '../lib/demoSeed.js';
import type { ApiEnv } from '../middleware/session.js';

/**
 * /api/demo — guest-account demo data. The frontend's "try without signing up"
 * flow creates an anonymous user (Better Auth `anonymous` plugin) and then calls
 * POST /api/demo/seed to fill it with sample decks + documented matches.
 *
 * Restricted to anonymous accounts so a real user can never accidentally have
 * demo data injected; seedDemoData is additionally idempotent (no-op if the
 * account already owns a deck), so the call is safe to retry.
 */
export function createDemoRoutes(): Hono<ApiEnv> {
  const routes = new Hono<ApiEnv>();

  routes.post('/seed', async (c) => {
    const user = c.get('user');
    if (!user.isAnonymous) {
      return c.json({ error: 'Demo seeding is only available for guest accounts.' }, 403);
    }
    const result = await seedDemoData(c.get('db'), user.id);
    return c.json(result);
  });

  return routes;
}
