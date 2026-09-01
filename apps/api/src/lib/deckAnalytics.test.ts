import { describe, it, expect } from 'vitest';
import { computeDeckAnalytics, type AnalyticsRow } from './deckAnalytics.js';

const parsed = (over: Partial<AnalyticsRow>): AnalyticsRow => ({
  result: 'W',
  wentFirst: true,
  setupCleanByTurn2: true,
  deadTurns: 0,
  prizeProgression: [
    { label: 'Start', turn: 0, p1: 6, p2: 6 },
    { label: 'Z1', turn: 1, p1: 4, p2: 6 },
  ],
  ...over,
});

describe('computeDeckAnalytics', () => {
  it('returns null rates and an empty curve for no games', () => {
    const a = computeDeckAnalytics(1, 4, []);
    expect(a.record.winRatePct).toBeNull();
    expect(a.goingFirst.winRatePct).toBeNull();
    expect(a.setup.cleanRatePct).toBeNull();
    expect(a.deadTurns.avgPerGame).toBeNull();
    expect(a.prizeCurveWins).toEqual([]);
  });

  // Deliberate, non-silent replacement of the previous naive-formula test
  // (plan `.claude/plans/personal-data-role-rework.md` §6, "Entscheidungen
  // (bestätigt 2026-09-01)" #1 — one of the five Spec-2 laggards explicitly
  // carried over into this plan so the whole repo has exactly one win-rate
  // formula, `tournamentWinRatePct` from `@pokekon/shared/winRate`). The old
  // test asserted `winRatePct: 50` for 1W/1L/1T by EXCLUDING the tie from the
  // denominator (wins/(wins+losses)). That is no longer the intended
  // behaviour — see tdd.md "never silently reconcile a conflicting contract".
  it('counts ties as a third of a win in the win-rate (tie-weighted formula, plan §6 decision 1)', () => {
    const a = computeDeckAnalytics(1, 4, [
      parsed({ result: 'W' }),
      parsed({ result: 'W' }),
      parsed({ result: 'L' }),
      parsed({ result: 'T' }),
      parsed({ result: 'T' }),
      parsed({ result: 'T' }),
    ]);
    // Naive (old) formula: wins/(wins+losses) = 2/3 ≈ 67 %.
    // Tie-weighted (new, tournamentWinRatePct): (2 + 3*(1/3)) / 6 = 3/6 = 50 %.
    expect(a.record).toMatchObject({ games: 6, wins: 2, losses: 1, ties: 3, winRatePct: 50 });
  });

  it('counts unparsed games in the record but not in turn-quality metrics', () => {
    const unparsed: AnalyticsRow = {
      result: 'W',
      wentFirst: null,
      setupCleanByTurn2: null,
      deadTurns: null,
      prizeProgression: null,
    };
    const a = computeDeckAnalytics(1, 4, [parsed({ wentFirst: true }), unparsed]);
    expect(a.record.games).toBe(2);
    expect(a.goingFirst.games).toBe(1);
    expect(a.setup.parsedGames).toBe(1);
    expect(a.deadTurns.parsedGames).toBe(1);
  });

  it('averages remaining prizes per turn across won games only', () => {
    const a = computeDeckAnalytics(1, 4, [
      parsed({
        result: 'W',
        prizeProgression: [{ label: 'Z1', turn: 1, p1: 4, p2: 6 }],
      }),
      parsed({
        result: 'W',
        prizeProgression: [{ label: 'Z1', turn: 1, p1: 2, p2: 6 }],
      }),
      parsed({
        result: 'L',
        prizeProgression: [{ label: 'Z1', turn: 1, p1: 6, p2: 6 }],
      }),
    ]);
    const turn1 = a.prizeCurveWins.find((p) => p.turn === 1);
    expect(turn1).toMatchObject({ avgPrizesRemaining: 3, games: 2 }); // (4+2)/2, loss excluded
  });
});
