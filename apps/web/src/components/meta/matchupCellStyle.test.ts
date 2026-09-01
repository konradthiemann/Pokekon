import { describe, it, expect } from 'vitest';
import { cellHueClass, cellStyle } from './matchupCellStyle.js';

describe('cellHueClass', () => {
  it('returns only the hue/text classes, no opacity utility', () => {
    expect(cellHueClass(75)).toBe('bg-emerald-700 text-white font-bold');
    expect(cellHueClass(50)).toBe('bg-slate-50 text-slate-600');
    expect(cellHueClass(20)).toBe('bg-red-700 text-white font-bold');
  });
});

describe('cellStyle', () => {
  it('appends the tier opacity to the hue classes', () => {
    expect(cellStyle(75, 'high')).toBe('bg-emerald-700 text-white font-bold opacity-100');
    expect(cellStyle(75, 'low')).toBe('bg-emerald-700 text-white font-bold opacity-60');
  });

  it('never produces both opacity-100 and a second opacity utility together', () => {
    // A mirror/diagonal cell combines a hue-only class with an explicit
    // opacity-60 override (see MatchupMatrix.tsx) — cellHueClass must not
    // carry its own opacity class, or Tailwind's ascending-order emission
    // makes opacity-100 win over the intended opacity-60.
    const combined = `${cellHueClass(75)} opacity-60`;
    expect(combined.match(/opacity-\d+/g)).toEqual(['opacity-60']);
  });
});
