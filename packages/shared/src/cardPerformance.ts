// Card-performance calculation layer (plan
// .claude/plans/recommendation-to-prognosis.md §3.0-§3.4, Slice A). Pure
// arithmetic over tournament placement percentiles per archetype list -- no
// I/O, same shape as fieldWinRate.ts.
//
// Why theta instead of a raw percentile-mean difference (plan §3.0, in full):
// a placement percentile is ordinal, not a Bernoulli trial, so applying
// Wilson to the mean percentile directly would use the wrong variance
// (p(1-p) instead of the ~1/12 uniform variance) and reject almost every
// card as "not enough data". Instead this module estimates the Mann-Whitney
// probability of superiority theta = P(X_with > X_without) + 0.5 *
// P(X_with == X_without) -- itself a proportion in [0,1], so Wilson is
// legitimately applicable to it. The bridge is an effective sample size that
// makes a Wilson interval on theta-hat reproduce the EXACT Mann-Whitney null
// variance (derived in the plan): n_eff = 3*n1*n2/(n1+n2+1). This lets
// wilsonInterval() be reused verbatim -- the repo rule is exactly one Wilson
// implementation, never a second one.
import { wilsonInterval } from './wilsonInterval.js';

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

// ---------------------------------------------------------------------------
// 3.1 -- constants + basic building blocks
// ---------------------------------------------------------------------------

/** Inclusion thresholds mirrored from apps/web/src/lib/deckComparison.ts:247-250.
 *  Exported so the signal classification and the existing filters cannot
 *  drift apart. The VALUES are unchanged -- Spec 5 "Out of Scope" forbids
 *  touching the copy-frequency logic itself. */
export const HIGH_INCLUSION_PCT = 55;
export const LOW_INCLUSION_PCT = 20;

/** Above this band width (percentage points on theta x 100) a delta is
 *  reported as "no prognosis possible" rather than as a number. NOT a
 *  sample-size cutoff: it is derived from the uncertainty itself, so a small
 *  but consistent sample can still qualify while a large but noisy one does
 *  not. Tuned value, see plan section 6, open question 3. */
export const MAX_USABLE_BAND_PP = 40;

/**
 * Canonical key for matching card names across sources (our DB decklists and
 * the Limitless client fetch): lowercase, trimmed, inner whitespace collapsed
 * to a single space. Set/number are NOT part of the key -- two printings of
 * the same card are the same card for this analysis. Punctuation and
 * apostrophes are deliberately NOT normalised: both sources are Limitless,
 * so the spelling is identical, and a lossy normalisation would risk merging
 * distinct cards.
 */
export function normalizeCardName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Placement percentile in [0,1]: the fraction of the field this pilot
 * finished ahead of. 1 = won the event, 0 = last. Returns null when the
 * value carries no information: placing missing/non-finite/< 1, or
 * totalPlayers < 2 (a one-player event ranks nobody).
 *   percentile = clamp((totalPlayers - placing) / (totalPlayers - 1), 0, 1)
 */
export function placementPercentile(
  placing: number | null | undefined,
  totalPlayers: number,
): number | null {
  if (placing == null || !Number.isFinite(placing) || placing < 1) return null;
  if (!Number.isFinite(totalPlayers) || totalPlayers < 2) return null;
  return clamp01((totalPlayers - placing) / (totalPlayers - 1));
}

// ---------------------------------------------------------------------------
// 3.2 -- rank comparison and effective sample size
// ---------------------------------------------------------------------------

/**
 * Mann-Whitney probability of superiority:
 *   theta = ( #{a > b} + 0.5 * #{a == b} ) / (n_a * n_b)
 * over all pairs. Returns null when either group is empty. A naive
 * O(n_a * n_b) implementation is acceptable at this data scale (tens to low
 * hundreds of lists per archetype).
 */
export function mannWhitneyTheta(withValues: number[], withoutValues: number[]): number | null {
  if (withValues.length === 0 || withoutValues.length === 0) return null;

  let wins = 0;
  for (const a of withValues) {
    for (const b of withoutValues) {
      if (a > b) wins += 1;
      else if (a === b) wins += 0.5;
    }
  }
  return wins / (withValues.length * withoutValues.length);
}

/**
 * Effective sample size that makes a Wilson interval on theta-hat reproduce
 * the exact Mann-Whitney null variance (plan section 3.0):
 *   n_eff = 3 * n1 * n2 / (n1 + n2 + 1)
 * Bounded above by 3*min(n1,n2) as the other group grows -- an unbalanced
 * comparison never earns more effective evidence than three times its
 * smaller side, no "at least 10 per group" heuristic needed. Returns 0 when
 * either group is empty.
 */
export function rankEffectiveSampleSize(n1: number, n2: number): number {
  if (n1 <= 0 || n2 <= 0) return 0;
  return (3 * n1 * n2) / (n1 + n2 + 1);
}

// ---------------------------------------------------------------------------
// 3.3 -- the delta with confidence band
// ---------------------------------------------------------------------------

export interface CardPerformanceDelta {
  /** Lists of this archetype that include / do not include the card. */
  listsWith: number;
  listsWithout: number;
  /** Mann-Whitney theta x 100. 50 = no difference. Rounded to 1 decimal. */
  superiorityPct: number;
  /** superiorityPct - 50: the headline delta in percentage points, signed.
   *  NOT a Field-WR delta -- see plan section 0.1 and 3.0. */
  deltaPp: number;
  /** Wilson band on superiorityPct, 1 decimal, clamped to [0,100]. */
  lowPct: number;
  highPct: number;
  /** highPct - lowPct, 1 decimal. Feeds confidenceTier() in the UI. */
  widthPct: number;
  /** true when the band excludes 50 -- same meaning as
   *  WeightedMatchup.significant. Computed on the UNROUNDED bounds. */
  significant: boolean;
  /** 3*n1*n2/(n1+n2+1), 2 decimals. Exposed so the UI can be honest about it. */
  effectiveN: number;
  /** Descriptive only, NO confidence interval attached: mean placement
   *  percentile per group x 100. There to make the number tangible, never as
   *  a second inferential statistic. 1 decimal. */
  meanPercentileWithPct: number;
  meanPercentileWithoutPct: number;
}

/**
 * Confidence-aware performance delta between two groups of placement
 * percentiles (values in [0,1]). Returns null when either group is empty --
 * that is undefinedness, not a cutoff.
 *
 * Method (plan section 3.0): theta-hat = mannWhitneyTheta(...), n_eff =
 * rankEffectiveSampleSize(...), band = wilsonInterval(theta*n_eff,
 * (1-theta)*n_eff, 0, opts). The Wilson implementation is REUSED, never
 * re-derived (repo rule: exactly one Wilson implementation).
 */
export function cardPerformanceDelta(
  withPercentiles: number[],
  withoutPercentiles: number[],
  opts?: { confidence?: number },
): CardPerformanceDelta | null {
  const theta = mannWhitneyTheta(withPercentiles, withoutPercentiles);
  if (theta === null) return null;

  const n1 = withPercentiles.length;
  const n2 = withoutPercentiles.length;
  const nEff = rankEffectiveSampleSize(n1, n2);

  const band = wilsonInterval(theta * nEff, (1 - theta) * nEff, 0, opts);
  if (!band) return null; // unreachable given theta !== null (both groups non-empty -> nEff > 0)

  const meanWith = withPercentiles.reduce((sum, v) => sum + v, 0) / n1;
  const meanWithout = withoutPercentiles.reduce((sum, v) => sum + v, 0) / n2;

  const superiorityPct = round1(band.pct);

  return {
    listsWith: n1,
    listsWithout: n2,
    superiorityPct,
    deltaPp: round1(superiorityPct - 50),
    lowPct: round1(band.lowPct),
    highPct: round1(band.highPct),
    widthPct: round1(band.widthPct),
    significant: band.significant,
    effectiveN: round2(nEff),
    meanPercentileWithPct: round1(meanWith * 100),
    meanPercentileWithoutPct: round1(meanWithout * 100),
  };
}

// ---------------------------------------------------------------------------
// 3.4 -- aggregation over a whole archetype
// ---------------------------------------------------------------------------

export const CARD_KIND_VALUES = ['pokemon', 'trainer', 'energy'] as const;
type CardKind = (typeof CARD_KIND_VALUES)[number];

/** One published tournament list, reduced to what this analysis needs.
 *  Produced by the API job from tournament_standings joined with
 *  tournaments. */
export interface ListPerformanceEntry {
  /** Copies per NORMALISED card name, summed across printings within this
   *  one list. A card appearing twice (two sets) is ONE inclusion with the
   *  summed count -- the per-entry counting of deckComparison.ts:200-213
   *  (plan section 0.3) is deliberately not reproduced here. */
  counts: Record<string, number>;
  /** Display name per normalised key, for round-tripping to the UI. */
  displayNames: Record<string, string>;
  /** Card type per normalised key. A conflict (same name in two groups)
   *  resolves to the first seen -- deterministic, and a non-issue in
   *  practice. */
  cardTypes: Record<string, CardKind>;
  /** placementPercentile(...) of this list, already in [0,1]. */
  percentile: number;
}

export const CARD_SIGNAL_TIER_VALUES = [
  /** No prognosis: a group is empty, or the band is wider than
   *  MAX_USABLE_BAND_PP. */
  'insufficient',
  /** Popular AND significantly positive -- the staple that earns its slot. */
  'confirmed',
  /** Rarely played AND significantly positive -- the underplayed candidate. */
  'hiddenGem',
  /** Popular BUT the delta is negative or its band still contains 50 -- the
   *  popularity paradox at card level. */
  'popularityParadox',
  /** Significantly negative and not popular. */
  'discouraged',
  /** Everything else: measurable, but nothing to say. */
  'neutral',
] as const;
export type CardSignalTier = (typeof CARD_SIGNAL_TIER_VALUES)[number];

export interface ArchetypeCardStat {
  /** Display name (first spelling seen); normalizeCardName(cardName) is the
   *  key. */
  cardName: string;
  cardType: CardKind;
  /** Lists of this archetype with a usable percentile (the denominator). */
  listsAnalyzed: number;
  listsWith: number;
  /** listsWith / listsAnalyzed x 100, 1 decimal. This is the DB-side
   *  inclusion rate -- it is NOT the number that drives the 55/20
   *  thresholds (those stay on deckComparison.ts's Limitless data, plan
   *  section 0.3 / 6 risk 5). */
  inclusionPct: number;
  /** Mean copies among including lists, 1 decimal. */
  avgCount: number;
  delta: CardPerformanceDelta | null;
  tier: CardSignalTier;
}

interface CardAccumulator {
  cardName: string;
  cardType: CardKind;
  includingListIndexes: Set<number>;
  copyCounts: number[];
}

/**
 * Split every distinct card of one archetype's published lists into
 * with/without groups and compute its performance delta. Pure, no I/O.
 * Lists without a usable percentile must be filtered out BEFORE calling
 * this. Result sorted by inclusionPct desc, then cardName asc (stable and
 * testable).
 */
export function computeArchetypeCardStats(
  lists: ListPerformanceEntry[],
  opts?: { confidence?: number; maxBandPp?: number },
): ArchetypeCardStat[] {
  const accumulators = new Map<string, CardAccumulator>();

  lists.forEach((list, listIndex) => {
    for (const [rawKey, count] of Object.entries(list.counts)) {
      const key = normalizeCardName(rawKey);
      let accumulator = accumulators.get(key);
      if (!accumulator) {
        accumulator = {
          cardName: list.displayNames[rawKey] ?? rawKey,
          cardType: list.cardTypes[rawKey],
          includingListIndexes: new Set<number>(),
          copyCounts: [],
        };
        accumulators.set(key, accumulator);
      }
      accumulator.includingListIndexes.add(listIndex);
      accumulator.copyCounts.push(count);
    }
  });

  const allPercentiles = lists.map((list) => list.percentile);

  const stats: ArchetypeCardStat[] = [];
  for (const accumulator of accumulators.values()) {
    const withPercentiles: number[] = [];
    const withoutPercentiles: number[] = [];
    allPercentiles.forEach((percentile, listIndex) => {
      if (accumulator.includingListIndexes.has(listIndex)) {
        withPercentiles.push(percentile);
      } else {
        withoutPercentiles.push(percentile);
      }
    });

    const listsWith = withPercentiles.length;
    const listsAnalyzed = lists.length;
    const inclusionPct = listsAnalyzed > 0 ? round1((listsWith / listsAnalyzed) * 100) : 0;
    const avgCount = round1(
      accumulator.copyCounts.reduce((sum, c) => sum + c, 0) / accumulator.copyCounts.length,
    );
    const delta = cardPerformanceDelta(withPercentiles, withoutPercentiles, {
      confidence: opts?.confidence,
    });
    const tier = classifyCardSignal(inclusionPct, delta, { maxBandPp: opts?.maxBandPp });

    stats.push({
      cardName: accumulator.cardName,
      cardType: accumulator.cardType,
      listsAnalyzed,
      listsWith,
      inclusionPct,
      avgCount,
      delta,
      tier,
    });
  }

  stats.sort((a, b) => b.inclusionPct - a.inclusionPct || (a.cardName < b.cardName ? -1 : 1));
  return stats;
}

/** Pure classification -- the single place that decides which case the UI
 *  is looking at. The UI picks colours and labels from the tier, never
 *  re-derives it from raw numbers. Order is binding, first match wins (plan
 *  section 3.4): rule 1 (insufficient) is checked BEFORE rule 4
 *  (popularityParadox) so a popular staple backed by only a few comparison
 *  lists reads as "not enough data", never as a popularity paradox. */
export function classifyCardSignal(
  inclusionPct: number,
  delta: CardPerformanceDelta | null,
  opts?: { maxBandPp?: number },
): CardSignalTier {
  const maxBandPp = opts?.maxBandPp ?? MAX_USABLE_BAND_PP;

  if (delta === null || delta.widthPct > maxBandPp) return 'insufficient';
  if (delta.significant && delta.deltaPp > 0 && inclusionPct >= HIGH_INCLUSION_PCT) {
    return 'confirmed';
  }
  if (delta.significant && delta.deltaPp > 0) return 'hiddenGem';
  if (inclusionPct >= HIGH_INCLUSION_PCT && (delta.deltaPp <= 0 || !delta.significant)) {
    return 'popularityParadox';
  }
  if (delta.significant && delta.deltaPp < 0) return 'discouraged';
  return 'neutral';
}
