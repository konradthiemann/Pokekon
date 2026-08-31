import { describe, it, expect } from 'vitest';
import { winRateColorClass, winRatePct1 } from './winRateColor.js';

describe('winRatePct1', () => {
  it('matches the server tie-weighted formula (AC 6W/4L/2T -> 55.6)', () => {
    expect(winRatePct1(6, 4, 2)).toBe(55.6);
  });

  it('defaults ties to 0, matching the pre-existing decisive-only behaviour', () => {
    expect(winRatePct1(10, 4)).toBe(71.4);
  });

  it('returns null only when there is no game at all, not merely no decisive game', () => {
    expect(winRatePct1(0, 0, 0)).toBeNull();
    expect(winRatePct1(0, 0, 5)).toBe(33.3);
  });
});

describe('winRateColorClass', () => {
  it('is unaffected by the tie-weighting change', () => {
    expect(winRateColorClass(55)).toBe('text-emerald-700');
    expect(winRateColorClass(46)).toBe('text-amber-700');
    expect(winRateColorClass(10)).toBe('text-red-700');
  });
});
