import { and, desc, eq } from 'drizzle-orm';
import type { ArchetypeCardStat, CardPerformanceDelta } from '@pokekon/shared';
import type { Db } from '../db/index.js';
import { archetypeCardStats } from '../db/schema.js';

export interface CardStatsBatch {
  computedAt: Date | null;
  windowDays: number;
  listsAnalyzed: number;
  cards: ArchetypeCardStat[];
}

/** Reads the precomputed rows for one (archetype, window). NO lazy seed
 *  (unlike lib/matchupData.ts's ensureMatchups): computing them on a read
 *  would turn one request into a multi-second job. An empty table (or an
 *  archetype that was never computed) is an honestly empty result —
 *  `computedAt: null`, `cards: []` — not an error state. */
export async function loadCardStats(
  db: Db,
  archetypeId: string,
  windowDays: number,
): Promise<CardStatsBatch> {
  const rows = await db
    .select()
    .from(archetypeCardStats)
    .where(
      and(
        eq(archetypeCardStats.archetypeId, archetypeId),
        eq(archetypeCardStats.windowDays, windowDays),
      ),
    )
    // All rows of one (archetype, window) share the same computedAt (one
    // stamp per job run) — the ordering only matters if the table ever holds
    // a race between two runs, which db.transaction per (archetype, window)
    // prevents in practice, but this is defensive and free.
    .orderBy(desc(archetypeCardStats.computedAt));

  if (rows.length === 0) {
    return { computedAt: null, windowDays, listsAnalyzed: 0, cards: [] };
  }

  const cards: ArchetypeCardStat[] = rows.map((r) => {
    const delta: CardPerformanceDelta | null =
      r.superiorityPct === null ||
      r.deltaPp === null ||
      r.lowPct === null ||
      r.highPct === null ||
      r.effectiveN === null ||
      r.meanPercentileWithPct === null ||
      r.meanPercentileWithoutPct === null
        ? null
        : {
            listsWith: r.listsWith,
            listsWithout: r.listsAnalyzed - r.listsWith,
            superiorityPct: r.superiorityPct,
            deltaPp: r.deltaPp,
            lowPct: r.lowPct,
            highPct: r.highPct,
            widthPct: r.highPct - r.lowPct,
            significant: r.significant,
            effectiveN: r.effectiveN,
            meanPercentileWithPct: r.meanPercentileWithPct,
            meanPercentileWithoutPct: r.meanPercentileWithoutPct,
          };

    return {
      cardName: r.cardName,
      cardType: r.cardType as ArchetypeCardStat['cardType'],
      listsAnalyzed: r.listsAnalyzed,
      listsWith: r.listsWith,
      inclusionPct: r.inclusionPct,
      avgCount: r.avgCount,
      delta,
      tier: r.tier as ArchetypeCardStat['tier'],
    };
  });

  return {
    computedAt: rows[0]!.computedAt,
    windowDays,
    listsAnalyzed: rows[0]!.listsAnalyzed,
    cards,
  };
}
