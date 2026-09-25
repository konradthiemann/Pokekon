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

// Spec 7 §9a changes the colour contract: the helper returns semantic classes
// (.wr-pos/.wr-mid/.wr-neg, index.css) instead of fixed Tailwind colours, so
// the coach layout can recolour them (blue/slate/orange) while the old layout
// keeps emerald/amber/red. Thresholds are unchanged (50 / 45).
describe('winRateColorClass', () => {
  it('maps to semantic win-rate classes with unchanged thresholds', () => {
    expect(winRateColorClass(55)).toBe('wr-pos');
    expect(winRateColorClass(50)).toBe('wr-pos');
    expect(winRateColorClass(46)).toBe('wr-mid');
    expect(winRateColorClass(45)).toBe('wr-mid');
    expect(winRateColorClass(44.9)).toBe('wr-neg');
    expect(winRateColorClass(10)).toBe('wr-neg');
  });
});
