import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { opponentLogs } from '../db/schema.js';
import type { ApiEnv } from '../middleware/session.js';
import { logBodySchema, logPatchSchema, logsQuerySchema } from '../validation.js';
import { parseId, readJson, userOwnsDeck, userOwnsSnapshot } from './shared.js';

/**
 * /api/logs — opponent match logs. References to decks/snapshots are verified
 * against the session user; a foreign or missing reference yields 404.
 */
export function createLogsRoutes(): Hono<ApiEnv> {
  const routes = new Hono<ApiEnv>();

  routes.get('/', async (c) => {
    const parsed = logsQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: 'Invalid query parameters', issues: parsed.error.issues }, 400);
    }
    const { deckId, limit, offset } = parsed.data;

    const filters = [eq(opponentLogs.userId, c.get('user').id)];
    if (deckId !== undefined) filters.push(eq(opponentLogs.deckId, deckId));

    const rows = await c
      .get('db')
      .select()
      .from(opponentLogs)
      .where(and(...filters))
      .orderBy(desc(opponentLogs.eventDate), desc(opponentLogs.id))
      .limit(limit)
      .offset(offset);
    return c.json(rows);
  });

  routes.post('/', async (c) => {
    const parsed = logBodySchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', issues: parsed.error.issues }, 400);
    }

    const db = c.get('db');
    const userId = c.get('user').id;
    const body = parsed.data;

    if (body.deckId != null && !(await userOwnsDeck(db, userId, body.deckId))) {
      return c.json({ error: 'Deck not found' }, 404);
    }
    if (body.deckSnapshotId != null && !(await userOwnsSnapshot(db, userId, body.deckSnapshotId))) {
      return c.json({ error: 'Snapshot not found' }, 404);
    }

    const [log] = await db
      .insert(opponentLogs)
      .values({
        userId,
        deckId: body.deckId ?? null,
        archetype: body.archetype,
        eventType: body.eventType,
        eventDate: body.eventDate,
        result: body.result,
        notes: body.notes,
        round: body.round ?? null,
        deckSnapshotId: body.deckSnapshotId ?? null,
        battleLog: body.battleLog ?? null,
        analysis: body.analysis ?? null,
      })
      .returning();
    return c.json(log, 201);
  });

  routes.patch('/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'Not found' }, 404);

    const parsed = logPatchSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', issues: parsed.error.issues }, 400);
    }

    const db = c.get('db');
    const userId = c.get('user').id;
    const body = parsed.data;

    if (body.deckId != null && !(await userOwnsDeck(db, userId, body.deckId))) {
      return c.json({ error: 'Deck not found' }, 404);
    }
    if (body.deckSnapshotId != null && !(await userOwnsSnapshot(db, userId, body.deckSnapshotId))) {
      return c.json({ error: 'Snapshot not found' }, 404);
    }

    // JSON bodies cannot contain `undefined`, so a defined key is always an
    // intentional update; `null` clears the nullable reference columns.
    const updates: Partial<typeof opponentLogs.$inferInsert> = {};
    if (body.deckId !== undefined) updates.deckId = body.deckId;
    if (body.archetype !== undefined) updates.archetype = body.archetype;
    if (body.eventType !== undefined) updates.eventType = body.eventType;
    if (body.eventDate !== undefined) updates.eventDate = body.eventDate;
    if (body.result !== undefined) updates.result = body.result;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.round !== undefined) updates.round = body.round;
    if (body.deckSnapshotId !== undefined) updates.deckSnapshotId = body.deckSnapshotId;
    if (body.battleLog !== undefined) updates.battleLog = body.battleLog;
    if (body.analysis !== undefined) updates.analysis = body.analysis;

    const [log] = await db
      .update(opponentLogs)
      .set(updates)
      .where(and(eq(opponentLogs.id, id), eq(opponentLogs.userId, userId)))
      .returning();
    if (log === undefined) return c.json({ error: 'Not found' }, 404);
    return c.json(log);
  });

  routes.delete('/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'Not found' }, 404);

    const deleted = await c
      .get('db')
      .delete(opponentLogs)
      .where(and(eq(opponentLogs.id, id), eq(opponentLogs.userId, c.get('user').id)))
      .returning({ id: opponentLogs.id });
    if (deleted.length === 0) return c.json({ error: 'Not found' }, 404);
    return c.body(null, 204);
  });

  return routes;
}
