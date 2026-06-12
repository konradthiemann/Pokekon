import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { deckSnapshots } from '../db/schema.js';
import type { ApiEnv } from '../middleware/session.js';
import { parseId } from './shared.js';

/** /api/snapshots — top-level snapshot deletion (creation lives under /api/decks/:id/snapshots). */
export function createSnapshotsRoutes(): Hono<ApiEnv> {
  const routes = new Hono<ApiEnv>();

  routes.delete('/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'Not found' }, 404);

    const deleted = await c
      .get('db')
      .delete(deckSnapshots)
      .where(and(eq(deckSnapshots.id, id), eq(deckSnapshots.userId, c.get('user').id)))
      .returning({ id: deckSnapshots.id });
    if (deleted.length === 0) return c.json({ error: 'Not found' }, 404);
    return c.body(null, 204);
  });

  return routes;
}
