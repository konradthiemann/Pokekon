// Personal-prior blending (Spec 10 Slice E, specs/archetype-meta-analysis.md).
// Adjusts a cluster's global win rate (Slice B) toward the user's OWN track
// record, but only once there is enough of it to mean something — a lucky
// or unlucky handful of personal games must not swamp a well-supported
// global number. Pure function, no I/O, same shape as fieldWinRate.ts.
import { tournamentWinRatePct } from './winRate.js';

/** Below this many personal games, the own record is not used at all —
 *  consistent with `MyMatchupsTable`'s existing `encounters < 5` "not enough
 *  data" threshold (`apps/web/src/components/meta/MyMatchupsTable.tsx`), so
 *  "too little data" means the same thing everywhere in the product. */
export const DEFAULT_MIN_OWN_GAMES = 5;

/** How many global games one personal game is "worth" when computing the
 *  own/global blend weight (see `blendWithPersonalPrior` below) — a smaller
 *  value lets personal data dominate sooner. Tunable, not yet validated
 *  against real usage data (spec "Offene Fragen"). */
export const DEFAULT_GLOBAL_SAMPLE_EQUIVALENT = 20;

/** Hard ceiling on how much weight personal data can ever carry, even with
 *  an overwhelming personal sample — the global number always keeps SOME
 *  influence, since a personal record still reflects only the opponents
 *  this one pilot happened to face, not the whole field. */
export const DEFAULT_MAX_OWN_WEIGHT = 0.7;

export interface PersonalRecord {
  wins: number;
  losses: number;
  ties: number;
}

export interface PersonalPriorBlend {
  /** The number actually recommended: a weighted mix of the personal and
   *  cluster win rate when personal data is used, otherwise exactly
   *  `clusterWinRatePct` unchanged. */
  blendedPct: number;
  /** false ⇒ `blendedPct === clusterWinRatePct`; the UI should say so
   *  explicitly rather than imply a personal adjustment happened. */
  usedPersonalData: boolean;
  /** 0 when personal data isn't used; otherwise in (0, maxOwnWeight]. */
  ownWeight: number;
  /** Tie-weighted personal win rate; null when there were 0 personal games
   *  at all (encounters < minOwnGames doesn't imply this — a below-threshold
   *  but non-zero record still returns a rate here for transparency). */
  ownWinRatePct: number | null;
}

/**
 * Blends a cluster's global win rate with the user's own record against/with
 * this archetype. `ownWeight` grows with the personal sample size
 * (`encounters / (encounters + globalSampleEquivalent)`), capped at
 * `maxOwnWeight` — enough games and your own experience can meaningfully
 * shift the number, but never fully replace the global evidence.
 */
export function blendWithPersonalPrior(
  clusterWinRatePct: number,
  personalRecord: PersonalRecord,
  opts?: {
    minOwnGames?: number;
    globalSampleEquivalent?: number;
    maxOwnWeight?: number;
  },
): PersonalPriorBlend {
  const minOwnGames = opts?.minOwnGames ?? DEFAULT_MIN_OWN_GAMES;
  const globalSampleEquivalent = opts?.globalSampleEquivalent ?? DEFAULT_GLOBAL_SAMPLE_EQUIVALENT;
  const maxOwnWeight = opts?.maxOwnWeight ?? DEFAULT_MAX_OWN_WEIGHT;

  const { wins, losses, ties } = personalRecord;
  const encounters = wins + losses + ties;
  const ownWinRatePct = tournamentWinRatePct(wins, losses, ties);

  if (encounters < minOwnGames || ownWinRatePct === null) {
    return { blendedPct: clusterWinRatePct, usedPersonalData: false, ownWeight: 0, ownWinRatePct };
  }

  const ownWeight = Math.min(encounters / (encounters + globalSampleEquivalent), maxOwnWeight);
  const blendedPct = ownWeight * ownWinRatePct + (1 - ownWeight) * clusterWinRatePct;

  return { blendedPct, usedPersonalData: true, ownWeight, ownWinRatePct };
}
