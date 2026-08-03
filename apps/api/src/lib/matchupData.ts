import { desc, eq } from 'drizzle-orm';
import type { MatchupRow } from '@pokekon/shared';
import type { Db } from '../db/index.js';
import { matchupMatrix } from '../db/schema.js';
import { importMatchups, readBundledMatchupCsv } from '../jobs/importMatchups.js';

/** The latest matchup batch, or an empty result when none exists. */
export interface MatchupData {
  importedAt: Date | null;
  rows: MatchupRow[];
}

async function loadLatestBatch(db: Db): Promise<MatchupData> {
  const latest = await db
    .select({ importedAt: matchupMatrix.importedAt })
    .from(matchupMatrix)
    .orderBy(desc(matchupMatrix.importedAt))
    .limit(1);
  const importedAt = latest[0]?.importedAt;
  if (importedAt === undefined) return { importedAt: null, rows: [] };

  const rows = await db
    .select({
      deck1: matchupMatrix.deck1,
      deck2: matchupMatrix.deck2,
      wins: matchupMatrix.wins,
      losses: matchupMatrix.losses,
      ties: matchupMatrix.ties,
      total: matchupMatrix.total,
      winRate: matchupMatrix.winRate,
    })
    .from(matchupMatrix)
    .where(eq(matchupMatrix.importedAt, importedAt));
  return { importedAt, rows };
}

/**
 * Latest matchup batch, lazily seeded from the bundled TrainerHill CSV when
 * the table is empty — a fresh deployment serves matchup data without any
 * manual import step. Two concurrent first reads may each seed a batch; that
 * is harmless because reads only ever use the latest one.
 */
export async function ensureMatchups(db: Db): Promise<MatchupData> {
  const existing = await loadLatestBatch(db);
  if (existing.importedAt !== null) return existing;

  try {
    await importMatchups(db, readBundledMatchupCsv());
  } catch (err) {
    // No bundled file (or an unreadable one) → serve honestly empty data; the
    // POST /api/matchups/import route remains the manual escape hatch.
    console.warn('[matchupData] lazy seed failed:', err);
    return { importedAt: null, rows: [] };
  }
  return loadLatestBatch(db);
}
