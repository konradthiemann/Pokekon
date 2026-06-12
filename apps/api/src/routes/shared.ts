import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import type { Db } from '../db/index.js';
import { decks, deckSnapshots } from '../db/schema.js';

/** Parses a positive-integer path parameter; null for anything else. */
export function parseId(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Reads the JSON body, returning undefined (→ zod failure) on malformed JSON. */
export async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

/**
 * True when the deck exists AND belongs to the given user. Cross-user access
 * is indistinguishable from a missing deck (404) by design.
 */
export async function userOwnsDeck(db: Db, userId: string, deckId: number): Promise<boolean> {
  const rows = await db
    .select({ id: decks.id })
    .from(decks)
    .where(and(eq(decks.id, deckId), eq(decks.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

/** Same ownership check for snapshots (used when linking logs to a snapshot). */
export async function userOwnsSnapshot(
  db: Db,
  userId: string,
  snapshotId: number,
): Promise<boolean> {
  const rows = await db
    .select({ id: deckSnapshots.id })
    .from(deckSnapshots)
    .where(and(eq(deckSnapshots.id, snapshotId), eq(deckSnapshots.userId, userId)))
    .limit(1);
  return rows.length > 0;
}
