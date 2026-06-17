import { and, eq, gte } from 'drizzle-orm';
import { Hono } from 'hono';
import { matchLogParsed, opponentLogs } from '../db/schema.js';
import type { ApiEnv } from '../middleware/session.js';
import { analyticsQuerySchema } from '../validation.js';
import { computeDeckAnalytics } from '../lib/deckAnalytics.js';
import { parseId, userOwnsDeck } from './shared.js';

/** YYYY-MM-DD cutoff `weeks` weeks before today (UTC) for the time-window filter. */
function windowCutoff(weeks: number): string {
  const now = new Date();
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  cutoff.setUTCDate(cutoff.getUTCDate() - weeks * 7);
  return cutoff.toISOString().slice(0, 10);
}

/**
 * /api/analytics — read-only deck performance derived from the parsed battle
 * logs. Reads finished aggregates only (the parse happened on write, plan §4).
 */
export function createAnalyticsRoutes(): Hono<ApiEnv> {
  const routes = new Hono<ApiEnv>();

  // GET /api/analytics/deck/:id?weeks=1|2|3|4 — turn-quality metrics (plan §3.7.1).
  routes.get('/deck/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'Not found' }, 404);

    const parsedQuery = analyticsQuerySchema.safeParse(c.req.query());
    if (!parsedQuery.success) {
      return c.json({ error: 'Invalid query parameters', issues: parsedQuery.error.issues }, 400);
    }
    const { weeks } = parsedQuery.data;

    const db = c.get('db');
    const userId = c.get('user').id;

    if (!(await userOwnsDeck(db, userId, id))) {
      return c.json({ error: 'Deck not found' }, 404);
    }

    const rows = await db
      .select({
        result: opponentLogs.result,
        wentFirst: matchLogParsed.wentFirst,
        setupCleanByTurn2: matchLogParsed.setupCleanByTurn2,
        deadTurns: matchLogParsed.deadTurns,
        prizeProgression: matchLogParsed.prizeProgression,
      })
      .from(opponentLogs)
      .leftJoin(matchLogParsed, eq(matchLogParsed.opponentLogId, opponentLogs.id))
      .where(
        and(
          eq(opponentLogs.deckId, id),
          eq(opponentLogs.userId, userId),
          gte(opponentLogs.eventDate, windowCutoff(weeks)),
        ),
      );

    return c.json(computeDeckAnalytics(id, weeks, rows));
  });

  return routes;
}
