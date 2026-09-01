// Tests for the confidence-tier and interval-formatting UI helpers (plan
// .claude/plans/confidence-aware-matchups.md §3.6, Slice C step 9).
// `./confidence.ts` is currently a tester-authored stub that throws.
import { describe, it, expect } from 'vitest';
import { confidenceTier, formatWithInterval } from './confidence.js';

describe('confidenceTier', () => {
  it.each([
    [0, 'high'],
    [5, 'high'],
    [10, 'high'], // exactly on the boundary — still 'high'
  ])('widthPct=%s -> %s', (widthPct, tier) => {
    expect(confidenceTier(widthPct)).toBe(tier);
  });

  it.each([
    [10.01, 'medium'],
    [15, 'medium'],
    [20, 'medium'], // exactly on the boundary — still 'medium'
  ])('widthPct=%s -> %s', (widthPct, tier) => {
    expect(confidenceTier(widthPct)).toBe(tier);
  });

  it.each([
    [20.01, 'low'],
    [30, 'low'],
    [35, 'low'], // exactly on the boundary — still 'low'
  ])('widthPct=%s -> %s', (widthPct, tier) => {
    expect(confidenceTier(widthPct)).toBe(tier);
  });

  it.each([
    [35.01, 'veryLow'],
    [50, 'veryLow'],
    [100, 'veryLow'],
  ])('widthPct=%s -> %s', (widthPct, tier) => {
    expect(confidenceTier(widthPct)).toBe(tier);
  });
});

describe('formatWithInterval', () => {
  it('renders an em dash when the point estimate is null', () => {
    expect(formatWithInterval(null, null, null)).toBe('—');
    expect(formatWithInterval(null, 52.21, 70.9)).toBe('—');
  });

  it('falls back to the point estimate alone when bounds are null', () => {
    expect(formatWithInterval(62, null, null)).toBe('62.0 %');
  });

  it('falls back to the point estimate alone when bounds are undefined', () => {
    expect(formatWithInterval(62, undefined, undefined)).toBe('62.0 %');
  });

  it('renders the explicit range with the default 1 decimal', () => {
    expect(formatWithInterval(62, 52.21, 70.9)).toBe('62.0 % (52.2–70.9 %)');
  });

  it('respects a custom decimals count', () => {
    expect(formatWithInterval(62.34, 52.21, 70.9, 0)).toBe('62 % (52–71 %)');
  });

  it('renders only a real bound (0) as a bound, not as a falsy fallback', () => {
    // 0 is a legitimate lowPct (e.g. an 0/10 record) — must not be treated
    // like null/undefined just because it is falsy.
    expect(formatWithInterval(0, 0, 27.8)).toBe('0.0 % (0.0–27.8 %)');
  });
});
