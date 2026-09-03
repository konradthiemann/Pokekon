// Deterministic PRNG and distribution samplers backing the Monte-Carlo
// robustness check (plan .claude/plans/meta-game-theory-layer.md §3.4,
// Slice A3). There is deliberately NO Math.random anywhere in this layer:
// without a seed the Monte-Carlo results would not be reproducible from the
// stored run metadata, and golden tests would be impossible.

/**
 * mulberry32 — a 32-bit seeded PRNG in ~6 lines, uniform on [0,1). Chosen
 * because it is short enough to review by eye, uses only int32 arithmetic
 * (Math.imul), and is therefore bit-identical on every platform Node runs on.
 */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return function (): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller standard normal, consuming two uniforms per call. */
export function standardNormal(rng: () => number): number {
  // Avoid u1 === 0 (log(0) = -Infinity): mulberry32's range is [0,1), so
  // this guards against the one degenerate draw that would break Box-Muller.
  let u1 = rng();
  while (u1 === 0) u1 = rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Marsaglia-Tsang gamma sampler; shape < 1 handled by the standard boost
 * Gamma(a) = Gamma(a+1) * U^(1/a). Scale is always 1.
 */
export function sampleGamma(shape: number, rng: () => number): number {
  if (shape < 1) {
    const u = rng();
    return sampleGamma(shape + 1, rng) * Math.pow(u, 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  for (;;) {
    let x: number;
    let v: number;
    do {
      x = standardNormal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Beta(a, b) = X/(X+Y) with X ~ Gamma(a), Y ~ Gamma(b). */
export function sampleBeta(a: number, b: number, rng: () => number): number {
  const x = sampleGamma(a, rng);
  const y = sampleGamma(b, rng);
  return x / (x + y);
}
