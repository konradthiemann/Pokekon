// Meta-weighted field performance (plan §3.4), shared by the API (producer of
// /api/meta/field-analysis) and the web detail views (consumer contract).
// Pure arithmetic over tournament shares × matchup win rates — no I/O.

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
}

/** Field-weighted performance of one archetype against the current meta. */
export interface FieldScore {
  archetypeId: string;
  archetypeName: string;
  sharePct: number;
  /** Σ share(B) × WR(A vs B) over covered opponents (mirror counts at 50 %),
   *  normalised by the covered share. Null when nothing is covered. */
  fieldWinRatePct: number | null;
  /** Covered share of the field (incl. mirror) relative to the total share, 0–100. */
  coveragePct: number;
  /** The subject's own share — the probability of hitting the mirror. */
  mirrorSharePct: number;
  /** 1-based rank by fieldWinRatePct desc (uncovered archetypes rank last). */
  rank: number;
  /** Covered opponents the subject loses to (WR < 50), heaviest weight first. */
  threats: WeightedMatchup[];
  /** Covered opponents the subject beats (WR > 50), heaviest weight first. */
  freeWins: WeightedMatchup[];
}

/** Matchup cells below this sample size are ignored (mirrors the matrix UI's
 *  MIN_GAMES_FOR_COLOR threshold — small samples are noise, not signal). */
export const MIN_MATCHUP_GAMES = 10;

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Compute the meta-weighted field win rate for every archetype in `shares`:
 * `FieldWR(A) = Σ_B share(B) × WR(A vs B) / Σ_B share(B)` over all opponents B
 * with a usable matchup cell (`total ≥ minGamesPerPair`). The mirror (A vs A)
 * is always covered at 50 % — it needs no data. Opponents without usable data
 * reduce `coveragePct` instead of silently defaulting to 50 %, so a shiny
 * score on thin data is impossible to miss.
 *
 * Returns one FieldScore per input share, sorted by fieldWinRatePct desc
 * (null scores last, ties broken by sharePct desc), with `rank` assigned.
 */
export function computeFieldScores(
  shares: ArchetypeShare[],
  matchups: MatchupCell[],
  opts: { minGamesPerPair?: number } = {},
): FieldScore[] {
  const minGames = opts.minGamesPerPair ?? MIN_MATCHUP_GAMES;

  const cellMap = new Map<string, MatchupCell>();
  for (const m of matchups) {
    cellMap.set(`${m.deck1}|${m.deck2}`, m);
  }

  const totalShare = shares.reduce((sum, s) => sum + s.sharePct, 0);

  const scores = shares.map((subject): FieldScore => {
    let coveredShare = 0;
    let weightedSum = 0;
    const threats: WeightedMatchup[] = [];
    const freeWins: WeightedMatchup[] = [];

    for (const opponent of shares) {
      let winRatePct: number;
      let games: number;

      if (opponent.archetypeId === subject.archetypeId) {
        // The mirror is 50 % by definition — no matchup data required.
        winRatePct = 50;
        games = 0;
      } else {
        const cell = cellMap.get(`${subject.archetypeId}|${opponent.archetypeId}`);
        if (!cell || cell.total < minGames) continue;
        winRatePct = cell.winRate;
        games = cell.total;
      }

      coveredShare += opponent.sharePct;
      weightedSum += opponent.sharePct * winRatePct;

      if (winRatePct === 50) continue;
      const entry: WeightedMatchup = {
        archetypeId: opponent.archetypeId,
        archetypeName: opponent.archetypeName,
        sharePct: opponent.sharePct,
        winRatePct,
        games,
        weightPct: round2((opponent.sharePct * Math.abs(winRatePct - 50)) / 100),
      };
      (winRatePct < 50 ? threats : freeWins).push(entry);
    }

    threats.sort((a, b) => b.weightPct - a.weightPct);
    freeWins.sort((a, b) => b.weightPct - a.weightPct);

    return {
      archetypeId: subject.archetypeId,
      archetypeName: subject.archetypeName,
      sharePct: subject.sharePct,
      fieldWinRatePct: coveredShare > 0 ? round1(weightedSum / coveredShare) : null,
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
