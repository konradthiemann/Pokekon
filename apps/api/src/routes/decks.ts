import { and, asc, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { decks, deckCards, deckSnapshots } from '../db/schema.js';
import type { ApiEnv } from '../middleware/session.js';
import {
  deckBodySchema,
  deckPatchSchema,
  deckCardsPutSchema,
  snapshotBodySchema,
} from '../validation.js';
import { parseId, readJson, userOwnsDeck } from './shared.js';

/**
 * /api/decks — deck CRUD plus the deck-scoped card list and snapshots.
 * Every query is scoped to the session user; foreign decks return 404.
 */
export function createDecksRoutes(): Hono<ApiEnv> {
  const routes = new Hono<ApiEnv>();

  routes.get('/', async (c) => {
    const rows = await c
      .get('db')
      .select()
      .from(decks)
      .where(eq(decks.userId, c.get('user').id))
      .orderBy(desc(decks.createdAt), desc(decks.id));
    return c.json(rows);
  });

  routes.post('/', async (c) => {
    const parsed = deckBodySchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', issues: parsed.error.issues }, 400);
    }

    const [deck] = await c
      .get('db')
      .insert(decks)
      .values({ ...parsed.data, userId: c.get('user').id })
      .returning();
    return c.json(deck, 201);
  });

  routes.patch('/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'Not found' }, 404);

    const parsed = deckPatchSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', issues: parsed.error.issues }, 400);
    }

    const [deck] = await c
      .get('db')
      .update(decks)
      .set(parsed.data)
      .where(and(eq(decks.id, id), eq(decks.userId, c.get('user').id)))
      .returning();
    if (deck === undefined) return c.json({ error: 'Not found' }, 404);
    return c.json(deck);
  });

  routes.delete('/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'Not found' }, 404);

    const deleted = await c
      .get('db')
      .delete(decks)
      .where(and(eq(decks.id, id), eq(decks.userId, c.get('user').id)))
      .returning({ id: decks.id });
    if (deleted.length === 0) return c.json({ error: 'Not found' }, 404);
    return c.body(null, 204);
  });

  // ─── Cards ──────────────────────────────────────────────────────────────────

  routes.get('/:id/cards', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null || !(await userOwnsDeck(c.get('db'), c.get('user').id, id))) {
      return c.json({ error: 'Not found' }, 404);
    }

    const rows = await c
      .get('db')
      .select()
      .from(deckCards)
      .where(eq(deckCards.deckId, id))
      .orderBy(asc(deckCards.id));
    return c.json(rows);
  });

  routes.put('/:id/cards', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null || !(await userOwnsDeck(c.get('db'), c.get('user').id, id))) {
      return c.json({ error: 'Not found' }, 404);
    }

    const parsed = deckCardsPutSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', issues: parsed.error.issues }, 400);
    }

    const userId = c.get('user').id;
    const cards = await c.get('db').transaction(async (tx) => {
      await tx.delete(deckCards).where(eq(deckCards.deckId, id));
      if (parsed.data.length === 0) return [];
      return tx
        .insert(deckCards)
        .values(parsed.data.map((card) => ({ ...card, deckId: id, userId })))
        .returning();
    });
    return c.json(cards);
  });

  // ─── Snapshots (deck-scoped) ────────────────────────────────────────────────

  routes.get('/:id/snapshots', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null || !(await userOwnsDeck(c.get('db'), c.get('user').id, id))) {
      return c.json({ error: 'Not found' }, 404);
    }

    const rows = await c
      .get('db')
      .select()
      .from(deckSnapshots)
      .where(eq(deckSnapshots.deckId, id))
      .orderBy(desc(deckSnapshots.createdAt), desc(deckSnapshots.id));
    return c.json(rows);
  });

  routes.post('/:id/snapshots', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null || !(await userOwnsDeck(c.get('db'), c.get('user').id, id))) {
      return c.json({ error: 'Not found' }, 404);
    }

    const parsed = snapshotBodySchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', issues: parsed.error.issues }, 400);
    }

    const totalCards = parsed.data.cards.reduce((sum, card) => sum + card.count, 0);
    const [snapshot] = await c
      .get('db')
      .insert(deckSnapshots)
      .values({
        deckId: id,
        userId: c.get('user').id,
        label: parsed.data.label,
        cards: parsed.data.cards,
        totalCards,
      })
      .returning();
    return c.json(snapshot, 201);
  });

  return routes;
}
