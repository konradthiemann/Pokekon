// Precomputes per-archetype card performance deltas (plan
// .claude/plans/recommendation-to-prognosis.md §3.5/§3.6, Slice B). Reads the
// raw tournament_standings/tournaments the meta sync already persists, calls
// the pure statistics engine from @pokekon/shared (Slice A) — this file is
// I/O and orchestration ONLY, no statistics are reimplemented here — and
// writes the result into archetype_card_stats, one job run at a time.
// Runnable as a Railway cron: `node dist/jobs/computeCardStats.js [--dry-run]`.

import { fileURLToPath } from 'node:url';
import { and, eq, isNotNull } from 'drizzle-orm';
import {
  computeArchetypeCardStats,
  normalizeCardName,
  OTHER_ARCHETYPE_ID,
  placementPercentile,
  type ListPerformanceEntry,
  type TournamentDecklist,
} from '@pokekon/shared';
import { closeDb, getDb, type Db } from '../db/index.js';
import { archetypeCardStats, tournamentStandings, tournaments } from '../db/schema.js';
import { windowConditions } from '../routes/meta.js';

export interface CardStatsJobResult {
  computedAt: string; // ISO
  windows: number[]; // the windows actually computed
  archetypesProcessed: number;
  /** Archetypes with too few usable lists (< minLists) — deliberately left
   *  out, NOT half-written. */
  archetypesSkipped: number;
  rowsWritten: number;
  /** Standings in the window without `decklist` OR without a usable `placing`. */
  listsWithoutData: number;
  dryRun: boolean;
}

const DEFAULT_WINDOWS = [7, 14, 21, 28];
/** Pure job-economy floor (not a model cutoff, see the plan): below this a
 *  card's delta would be `insufficient` anyway, and the row would only be
 *  noise in the table. */
const DEFAULT_MIN_LISTS = 8;
/** Chunk size for the replace-insert, mirroring syncMeta.ts's standings
 *  insert — stays well under Postgres'/PGlite's per-statement parameter cap. */
const INSERT_CHUNK_SIZE = 200;

type CardKind = 'pokemon' | 'trainer' | 'energy';
const DECKLIST_GROUPS: readonly CardKind[] = ['pokemon', 'trainer', 'energy'];

/** Reduce one published decklist + its list's placement percentile into the
 *  shared engine's ListPerformanceEntry: two printings of the same card (two
 *  sets) are ONE inclusion with the summed count (plan §0.3 / cardPerformance
 *  doc comment) — never reproduces deckComparison.ts's per-entry counting. */
function decklistToPerformanceEntry(
  decklist: TournamentDecklist,
  percentile: number,
): ListPerformanceEntry {
  const counts: Record<string, number> = {};
  const displayNames: Record<string, string> = {};
  const cardTypes: Record<string, CardKind> = {};

  for (const group of DECKLIST_GROUPS) {
    for (const entry of decklist[group]) {
      const key = normalizeCardName(entry.name);
      counts[key] = (counts[key] ?? 0) + entry.count;
      if (!(key in displayNames)) displayNames[key] = entry.name;
      if (!(key in cardTypes)) cardTypes[key] = group;
    }
  }

  return { counts, displayNames, cardTypes, percentile };
}

interface WindowRow {
  archetypeId: string;
  placing: number | null;
  decklist: TournamentDecklist | null;
  players: number;
}

/**
 * Load every standing in the window's scope, split into usable
 * ListPerformanceEntry[] per archetype and a `listsWithoutData` count — rows
 * missing `decklist` or `placing` at the SQL level, PLUS any row whose
 * `placementPercentile` still comes back null (e.g. a malformed player
 * count), which is caught in JS.
 */
async function loadWindowEntries(
  db: Db,
  window: { days: number; online: boolean; bo1: boolean },
): Promise<{ byArchetype: Map<string, ListPerformanceEntry[]>; listsWithoutData: number }> {
  const scopeConds = windowConditions(window);

  const allRows = await db
    .select({ archetypeId: tournamentStandings.archetypeId })
    .from(tournamentStandings)
    .innerJoin(tournaments, eq(tournamentStandings.tournamentId, tournaments.id))
    .where(and(...scopeConds));

  const usableRows: WindowRow[] = await db
    .select({
      archetypeId: tournamentStandings.archetypeId,
      placing: tournamentStandings.placing,
      decklist: tournamentStandings.decklist,
      players: tournaments.players,
    })
    .from(tournamentStandings)
    .innerJoin(tournaments, eq(tournamentStandings.tournamentId, tournaments.id))
    .where(
      and(
        ...scopeConds,
        isNotNull(tournamentStandings.decklist),
        isNotNull(tournamentStandings.placing),
      ),
    );

  let listsWithoutData = allRows.length - usableRows.length;
  const byArchetype = new Map<string, ListPerformanceEntry[]>();
  for (const row of usableRows) {
    const percentile = placementPercentile(row.placing, row.players);
    if (percentile === null || row.decklist === null) {
      listsWithoutData += 1;
      continue;
    }
    const entries = byArchetype.get(row.archetypeId) ?? [];
    entries.push(decklistToPerformanceEntry(row.decklist, percentile));
    byArchetype.set(row.archetypeId, entries);
  }

  return { byArchetype, listsWithoutData };
}

/**
 * Precompute per-archetype card performance deltas for each requested window
 * and replace the corresponding archetype_card_stats rows. Verbatim procedure
 * (plan §3.6, binding):
 *   1. Per window: standings within the online/Bo1/date scope with a usable
 *      decklist AND placing (windowConditions is the shared helper, not
 *      duplicated here).
 *   2. placementPercentile(...); rows that come back null fall out and count
 *      in listsWithoutData.
 *   3. Group by archetypeId; OTHER_ARCHETYPE_ID is skipped entirely — "other"
 *      is not a playable deck (mirrors routes/meta.ts's field-score filter).
 *   4. Archetypes below minLists usable lists → archetypesSkipped, no row
 *      written.
 *   5. computeArchetypeCardStats(...) — the pure Slice-A engine.
 *   6. ONE computedAt for the whole run. Writes happen in one transaction per
 *      (archetype, window): DELETE + chunked INSERT (syncMeta.ts pattern), so
 *      readers never see a half-written state (Postgres MVCC).
 *   7. dryRun:true runs 1-5, writes nothing, returns identical counters.
 */
export async function computeCardStats(
  db: Db,
  opts?: {
    windows?: number[];
    online?: boolean;
    bo1?: boolean;
    minLists?: number;
    confidence?: number;
    dryRun?: boolean;
  },
): Promise<CardStatsJobResult> {
  const windows = opts?.windows ?? DEFAULT_WINDOWS;
  const online = opts?.online ?? true;
  const bo1 = opts?.bo1 ?? true;
  const minLists = opts?.minLists ?? DEFAULT_MIN_LISTS;
  const confidence = opts?.confidence;
  const dryRun = opts?.dryRun ?? false;

  const computedAt = new Date();
  let archetypesProcessed = 0;
  let archetypesSkipped = 0;
  let rowsWritten = 0;
  let listsWithoutData = 0;

  for (const days of windows) {
    const { byArchetype, listsWithoutData: windowListsWithoutData } = await loadWindowEntries(db, {
      days,
      online,
      bo1,
    });
    listsWithoutData += windowListsWithoutData;

    for (const [archetypeId, lists] of byArchetype) {
      if (archetypeId === OTHER_ARCHETYPE_ID) continue; // step 3: not a playable deck

      if (lists.length < minLists) {
        archetypesSkipped += 1;
        continue;
      }
      archetypesProcessed += 1;

      const stats = computeArchetypeCardStats(
        lists,
        confidence === undefined ? undefined : { confidence },
      );
      const rows = stats.map((s) => ({
        archetypeId,
        cardKey: normalizeCardName(s.cardName),
        cardName: s.cardName,
        cardType: s.cardType,
        windowDays: days,
        listsAnalyzed: s.listsAnalyzed,
        listsWith: s.listsWith,
        inclusionPct: s.inclusionPct,
        avgCount: s.avgCount,
        superiorityPct: s.delta?.superiorityPct ?? null,
        deltaPp: s.delta?.deltaPp ?? null,
        lowPct: s.delta?.lowPct ?? null,
        highPct: s.delta?.highPct ?? null,
        effectiveN: s.delta?.effectiveN ?? null,
        meanPercentileWithPct: s.delta?.meanPercentileWithPct ?? null,
        meanPercentileWithoutPct: s.delta?.meanPercentileWithoutPct ?? null,
        significant: s.delta?.significant ?? false,
        tier: s.tier,
        computedAt,
      }));
      rowsWritten += rows.length;

      if (dryRun) continue;

      await db.transaction(async (tx) => {
        await tx
          .delete(archetypeCardStats)
          .where(
            and(
              eq(archetypeCardStats.archetypeId, archetypeId),
              eq(archetypeCardStats.windowDays, days),
            ),
          );
        for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
          await tx.insert(archetypeCardStats).values(rows.slice(i, i + INSERT_CHUNK_SIZE));
        }
      });
    }
  }

  return {
    computedAt: computedAt.toISOString(),
    windows,
    archetypesProcessed,
    archetypesSkipped,
    rowsWritten,
    listsWithoutData,
    dryRun,
  };
}

// CLI entry point: `node dist/jobs/computeCardStats.js [--dry-run]`.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dryRun = process.argv.includes('--dry-run');
  computeCardStats(getDb(), { dryRun })
    .then((r) => console.log('[computeCardStats] done:', r))
    .catch((err) => {
      console.error('[computeCardStats] failed:', err);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
