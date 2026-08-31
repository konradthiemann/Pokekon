import { describe, it, expect } from 'vitest';
import { TIE_WEIGHT, tournamentWinRate, tournamentWinRatePct } from './winRate.js';

describe('TIE_WEIGHT', () => {
  it('is one third — a tie counts as a third of a win', () => {
    expect(TIE_WEIGHT).toBeCloseTo(1 / 3, 10);
  });
});

describe('tournamentWinRatePct', () => {
  // Verbatim wertetabelle from the plan (§3.1) — including the AC example
  // (6W/4L/2T → 55.6) and the deliberate null→33 semantic change for pure ties.
  it.each([
    [6, 4, 2, 1, 55.6],
    [6, 4, 2, 0, 56],
    [10, 4, 0, 1, 71.4],
    [10, 4, 0, 0, 71],
    [0, 0, 5, 1, 33.3],
    [0, 0, 5, 0, 33],
    [0, 0, 0, 1, null],
    [0, 0, 0, 0, null],
    [3, 0, 0, 1, 100],
    [3, 0, 0, 0, 100],
  ])('wins=%i losses=%i ties=%i decimals=%i -> %s', (wins, losses, ties, decimals, expected) => {
    expect(tournamentWinRatePct(wins, losses, ties, decimals)).toBe(expected);
  });

  it('defaults ties to 0 and decimals to 0 when omitted', () => {
    expect(tournamentWinRatePct(10, 4)).toBe(71);
  });
});

describe('tournamentWinRate', () => {
  it('returns a 0..1 fraction, null only when nothing was played at all', () => {
    expect(tournamentWinRate(6, 4, 2)).toBeCloseTo(0.5556, 3);
    expect(tournamentWinRate(0, 0, 0)).toBeNull();
  });

  it('treats non-finite or negative inputs defensively as 0', () => {
    expect(tournamentWinRate(Number.NaN, 4, 0)).not.toBeNull();
    expect(tournamentWinRate(-3, 4, 0)).not.toBeNull();
    expect(tournamentWinRatePct(-3, 4, 0)).toBe(0);
    expect(tournamentWinRatePct(Number.POSITIVE_INFINITY, 4, 0)).toBe(0);
  });
});
