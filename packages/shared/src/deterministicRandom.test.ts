// Tests for the deterministic PRNG and distribution samplers that back the
// Monte-Carlo robustness check (plan .claude/plans/meta-game-theory-layer.md
// §3.4, Slice A3). `./deterministicRandom.ts` does not exist yet — this file
// pins the exact contract (function signatures, the binding mulberry32 value
// table, and the statistical moment properties of the Beta/Gamma samplers)
// that @implementer must satisfy.
//
// Precision note on the mulberry32 table: the plan prints
// `mulberry32(1)()` draw #2 as `0.0027357211802155`, which is a DISPLAY
// truncation of the true IEEE-754 double (`0.002735721180215478...`) — the
// two literals do not parse to bit-identical doubles in JS. All five pinned
// values are therefore asserted with `toBeCloseTo(value, 12)` (12 decimal
// places — far tighter than any implementation bug could hide behind, but
// tolerant of the plan's own printed truncation), rather than `toBe`.
import { describe, it, expect } from 'vitest';
import { mulberry32, standardNormal, sampleGamma, sampleBeta } from './deterministicRandom.js';

// ---------------------------------------------------------------------------
// mulberry32 (plan §3.4 — binding pinned values)
// ---------------------------------------------------------------------------

describe('mulberry32 — binding pinned values (plan §3.4)', () => {
  it('seed 1: the first five draws match the plan-pinned sequence exactly', () => {
    const rng = mulberry32(1);
    const expected = [
      0.6270739405881613, 0.0027357211802155, 0.5274470399599522, 0.9810509674716741,
      0.9683778982143849,
    ];
    for (const value of expected) {
      expect(rng()).toBeCloseTo(value, 12);
    }
  });

  it('seed 20260902: the first three draws match the plan-pinned sequence exactly', () => {
    const rng = mulberry32(20260902);
    const expected = [0.2709086062386632, 0.5421625019516796, 0.7994366891216487];
    for (const value of expected) {
      expect(rng()).toBeCloseTo(value, 12);
    }
  });

  it('every draw lies in [0, 1)', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 10000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('two generators with the same seed produce an identical sequence (determinism, not just similarity)', () => {
    const rngA = mulberry32(20260902);
    const rngB = mulberry32(20260902);
    for (let i = 0; i < 1000; i++) {
      expect(rngA()).toBe(rngB());
    }
  });

  it('two generators with different seeds diverge within the first five draws', () => {
    const rngA = mulberry32(1);
    const rngB = mulberry32(2);
    const seqA = Array.from({ length: 5 }, () => rngA());
    const seqB = Array.from({ length: 5 }, () => rngB());
    expect(seqA).not.toEqual(seqB);
  });
});

// ---------------------------------------------------------------------------
// standardNormal — sanity, no binding value table given by the plan beyond
// "consumes two uniforms per call" and feeding sampleGamma correctly (tested
// transitively below). Kept minimal per the plan's own scope.
// ---------------------------------------------------------------------------

describe('standardNormal — basic sanity (plan §3.4, no dedicated value table)', () => {
  it('returns a finite number for a long deterministic sequence, mean close to 0 and variance close to 1', () => {
    const rng = mulberry32(1);
    const n = 50000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const v = standardNormal(rng);
      expect(Number.isFinite(v)).toBe(true);
      sum += v;
      sumSq += v * v;
    }
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    expect(mean).toBeCloseTo(0, 1);
    expect(variance).toBeCloseTo(1, 1);
  });
});

// ---------------------------------------------------------------------------
// sampleGamma — Marsaglia-Tsang with the shape<1 boost branch (plan §3.4)
// ---------------------------------------------------------------------------

describe('sampleGamma — shape < 1 boost branch (plan §3.4: Gamma(a) = Gamma(a+1) * U^(1/a))', () => {
  it('shape 0.5 (the boost branch) yields only positive, finite values across 10000 draws', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 10000; i++) {
      const v = sampleGamma(0.5, rng);
      expect(v).toBeGreaterThan(0);
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('shape 0.5 (the boost branch): mean over 50000 draws is close to the shape (scale is always 1)', () => {
    const rng = mulberry32(1);
    const n = 50000;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += sampleGamma(0.5, rng);
    // Binding per plan §3.4: mean 0.5, tolerance 0.02.
    expect(sum / n).toBeCloseTo(0.5, 1);
    expect(Math.abs(sum / n - 0.5)).toBeLessThan(0.02);
  });

  it('shape 1 (boundary, NOT the boost branch) yields only positive, finite values across 10000 draws', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 10000; i++) {
      const v = sampleGamma(1, rng);
      expect(v).toBeGreaterThan(0);
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('shape 8.5 (well above 1, non-boost branch) has mean close to the shape across 50000 draws', () => {
    const rng = mulberry32(1);
    const n = 50000;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += sampleGamma(8.5, rng);
    expect(sum / n).toBeCloseTo(8.5, 0);
  });
});

// ---------------------------------------------------------------------------
// sampleBeta — Beta(a,b) = X/(X+Y), X~Gamma(a), Y~Gamma(b) (plan §3.4)
// ---------------------------------------------------------------------------

describe('sampleBeta — binding moment tests (plan §3.4, all with mulberry32(1))', () => {
  it('lies strictly in (0, 1) for 10000 draws of Beta(8.5, 2.5)', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 10000; i++) {
      const v = sampleBeta(8.5, 2.5, rng);
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('Beta(8.5, 2.5): mean over 50000 draws is a/(a+b) = 0.7727 (tolerance 0.01)', () => {
    const rng = mulberry32(1);
    const n = 50000;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += sampleBeta(8.5, 2.5, rng);
    const mean = sum / n;
    expect(mean).toBeCloseTo(0.7727, 1);
    expect(Math.abs(mean - 0.7727)).toBeLessThan(0.01);
  });

  it('Beta(8.5, 2.5): variance over 50000 draws is ab/((a+b)^2 (a+b+1)) = 0.0146 (tolerance 0.003)', () => {
    const rng = mulberry32(1);
    const n = 50000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const v = sampleBeta(8.5, 2.5, rng);
      sum += v;
      sumSq += v * v;
    }
    const mean = sum / n;
    const variance = sumSq / n - mean * mean;
    expect(Math.abs(variance - 0.0146)).toBeLessThan(0.003);
  });

  it('Beta(1, 1) is uniform on [0, 1]: mean over 50000 draws is 0.5 (tolerance 0.01)', () => {
    const rng = mulberry32(1);
    const n = 50000;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += sampleBeta(1, 1, rng);
    const mean = sum / n;
    expect(Math.abs(mean - 0.5)).toBeLessThan(0.01);
  });

  it('Beta(1, 1) is uniform on [0, 1]: each of the ten deciles holds 10% +/- 1.5pp of 50000 draws', () => {
    const rng = mulberry32(1);
    const n = 50000;
    const deciles = new Array(10).fill(0);
    for (let i = 0; i < n; i++) {
      const v = sampleBeta(1, 1, rng);
      const idx = Math.min(9, Math.floor(v * 10));
      deciles[idx]++;
    }
    for (const count of deciles) {
      const pct = (count / n) * 100;
      expect(Math.abs(pct - 10)).toBeLessThan(1.5);
    }
  });
});
