// Meta-weighted field performance (plan §3.4), shared by the API (producer of
// /api/meta/field-analysis) and the web detail views (consumer contract).
// Pure arithmetic over tournament shares × matchup win rates — no I/O.
import { matchupCellInterval, combineIndependentIntervals } from './wilsonInterval.js';
import type { IntervalTerm } from './wilsonInterval.js';

/** An archetype's share of the tournament field within the analysis window. */
export interface ArchetypeShare {
  archetypeId: string; // Limitless deck id (slug), e.g. "n-zoroark"
  archetypeName: string;
  sharePct: number; // 0–100
}

/** One directed matchup cell (win rate is from deck1's perspective). */
export interface MatchupCell {
  deck1: string; // archetypeId (slug)
  deck2: string;
  total: number; // sample size (games)
  winRate: number; // 0–100, deck1 vs deck2
  /** Raw record — preferred source for the Wilson interval when present. */
  wins?: number;
  losses?: number;
  ties?: number;
  /** Precomputed bounds; win over the raw record when both are present. */
  lowPct?: number;
  highPct?: number;
}

/** One opponent's contribution to a field score, weighted by its field share. */
export interface WeightedMatchup {
  archetypeId: string;
  archetypeName: string;
  sharePct: number;
  winRatePct: number; // subject's win rate vs this opponent
  games: number; // sample behind the matchup cell
  /** Expected percentage points gained (freeWins) or lost (threats) vs a
   *  neutral 50 % field: sharePct × |winRatePct − 50| / 100. */
  weightPct: number;
  /** Wilson bounds for this matchup, 1 decimal. */
  lowPct: number;
  highPct: number;
  /** true when the interval excludes 50 %, computed on UNROUNDED bounds. */
  significant: boolean;
}

/** Field-weighted performance of one archetype against the current meta. */
export interface FieldScore {
  archetypeId: string;
  archetypeName: string;
  sharePct: number;
  /** Σ share(B) × WR(A vs B) over covered opponents (mirror counts at 50 %),
   *  normalised by the covered share. Null when nothing is covered. */
  fieldWinRatePct: number | null;
  /** Propagated band around fieldWinRatePct, 1 decimal, clamped to [0,100].
   *  Null exactly when fieldWinRatePct is null. */
  fieldWinRateLowPct: number | null;
  fieldWinRateHighPct: number | null;
  /** Covered share of the field (incl. mirror) relative to the total share,
   *  0–100. SEMANTICS (Spec 3): share of the field with ANY matchup data —
   *  previously share of the field with at least MIN_MATCHUP_GAMES games.
   *  This number typically goes UP under the new contract; it no longer means
   *  "reliable coverage", only "data exists" — the reliability question moved
   *  into the band above (see docs/features.md §15). */
  coveragePct: number;
  /** The subject's own share — the probability of hitting the mirror. */
  mirrorSharePct: number;
  /** 1-based rank by fieldWinRatePct desc (uncovered archetypes rank last). */
  rank: number;
  /** Covered opponents the subject loses to (WR < 50), heaviest weight first,
   *  non-significant intervals sorted behind significant ones. */
  threats: WeightedMatchup[];
  /** Covered opponents the subject beats (WR > 50), heaviest weight first,
   *  non-significant intervals sorted behind significant ones. */
  freeWins: WeightedMatchup[];
}

/** Historical sample-size threshold, kept exported for other in-repo callers
 *  (matrix UI's user-controlled minGames filter, matchupConflict.ts). As of
 *  Spec 3, computeFieldScores below no longer uses this as a model cutoff —
 *  it never drops a cell for having too few games. Every cell with data
 *  counts, and its uncertainty is expressed as a confidence band instead of
 *  being hidden. */
export const MIN_MATCHUP_GAMES = 10;

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const clamp100 = (n: number): number => Math.min(100, Math.max(0, n));

/**
 * Compute the meta-weighted field win rate for every archetype in `shares`:
 * `FieldWR(A) = Σ_B share(B) × WR(A vs B) / Σ_B share(B)` over all opponents B
 * with ANY usable matchup cell data (Spec 3: no minimum sample size — a
 * 1-game cell counts fully, its uncertainty shows up in the propagated band
 * instead of being dropped). The mirror (A vs A) is always covered at 50 % —
 * it needs no data and contributes zero variance to the band. Opponents
 * without any matchup cell (or a cell with total <= 0) reduce `coveragePct`
 * instead of silently defaulting to 50 %.
 *
 * The band (`fieldWinRateLowPct`/`fieldWinRateHighPct`) is the full error
 * propagation of the share-weighted sum of independent per-cell Wilson
 * intervals (`combineIndependentIntervals`, plan §3.0/§3.2) — not a second,
 * independently-invented uncertainty measure.
 *
 * Returns one FieldScore per input share, sorted by fieldWinRatePct desc
 * (null scores last, ties broken by sharePct desc), with `rank` assigned.
 */
export function computeFieldScores(
  shares: ArchetypeShare[],
  matchups: MatchupCell[],
  opts: { confidence?: number } = {},
): FieldScore[] {
  const cellMap = new Map<string, MatchupCell>();
  for (const m of matchups) {
    cellMap.set(`${m.deck1}|${m.deck2}`, m);
  }

  const totalShare = shares.reduce((sum, s) => sum + s.sharePct, 0);

  const scores = shares.map((subject): FieldScore => {
    let coveredShare = 0;
    const terms: IntervalTerm[] = [];
    const threats: WeightedMatchup[] = [];
    const freeWins: WeightedMatchup[] = [];

    for (const opponent of shares) {
      let winRatePct: number;
      let games: number;
      let lowPct: number;
      let highPct: number;
      let significant: boolean;

      if (opponent.archetypeId === subject.archetypeId) {
        // The mirror is 50 % by definition — no matchup data required, and it
        // is a constant, not an estimate: zero variance contribution.
        winRatePct = 50;
        games = 0;
        lowPct = 50;
        highPct = 50;
        significant = false;
      } else {
        const cell = cellMap.get(`${subject.archetypeId}|${opponent.archetypeId}`);
        if (!cell) continue;
        const interval = matchupCellInterval(cell, opts);
        if (!interval) continue;
        winRatePct = cell.winRate;
        games = cell.total;
        lowPct = interval.lowPct;
        highPct = interval.highPct;
        significant = interval.significant;
      }

      coveredShare += opponent.sharePct;
      terms.push({ weight: opponent.sharePct, pct: winRatePct, lowPct, highPct });

      if (winRatePct === 50) continue;
      const entry: WeightedMatchup = {
        archetypeId: opponent.archetypeId,
        archetypeName: opponent.archetypeName,
        sharePct: opponent.sharePct,
        winRatePct,
        games,
        weightPct: round2((opponent.sharePct * Math.abs(winRatePct - 50)) / 100),
        lowPct: round1(lowPct),
        highPct: round1(highPct),
        significant,
      };
      (winRatePct < 50 ? threats : freeWins).push(entry);
    }

    const bySignificanceThenWeight = (a: WeightedMatchup, b: WeightedMatchup): number =>
      Number(b.significant) - Number(a.significant) || b.weightPct - a.weightPct;
    threats.sort(bySignificanceThenWeight);
    freeWins.sort(bySignificanceThenWeight);

    const combined = coveredShare > 0 ? combineIndependentIntervals(terms) : null;

    return {
      archetypeId: subject.archetypeId,
      archetypeName: subject.archetypeName,
      sharePct: subject.sharePct,
      fieldWinRatePct: combined ? round1(combined.pct) : null,
      fieldWinRateLowPct: combined ? round1(clamp100(combined.lowPct)) : null,
      fieldWinRateHighPct: combined ? round1(clamp100(combined.highPct)) : null,
      coveragePct: totalShare > 0 ? round1((coveredShare / totalShare) * 100) : 0,
      mirrorSharePct: subject.sharePct,
      rank: 0, // assigned below, after sorting
      threats,
      freeWins,
    };
  });

  scores.sort((a, b) => {
    if (a.fieldWinRatePct === null && b.fieldWinRatePct === null) return b.sharePct - a.sharePct;
    if (a.fieldWinRatePct === null) return 1;
    if (b.fieldWinRatePct === null) return -1;
    return b.fieldWinRatePct - a.fieldWinRatePct || b.sharePct - a.sharePct;
  });
  scores.forEach((s, i) => {
    s.rank = i + 1;
  });

  return scores;
}
