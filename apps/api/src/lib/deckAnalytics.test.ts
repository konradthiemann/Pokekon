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

  it('excludes ties from the win-rate denominator', () => {
    const a = computeDeckAnalytics(1, 4, [
      parsed({ result: 'W' }),
      parsed({ result: 'L' }),
      parsed({ result: 'T' }),
    ]);
    expect(a.record).toMatchObject({ games: 3, wins: 1, losses: 1, ties: 1, winRatePct: 50 });
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
