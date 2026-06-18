import { asc, gte } from 'drizzle-orm';
import { Hono } from 'hono';
import { ROTATION_PERIOD } from '@pokekon/shared';
import { metaSnapshots } from '../db/schema.js';
import { runMetaSync } from '../jobs/syncMeta.js';
import type { ApiEnv } from '../middleware/session.js';

/**
 * /api/meta — global tournament-meta snapshots. Reads serve only in-season
 * (post-rotation) data; the sync is a server-side job (no browser CORS proxy).
 */
export function createMetaRoutes(): Hono<ApiEnv> {
  const routes = new Hono<ApiEnv>();

  // GET /api/meta — all in-season snapshots (every post-rotation period), oldest first.
  routes.get('/', async (c) => {
    const rows = await c
      .get('db')
      .select()
      .from(metaSnapshots)
      .where(gte(metaSnapshots.period, ROTATION_PERIOD))
      .orderBy(asc(metaSnapshots.period));
    return c.json(rows);
  });

  // POST /api/meta/sync — run the server-side meta sync (fetches Limitless directly).
  routes.post('/sync', async (c) => {
    try {
      const result = await runMetaSync(c.get('db'));
      return c.json(result);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Meta sync failed' }, 502);
    }
  });

  return routes;
}
