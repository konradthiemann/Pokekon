import { describe, it, expect } from 'vitest';
import { computeFieldScores, MIN_MATCHUP_GAMES } from './fieldWinRate.js';
import type { ArchetypeShare, MatchupCell } from './fieldWinRate.js';

const share = (id: string, pct: number): ArchetypeShare => ({
  archetypeId: id,
  archetypeName: id.toUpperCase(),
  sharePct: pct,
});

const cell = (deck1: string, deck2: string, winRate: number, total = 100): MatchupCell => ({
  deck1,
  deck2,
  total,
  winRate,
});

describe('computeFieldScores', () => {
  it('weights matchup win rates by opponent share and normalises by covered share', () => {
    // A (20 %) vs B (30 %): A wins 60 % — plus the mirror at 50 %.
    const scores = computeFieldScores(
      [share('a', 20), share('b', 30)],
      [cell('a', 'b', 60), cell('b', 'a', 40)],
    );

    const a = scores.find((s) => s.archetypeId === 'a')!;
    // (20×50 + 30×60) / 50 = 56
    expect(a.fieldWinRatePct).toBe(56);
    expect(a.coveragePct).toBe(100);
    expect(a.mirrorSharePct).toBe(20);

    const b = scores.find((s) => s.archetypeId === 'b')!;
    // (30×50 + 20×40) / 50 = 46
    expect(b.fieldWinRatePct).toBe(46);
  });

  it('ranks by field win rate, not by popularity', () => {
    const scores = computeFieldScores(
      [share('popular', 40), share('sleeper', 10)],
      [cell('popular', 'sleeper', 30), cell('sleeper', 'popular', 70)],
    );
    expect(scores[0]?.archetypeId).toBe('sleeper');
    expect(scores[0]?.rank).toBe(1);
    expect(scores[1]?.rank).toBe(2);
  });

  it('drops matchup cells below the sample-size threshold from coverage', () => {
    const scores = computeFieldScores(
      [share('a', 25), share('b', 75)],
      [cell('a', 'b', 90, MIN_MATCHUP_GAMES - 1)], // too thin to trust
    );
    const a = scores.find((s) => s.archetypeId === 'a')!;
    // Only the mirror (25 of 100 share) is covered → WR stays 50, coverage 25 %.
    expect(a.fieldWinRatePct).toBe(50);
    expect(a.coveragePct).toBe(25);
    expect(a.threats).toHaveLength(0);
    expect(a.freeWins).toHaveLength(0);
  });

  it('classifies covered opponents into threats and free wins by weight', () => {
    const scores = computeFieldScores(
      [share('a', 10), share('big-bad', 30), share('small-bad', 5), share('prey', 20)],
      [
        cell('a', 'big-bad', 40), // lose, common  → heaviest threat
        cell('a', 'small-bad', 20), // lose hard, rare → lighter threat
        cell('a', 'prey', 65), // win, common → free win
      ],
    );
    const a = scores.find((s) => s.archetypeId === 'a')!;
    expect(a.threats.map((t) => t.archetypeId)).toEqual(['big-bad', 'small-bad']);
    // big-bad: 30 × 10 / 100 = 3.0 vs small-bad: 5 × 30 / 100 = 1.5
    expect(a.threats[0]?.weightPct).toBe(3);
    expect(a.threats[1]?.weightPct).toBe(1.5);
    expect(a.freeWins.map((f) => f.archetypeId)).toEqual(['prey']);
    expect(a.freeWins[0]?.weightPct).toBe(3);
  });

  it('falls back to a mirror-only score when no matchup data exists at all', () => {
    const scores = computeFieldScores([share('a', 9), share('b', 91)], []);
    const a = scores.find((s) => s.archetypeId === 'a')!;
    expect(a.fieldWinRatePct).toBe(50);
    expect(a.coveragePct).toBe(9);
  });

  it('handles empty input without dividing by zero', () => {
    expect(computeFieldScores([], [])).toEqual([]);
    const zeroShare = computeFieldScores([{ ...share('a', 0) }], []);
    expect(zeroShare[0]?.coveragePct).toBe(0);
  });
});
