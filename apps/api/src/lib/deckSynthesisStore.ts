import { and, eq } from 'drizzle-orm';
import { assembleSynthesis, type DeckSynthesis, type SynthesisLanguage } from '@pokekon/shared';
import type { Db } from '../db/index.js';
import { deckSynthesis } from '../db/schema.js';

/** Upsert on the (deckId, windowDays, language) unique index (plan §3.7,
 *  pattern `routes/analysis.ts:69-72`) — a re-generation for the same tuple
 *  replaces the row instead of growing the table. `sections` is deliberately
 *  NOT persisted (rendering is a deterministic, no-I/O function of
 *  claims+facts, plan §3.4) so it is not part of the write. */
export async function saveDeckSynthesis(
  db: Db,
  userId: string,
  synthesis: DeckSynthesis,
): Promise<void> {
  const values = {
    deckId: synthesis.deckId,
    userId,
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
    .insert(deckSynthesis)
    .values(values)
    .onConflictDoUpdate({
      target: [deckSynthesis.deckId, deckSynthesis.windowDays, deckSynthesis.language],
      set: values,
    });
}

/** Loads the cached row for one (deckId, windowDays, language) tuple. `null`
 *  when no row exists (never throws, same "honestly empty" contract as
 *  lib/cardStatsData.ts/lib/equilibriumData.ts). `sections` is re-derived
 *  from the stored claims+facts via assembleSynthesis (not a persisted
 *  column, plan §3.4/§3.7) — `droppedCount` from the row is then restored,
 *  since assembleSynthesis would otherwise derive it from
 *  `validated.rejected.length`, which is 0 for an all-accepted claim set. */
export async function loadDeckSynthesis(
  db: Db,
  deckId: number,
  windowDays: number,
  language: SynthesisLanguage,
): Promise<DeckSynthesis | null> {
  const [row] = await db
    .select()
    .from(deckSynthesis)
    .where(
      and(
        eq(deckSynthesis.deckId, deckId),
        eq(deckSynthesis.windowDays, windowDays),
        eq(deckSynthesis.language, language),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  const assembled = assembleSynthesis(
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
