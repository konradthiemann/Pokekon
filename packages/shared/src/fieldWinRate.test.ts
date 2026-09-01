import { describe, it, expect } from 'vitest';
import { computeFieldScores } from './fieldWinRate.js';
import type { ArchetypeShare, MatchupCell } from './fieldWinRate.js';

const share = (id: string, pct: number): ArchetypeShare => ({
  archetypeId: id,
  archetypeName: id.toUpperCase(),
  sharePct: pct,
});

/**
 * `total`/`winRate` alone reconstructs a Wilson interval (matchupCellInterval
 * case 3); passing `counts` switches the cell to the raw wins/losses/ties
 * record (case 2), which takes precedence. Both forms stay valid per plan
 * §3.3 — this is the same `cell()` helper `:11-16` used before Spec 3, kept
 * backward compatible.
 */
const cell = (
  deck1: string,
  deck2: string,
  winRate: number,
  total = 100,
  counts?: { wins: number; losses: number; ties?: number },
): MatchupCell => ({
  deck1,
  deck2,
  total,
  winRate,
  ...(counts ? { wins: counts.wins, losses: counts.losses, ties: counts.ties ?? 0 } : {}),
});

describe('computeFieldScores', () => {
  it('weights matchup win rates by opponent share, normalises by covered share, and propagates a confidence band (plan §3.4 row 1)', () => {
    // a: 20 % share, mirror at 50 %; a vs b 8W/2L (weight 30); a vs c 300W/200L (weight 50).
    // F = (20×50 + 30×80 + 50×60) / 100 = 64.
    const scores = computeFieldScores(
      [share('a', 20), share('b', 30), share('c', 50)],
      [
        cell('a', 'b', 80, 10, { wins: 8, losses: 2 }),
        cell('a', 'c', 60, 500, { wins: 300, losses: 200 }),
      ],
    );

    const a = scores.find((s) => s.archetypeId === 'a')!;
    expect(a.fieldWinRatePct).toBe(64);
    expect(a.fieldWinRateLowPct).toBe(54.5);
    expect(a.fieldWinRateHighPct).toBe(68.8);
    expect(a.coveragePct).toBe(100);
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

  // REWRITTEN (Spec 3, plan §4 step 5): the old test here — "drops matchup
  // cells below the sample-size threshold from coverage" — asserted
  // coveragePct === 25 for a 9-game cell, i.e. it verified the exact
  // MIN_MATCHUP_GAMES cutoff behaviour Spec 3 abolishes. That assertion is
  // now categorically wrong under the new contract: a thin cell counts fully
  // in coverage, its uncertainty shows up in the band instead of vanishing
  // it. Deliberate, not a silent edit — see plan §0 "Bestehende Tests" and
  // Wertetabelle §3.4 row 2 (25/75 shares, a→b 8W/1L, 9 games).
  it('counts a thin sample-size cell fully instead of dropping it (plan §3.4 row 2)', () => {
    const scores = computeFieldScores(
      [share('a', 25), share('b', 75)],
      [cell('a', 'b', 88.9, 9, { wins: 8, losses: 1 })],
    );
    const a = scores.find((s) => s.archetypeId === 'a')!;
    expect(a.coveragePct).toBe(100); // previously 25 under the old cutoff
    expect(a.freeWins.map((f) => f.archetypeId)).toEqual(['b']);
    expect(a.freeWins[0]?.significant).toBe(true);
    expect(a.threats).toHaveLength(0);
  });

  it('reconstructs the interval from total + winRate alone when no raw counts are given (plan §3.4 row 3)', () => {
    const scores = computeFieldScores(
      [share('a', 25), share('b', 75)],
      [cell('a', 'b', 90, 9)], // Fall 3 — no wins/losses/ties on the cell
    );
    const a = scores.find((s) => s.archetypeId === 'a')!;
    expect(a.coveragePct).toBe(100);
    expect(a.fieldWinRateLowPct).not.toBeNull();
    expect(a.fieldWinRateHighPct).not.toBeNull();
    expect(a.fieldWinRateLowPct!).toBeLessThan(a.fieldWinRatePct!);
    expect(a.fieldWinRatePct!).toBeLessThan(a.fieldWinRateHighPct!);
  });

  it('classifies covered opponents into threats and free wins by weight, each carrying a band + significance (plan §3.4 row 4)', () => {
    const scores = computeFieldScores(
      [share('a', 10), share('big-bad', 30), share('small-bad', 5), share('prey', 20)],
      [
        cell('a', 'big-bad', 40), // lose, common (n=100)  → heaviest threat, significant
        cell('a', 'small-bad', 20), // lose hard, rare (n=100) → lighter threat, significant
        cell('a', 'prey', 65), // win, common (n=100) → free win
      ],
    );
    const a = scores.find((s) => s.archetypeId === 'a')!;
    expect(a.threats.map((t) => t.archetypeId)).toEqual(['big-bad', 'small-bad']);
    expect(a.threats[0]?.weightPct).toBe(3);
    expect(a.threats[1]?.weightPct).toBe(1.5);
    expect(a.threats.every((t) => t.significant)).toBe(true);
    expect(
      a.threats.every((t) => typeof t.lowPct === 'number' && typeof t.highPct === 'number'),
    ).toBe(true);
    expect(a.freeWins.map((f) => f.archetypeId)).toEqual(['prey']);
    expect(a.freeWins[0]?.weightPct).toBe(3);
  });

  it('sorts a non-significant threat behind a significant one, even at lower weight (plan §3.4 row 5)', () => {
    const scores = computeFieldScores(
      [share('a', 10), share('big-bad', 30), share('small-bad', 5), share('prey', 20)],
      [
        // Same matchup as row 4, but only 20 games (9W/11L, 45 %) — the interval
        // [25.82, 65.79] now straddles 50 %, so big-bad is no longer significant.
        cell('a', 'big-bad', 45, 20, { wins: 9, losses: 11 }),
        cell('a', 'small-bad', 20),
        cell('a', 'prey', 65),
      ],
    );
    const a = scores.find((s) => s.archetypeId === 'a')!;
    const bigBad = a.threats.find((t) => t.archetypeId === 'big-bad')!;
    expect(bigBad.significant).toBe(false);
    expect(a.threats.map((t) => t.archetypeId)).toEqual(['small-bad', 'big-bad']);
  });

  it('falls back to a mirror-only score (band collapses to the point estimate) when no matchup data exists at all', () => {
    const scores = computeFieldScores([share('a', 9), share('b', 91)], []);
    const a = scores.find((s) => s.archetypeId === 'a')!;
    expect(a.fieldWinRatePct).toBe(50);
    expect(a.fieldWinRateLowPct).toBe(50);
    expect(a.fieldWinRateHighPct).toBe(50);
    expect(a.coveragePct).toBe(9);
  });

  it('skips a cell with total: 0 — it contributes no coverage and no band term (plan §3.4 row 8)', () => {
    const scores = computeFieldScores(
      [share('a', 50), share('b', 50)],
      [cell('a', 'b', 0, 0)], // no games at all despite the row existing
    );
    const a = scores.find((s) => s.archetypeId === 'a')!;
    // Only the mirror (50 of 100 share) is covered.
    expect(a.coveragePct).toBe(50);
    expect(a.fieldWinRatePct).toBe(50);
    expect(a.fieldWinRateLowPct).toBe(50);
    expect(a.fieldWinRateHighPct).toBe(50);
  });

  it('handles empty input without dividing by zero, and leaves the band null when nothing is covered', () => {
    expect(computeFieldScores([], [])).toEqual([]);
    const zeroShare = computeFieldScores([{ ...share('a', 0) }], []);
    expect(zeroShare[0]?.coveragePct).toBe(0);
    expect(zeroShare[0]?.fieldWinRatePct).toBeNull();
    expect(zeroShare[0]?.fieldWinRateLowPct).toBeNull();
    expect(zeroShare[0]?.fieldWinRateHighPct).toBeNull();
  });
});
