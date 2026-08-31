import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Db } from '../db/index.js';
import { legacyImportState, opponentLogs } from '../db/schema.js';
import type { ApiEnv } from '../middleware/session.js';
import {
  logBodySchema,
  logImportBodySchema,
  logImportEntrySchema,
  logPatchSchema,
  logsQuerySchema,
} from '../validation.js';
import { syncParsedLog } from '../lib/matchLogPipeline.js';
import { parseId, readJson, userOwnsDeck, userOwnsSnapshot } from './shared.js';
import type { z } from 'zod';

type LogCreateBody = z.infer<typeof logBodySchema> | z.infer<typeof logImportEntrySchema>;

/** Thrown inside the `/import` transaction to abort it (drizzle rolls back on
 *  any thrown error, see `db.transaction`) while still carrying enough
 *  information to answer with the right HTTP status once it propagates. */
class ImportRejected extends Error {
  constructor(
    public readonly reason: 'deck-not-found' | 'snapshot-not-found' | 'already-imported',
  ) {
    super(reason);
  }
}

/** Shared insert + parse-on-write, used by both the regular create route and
 *  the legacy-import route below — they differ only in which schema
 *  validated `body` (whether `bestOf: null` is allowed), not in what happens
 *  with a validated body. */
async function insertLog(
  db: Db,
  userId: string,
  body: LogCreateBody,
): Promise<typeof opponentLogs.$inferSelect | undefined> {
  const [log] = await db
    .insert(opponentLogs)
    .values({
      userId,
      deckId: body.deckId ?? null,
      archetype: body.archetype,
      eventType: body.eventType,
      eventDate: body.eventDate,
      result: body.result,
      bestOf: body.bestOf,
      notes: body.notes,
      round: body.round ?? null,
      deckSnapshotId: body.deckSnapshotId ?? null,
      battleLog: body.battleLog ?? null,
      analysis: body.analysis ?? null,
    })
    .returning();

  // Parse-on-write: persist the structured battle log. Best-effort — a parser
  // failure must never block saving the log itself.
  if (log !== undefined) {
    try {
      await syncParsedLog(db, {
        opponentLogId: log.id,
        userId,
        battleLog: log.battleLog,
        playerName: body.playerName,
      });
    } catch (err) {
      console.warn(`syncParsedLog failed for log ${log.id}:`, err);
    }
  }

  return log;
}

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

    const log = await insertLog(db, userId, body);
    return c.json(log, 201);
  });

  // POST /api/logs/import — the ONLY place a client may write `bestOf: null`.
  // Reserved for the one-time legacy-Dexie migration (`localImport.ts`):
  // those logs genuinely predate the field, so importing them as "format
  // unknown" is correct — guessing a default from eventType would undermine
  // the hard-required, no-inferring rule the regular create route enforces.
  //
  // Genuinely single-use per account (security review addendum): without
  // that, this would be a permanently open second path around the
  // hard-required guarantee. `legacy_import_state` (one row per account) is
  // the flag — but a SELECT-then-INSERT-at-the-end check/write (the first
  // version of this route) has a real race: N concurrent requests for the
  // same account all pass the pre-check before any of them commits the flag,
  // so every one of them would insert its full (up to `logImportBodySchema`'s
  // max) batch before only the LAST claim hits the unique constraint — a
  // client can trigger this deliberately, not just by accident. Fixed by
  // *claiming the flag first*, atomically, inside one transaction with the
  // batch insert: `INSERT ... ON CONFLICT DO NOTHING RETURNING` either wins
  // the claim (0 rows back = already imported, roll back, 409) or the
  // transaction proceeds — no request can ever get past the ownership checks
  // or the log inserts without already holding the one-and-only claim. This
  // also gives the batch atomicity for free: a failure partway through rolls
  // back the whole transaction (claim included), so a retry starts clean
  // instead of duplicating whatever had already been inserted.
  routes.post('/import', async (c) => {
    const db = c.get('db');
    const userId = c.get('user').id;

    const parsed = logImportBodySchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', issues: parsed.error.issues }, 400);
    }
    const entries = parsed.data;

    try {
      const logs = await db.transaction(async (tx) => {
        // Claim the one-time flag FIRST, atomically. 0 rows back means either
        // this account already imported, or it lost a race against a
        // concurrent /import call for the same account — either way, nothing
        // below this point may run, so the whole transaction rolls back.
        const claimed = await tx
          .insert(legacyImportState)
          .values({ userId })
          .onConflictDoNothing({ target: legacyImportState.userId })
          .returning({ userId: legacyImportState.userId });
        if (claimed.length === 0) {
          throw new ImportRejected('already-imported');
        }

        for (const body of entries) {
          if (body.deckId != null && !(await userOwnsDeck(tx, userId, body.deckId))) {
            throw new ImportRejected('deck-not-found');
          }
          if (
            body.deckSnapshotId != null &&
            !(await userOwnsSnapshot(tx, userId, body.deckSnapshotId))
          ) {
            throw new ImportRejected('snapshot-not-found');
          }
        }

        const inserted = [];
        for (const body of entries) {
          const log = await insertLog(tx, userId, body);
          if (log !== undefined) inserted.push(log);
        }
        return inserted;
      });

      return c.json(logs, 201);
    } catch (err) {
      if (err instanceof ImportRejected) {
        if (err.reason === 'deck-not-found') return c.json({ error: 'Deck not found' }, 404);
        if (err.reason === 'snapshot-not-found') {
          return c.json({ error: 'Snapshot not found' }, 404);
        }
        return c.json({ error: 'Legacy import already completed for this account' }, 409);
      }
      throw err;
    }
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
    if (body.bestOf !== undefined) updates.bestOf = body.bestOf;
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

    // Re-parse only when the battle log itself was part of the update.
    if (body.battleLog !== undefined) {
      try {
        await syncParsedLog(db, {
          opponentLogId: log.id,
          userId,
          battleLog: log.battleLog,
          playerName: body.playerName,
        });
      } catch (err) {
        console.warn(`syncParsedLog failed for log ${log.id}:`, err);
      }
    }

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
