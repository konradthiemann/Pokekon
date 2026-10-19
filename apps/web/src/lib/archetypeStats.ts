// Personal per-opponent record (pure). Extracted from db/queries.ts so the
// store can scope it to the coached archetype's decks (Spec 7 AC 4) without a
// second fetch; getArchetypeStats() delegates here for the all-decks view.
import { bo1EquivalentWinRate, tournamentWinRatePct } from '@pokekon/shared';
import type { ArchetypeStats, MetaSnapshot, OpponentLog } from '../types';

interface FormatBuckets {
  bo1: { wins: number; losses: number; ties: number };
  bo3: { wins: number; losses: number; ties: number };
  unknown: { wins: number; losses: number; ties: number };
}

function emptyFormatRecord(): { wins: number; losses: number; ties: number } {
  return { wins: 0, losses: 0, ties: 0 };
}

/**
 * Merges the user's personal opponent logs (API) with the latest local meta
 * frequency data to produce one `ArchetypeStats` row per known archetype.
 * Archetypes that appear in meta snapshots but have zero personal logs are
 * still included — their `encounters`, `wins`, `losses`, and `ties` will all
 * be 0, ensuring the UI can surface blind spots.
 *
 * `winRate` is the tie-weighted tournament win rate across ALL logs (a tie
 * counts as a third of a win, see `tournamentWinRatePct`); `bo1EquivalentWinRate`
 * additionally converts Bo3 results back to their Bo1 equivalent and excludes
 * logs with no known `bestOf` (pre-dating the field) from the comparison.
 */
export function computeArchetypeStats(
  logs: readonly OpponentLog[],
  metaSnaps: readonly MetaSnapshot[],
): ArchetypeStats[] {
  const freqMap = new Map(metaSnaps.map((s) => [s.archetype, s.frequencyPct]));
  const metaWRMap = new Map(metaSnaps.map((s) => [s.archetype, s.winRatePct ?? 0]));

  const statsMap = new Map<string, ArchetypeStats>();
  const bucketsMap = new Map<string, FormatBuckets>();

  for (const log of logs) {
    const existing = statsMap.get(log.archetype) ?? {
      archetype: log.archetype,
      encounters: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      winRate: 0,
      frequencyPct: freqMap.get(log.archetype) ?? 0,
      metaWinRate: metaWRMap.get(log.archetype) ?? 0,
      bo1EquivalentWinRate: null,
      bo1Games: 0,
      bo3Games: 0,
      unknownFormatGames: 0,
    };
    const buckets = bucketsMap.get(log.archetype) ?? {
      bo1: emptyFormatRecord(),
      bo3: emptyFormatRecord(),
      unknown: emptyFormatRecord(),
    };
    const bucket =
      log.bestOf === 'BO1' ? buckets.bo1 : log.bestOf === 'BO3' ? buckets.bo3 : buckets.unknown;

    existing.encounters++;
    if (log.result === 'W') {
      existing.wins++;
      bucket.wins++;
    }
    if (log.result === 'L') {
      existing.losses++;
      bucket.losses++;
    }
    if (log.result === 'T') {
      existing.ties++;
      bucket.ties++;
    }
    statsMap.set(log.archetype, existing);
    bucketsMap.set(log.archetype, buckets);
  }

  for (const stats of statsMap.values()) {
    stats.winRate = tournamentWinRatePct(stats.wins, stats.losses, stats.ties, 0) ?? 0;

    const buckets = bucketsMap.get(stats.archetype);
    if (buckets) {
      // 1 decimal, matching the display precision the other win-rate badges
      // in this view use (winRatePct1).
      const bo1Equiv = bo1EquivalentWinRate(buckets, 1);
      stats.bo1EquivalentWinRate = bo1Equiv.winRatePct;
      stats.bo1Games = bo1Equiv.bo1Games;
      stats.bo3Games = bo1Equiv.bo3Games;
      stats.unknownFormatGames = bo1Equiv.unknownGames;
    }
  }

  for (const snap of metaSnaps) {
    if (!statsMap.has(snap.archetype)) {
      statsMap.set(snap.archetype, {
        archetype: snap.archetype,
        encounters: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        winRate: 0,
        frequencyPct: snap.frequencyPct,
        metaWinRate: snap.winRatePct ?? 0,
        bo1EquivalentWinRate: null,
        bo1Games: 0,
        bo3Games: 0,
        unknownFormatGames: 0,
      });
    }
  }

  return [...statsMap.values()].sort(
    (a, b) => b.frequencyPct - a.frequencyPct || b.encounters - a.encounters,
  );
}
