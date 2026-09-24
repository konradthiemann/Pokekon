import { and, eq, sql, type SQL } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Db } from '../db/index.js';
import { decks, userPreferences } from '../db/schema.js';
import type { ApiEnv } from '../middleware/session.js';
import { preferencesPatchSchema } from '../validation.js';
import { readJson } from './shared.js';

export interface PreferencesResponse {
  activeArchetypeId: string | null;
  activeDeckIdByArchetype: Record<string, number>;
}

async function loadPreferences(db: Db, userId: string): Promise<PreferencesResponse> {
  const [row] = await db
    .select({
      activeArchetypeId: userPreferences.activeArchetypeId,
      activeDeckIdByArchetype: userPreferences.activeDeckIdByArchetype,
    })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  return {
    activeArchetypeId: row?.activeArchetypeId ?? null,
    activeDeckIdByArchetype: row?.activeDeckIdByArchetype ?? {},
  };
}

/**
 * /api/preferences — per-user app preferences (Spec 7 §5.1): the archetype the
 * app coaches and, per archetype, the last active deck. Always scoped to the
 * session user; there is no path to read or write another user's row.
 */
export function createPreferencesRoutes(): Hono<ApiEnv> {
  const routes = new Hono<ApiEnv>();

  // GET /api/preferences — defaults (null, {}) when the user has no row yet.
  routes.get('/', async (c) => c.json(await loadPreferences(c.get('db'), c.get('user').id)));

  // PATCH /api/preferences — partial update, one atomic upsert.
  routes.patch('/', async (c) => {
    const parsed = preferencesPatchSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', issues: parsed.error.issues }, 400);
    }
    const db = c.get('db');
    const userId = c.get('user').id;
    const body = parsed.data;

    if (body.activeDeck && body.activeDeck.deckId !== null) {
      const [deck] = await db
        .select({ archetype: decks.archetype })
        .from(decks)
        .where(and(eq(decks.id, body.activeDeck.deckId), eq(decks.userId, userId)))
        .limit(1);
      // Another user's deck is indistinguishable from a missing one (shared.ts).
      if (!deck) return c.json({ error: 'Not found' }, 404);
      if (deck.archetype !== body.activeDeck.archetypeId) {
        return c.json({ error: 'Deck belongs to a different archetype' }, 400);
      }
    }

    // Only the fields present in the patch are written, and the map is merged
    // in SQL (not read-modify-write in JS), so concurrent PATCHes from two tabs
    // or devices never drop each other's changes.
    const set: {
      updatedAt: Date;
      activeArchetypeId?: string | null;
      activeDeckIdByArchetype?: SQL;
    } = { updatedAt: new Date() };
    let insertedMap: Record<string, number> = {};
    if (body.activeArchetypeId !== undefined) set.activeArchetypeId = body.activeArchetypeId;
    if (body.activeDeck) {
      const { archetypeId, deckId } = body.activeDeck;
      if (deckId === null) {
        set.activeDeckIdByArchetype = sql`${userPreferences.activeDeckIdByArchetype} - ${archetypeId}::text`;
      } else {
        insertedMap = { [archetypeId]: deckId };
        set.activeDeckIdByArchetype = sql`${userPreferences.activeDeckIdByArchetype} || ${JSON.stringify(insertedMap)}::jsonb`;
      }
    }

    const [row] = await db
      .insert(userPreferences)
      .values({
        userId,
        activeArchetypeId: body.activeArchetypeId ?? null,
        activeDeckIdByArchetype: insertedMap,
      })
      .onConflictDoUpdate({ target: userPreferences.userId, set })
      .returning({
        activeArchetypeId: userPreferences.activeArchetypeId,
        activeDeckIdByArchetype: userPreferences.activeDeckIdByArchetype,
      });

    const response: PreferencesResponse = {
      activeArchetypeId: row?.activeArchetypeId ?? null,
      activeDeckIdByArchetype: row?.activeDeckIdByArchetype ?? {},
    };
    return c.json(response);
  });

  return routes;
}
