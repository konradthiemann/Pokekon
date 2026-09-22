import { and, eq } from 'drizzle-orm';
import { assembleArchetypeSynthesis, type ArchetypeSynthesis } from '@pokekon/shared';
import type { Db } from '../db/index.js';
import { archetypeSynthesis } from '../db/schema.js';

/** The uniqueness key that lets a plain (non-partial) unique index dedupe
 *  'global' rows (shared across all users) from 'local' rows (one per
 *  user) — see the archetype_synthesis table comment in db/schema.ts for
 *  why this exists instead of relying on a nullable userId alone. */
function scopeKeyFor(scope: ArchetypeSynthesis['scope'], userId: string): string {
  return scope === 'global' ? 'global' : `local:${userId}`;
}

/** Upsert on the (archetypeId, scopeKey, windowDays, language) unique index —
 *  mirrors saveDeckSynthesis's pattern exactly. `sections` is not persisted,
 *  same reasoning as deck_synthesis (deterministic, no-I/O function of
 *  claims+facts). `userId` is stored only for scope='local' rows (nullable
 *  column) — a 'global' row belongs to no single user. */
export async function saveArchetypeSynthesis(
  db: Db,
  userId: string,
  synthesis: ArchetypeSynthesis,
): Promise<void> {
  const scopeKey = scopeKeyFor(synthesis.scope, userId);
  const values = {
    archetypeId: synthesis.archetypeId,
    userId: synthesis.scope === 'local' ? userId : null,
    scope: synthesis.scope,
    scopeKey,
    windowDays: synthesis.windowDays,
    language: synthesis.language,
    promptVersion: synthesis.promptVersion,
    inputHash: synthesis.inputHash,
    facts: synthesis.facts,
    context: synthesis.context,
    claims: synthesis.claims,
    droppedCount: synthesis.droppedCount,
    source: synthesis.source,
    provider: synthesis.provider,
    model: synthesis.model,
    generatedAt: new Date(synthesis.generatedAt),
  };

  await db
    .insert(archetypeSynthesis)
    .values(values)
    .onConflictDoUpdate({
      target: [
        archetypeSynthesis.archetypeId,
        archetypeSynthesis.scopeKey,
        archetypeSynthesis.windowDays,
        archetypeSynthesis.language,
      ],
      set: values,
    });
}

/** Loads the cached row for one (archetypeId, scope[, userId for local],
 *  windowDays, language) tuple. `null` when no row exists. `sections` is
 *  re-derived via assembleArchetypeSynthesis (not a persisted column),
 *  `droppedCount` from the row is then restored — identical reasoning to
 *  loadDeckSynthesis. */
export async function loadArchetypeSynthesis(
  db: Db,
  archetypeId: string,
  scope: ArchetypeSynthesis['scope'],
  userId: string,
  windowDays: number,
  language: ArchetypeSynthesis['language'],
): Promise<ArchetypeSynthesis | null> {
  const scopeKey = scopeKeyFor(scope, userId);
  const [row] = await db
    .select()
    .from(archetypeSynthesis)
    .where(
      and(
        eq(archetypeSynthesis.archetypeId, archetypeId),
        eq(archetypeSynthesis.scopeKey, scopeKey),
        eq(archetypeSynthesis.windowDays, windowDays),
        eq(archetypeSynthesis.language, language),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  const assembled = assembleArchetypeSynthesis(
    { accepted: row.claims, rejected: [] },
    row.facts,
    row.context,
    {
      inputHash: row.inputHash,
      source: row.source,
      provider: row.provider,
      model: row.model,
      generatedAt: row.generatedAt.toISOString(),
    },
  );

  return { ...assembled, droppedCount: row.droppedCount };
}
