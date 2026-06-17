import type { PrizePoint } from '@pokekon/shared';
import type { MatchResult } from '../db/schema.js';

/** One match row feeding the analytics aggregation (opponent_log ⨝ match_log_parsed). */
export interface AnalyticsRow {
  result: MatchResult;
  /** null when the game has no parsed battle log. */
  wentFirst: boolean | null;
  setupCleanByTurn2: boolean | null;
  deadTurns: number | null;
  prizeProgression: PrizePoint[] | null;
}

export interface WinRateBlock {
  games: number;
  wins: number;
  losses: number;
  ties: number;
  /** wins / (wins + losses) as a percentage, or null when no game was decided. */
  winRatePct: number | null;
}

export interface DeckAnalytics {
  deckId: number;
  weeks: number;
  /** Record over all logs in the window (parsed or not). */
  record: WinRateBlock;
  /** Win rate among parsed games where the player went first / second. */
  goingFirst: WinRateBlock;
  goingSecond: WinRateBlock;
  setup: {
    parsedGames: number;
    cleanByTurn2: number;
    /** Share of parsed games with a clean setup by turn 2, as a percentage. */
    cleanRatePct: number | null;
  };
  deadTurns: {
    parsedGames: number;
    /** Average dead (zero-activity) turns per parsed game. */
    avgPerGame: number | null;
  };
  /** Average remaining prizes per turn across WON games (the "winning curve"). */
  prizeCurveWins: { turn: number; avgPrizesRemaining: number; games: number }[];
}

function round(value: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

function winRateBlock(results: MatchResult[]): WinRateBlock {
  const wins = results.filter((r) => r === 'W').length;
  const losses = results.filter((r) => r === 'L').length;
  const ties = results.filter((r) => r === 'T').length;
  const decided = wins + losses;
  return {
    games: results.length,
    wins,
    losses,
    ties,
    winRatePct: decided === 0 ? null : round((wins / decided) * 100),
  };
}

/**
 * Aggregates the turn-quality metrics from plan §3.7.1 over the matches in the
 * selected time window: overall record, going-first/second win rate, clean-setup
 * share, dead-turn rate, and the average prize curve of won games. Pure — the
 * route does the DB query + window filter and hands the rows here.
 */
export function computeDeckAnalytics(
  deckId: number,
  weeks: number,
  rows: AnalyticsRow[],
): DeckAnalytics {
  const parsed = rows.filter((r) => r.wentFirst !== null);

  const first = parsed.filter((r) => r.wentFirst === true);
  const second = parsed.filter((r) => r.wentFirst === false);

  const setupParsed = rows.filter((r) => r.setupCleanByTurn2 !== null);
  const cleanByTurn2 = setupParsed.filter((r) => r.setupCleanByTurn2 === true).length;

  const deadParsed = rows.filter((r) => r.deadTurns !== null);
  const deadTotal = deadParsed.reduce((sum, r) => sum + (r.deadTurns ?? 0), 0);

  // Average the player's own remaining prizes (p1) per turn across won games.
  const wonCurves = rows
    .filter((r) => r.result === 'W' && r.prizeProgression !== null)
    .map((r) => r.prizeProgression as PrizePoint[]);
  const prizeByTurn = new Map<number, { sum: number; count: number }>();
  for (const curve of wonCurves) {
    for (const point of curve) {
      const acc = prizeByTurn.get(point.turn) ?? { sum: 0, count: 0 };
      acc.sum += point.p1;
      acc.count += 1;
      prizeByTurn.set(point.turn, acc);
    }
  }
  const prizeCurveWins = [...prizeByTurn.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([turn, { sum, count }]) => ({
      turn,
      avgPrizesRemaining: round(sum / count, 2),
      games: count,
    }));

  return {
    deckId,
    weeks,
    record: winRateBlock(rows.map((r) => r.result)),
    goingFirst: winRateBlock(first.map((r) => r.result)),
    goingSecond: winRateBlock(second.map((r) => r.result)),
    setup: {
      parsedGames: setupParsed.length,
      cleanByTurn2,
      cleanRatePct:
        setupParsed.length === 0 ? null : round((cleanByTurn2 / setupParsed.length) * 100),
    },
    deadTurns: {
      parsedGames: deadParsed.length,
      avgPerGame: deadParsed.length === 0 ? null : round(deadTotal / deadParsed.length, 2),
    },
    prizeCurveWins,
  };
}
