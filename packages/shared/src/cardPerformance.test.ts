// Golden + property tests for the card-performance calculation layer (plan
// .claude/plans/recommendation-to-prognosis.md §3.1-§3.4, Slice A).
//
// `./cardPerformance.ts` does not exist yet -- unlike wilsonInterval.ts's
// precedent (a tester-authored stub with sentinel returns), this slice's
// instructions are to write ONLY this test file and leave the module
// entirely unwritten. The expected red state is therefore a module
// resolution failure ("Cannot find module './cardPerformance.js'"), not a
// stub returning wrong values. @implementer creates the module next; these
// tests define "done" for that work.
import { describe, it, expect } from 'vitest';
import {
  HIGH_INCLUSION_PCT,
  LOW_INCLUSION_PCT,
  MAX_USABLE_BAND_PP,
  normalizeCardName,
  placementPercentile,
  mannWhitneyTheta,
  rankEffectiveSampleSize,
  cardPerformanceDelta,
  computeArchetypeCardStats,
  classifyCardSignal,
} from './cardPerformance.js';
import type { CardPerformanceDelta, ListPerformanceEntry } from './cardPerformance.js';

type CardKind = 'pokemon' | 'trainer' | 'energy';

// ---------------------------------------------------------------------------
// Exported constants (plan §3.1)
// ---------------------------------------------------------------------------

describe('exported constants (plan §3.1, mirrored/tuned values)', () => {
  it('HIGH_INCLUSION_PCT mirrors deckComparison.ts:247-250 suggestedAdds threshold', () => {
    expect(HIGH_INCLUSION_PCT).toBe(55);
  });

  it('LOW_INCLUSION_PCT mirrors deckComparison.ts:247-250 suggestedRemoves threshold', () => {
    expect(LOW_INCLUSION_PCT).toBe(20);
  });

  it('MAX_USABLE_BAND_PP is the tuned "no prognosis possible" band-width threshold', () => {
    expect(MAX_USABLE_BAND_PP).toBe(40);
  });
});

// ---------------------------------------------------------------------------
// normalizeCardName (plan §3.1)
// ---------------------------------------------------------------------------

describe('normalizeCardName — binding value table (plan §3.1, exact)', () => {
  it.each([
    ['Ultra Ball', 'ultra ball'],
    ['  Nest   Ball  ', 'nest ball'],
    ['NEST BALL', 'nest ball'],
    ['', ''],
  ])('normalizeCardName(%j) -> %j', (raw, expected) => {
    expect(normalizeCardName(raw)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// placementPercentile (plan §3.1)
// ---------------------------------------------------------------------------

describe('placementPercentile — binding value table (plan §3.1, exact)', () => {
  const cases: Array<[number | null | undefined, number, number | null, string]> = [
    [1, 100, 1, 'Sieger'],
    [100, 100, 0, 'Letzter'],
    [50, 100, 50 / 99, 'Mitte'],
    [1, 2, 1, 'kleinstes sinnvolles Feld'],
    [2, 2, 0, 'zweiter von zwei'],
    [1, 1, null, 'Ein-Personen-Feld = keine Information'],
    [null, 100, null, 'Drop / Limitless liefert nichts'],
    [0, 100, null, 'ungueltige Platzierung'],
    [150, 100, 0, 'geklemmt statt negativ'],
    [1, 0, null, 'totalPlayers 0'],
  ];

  it.each(cases)('placing=%s totalPlayers=%s -> %s (%s)', (placing, totalPlayers, expected) => {
    const result = placementPercentile(placing, totalPlayers);
    if (expected === null) {
      expect(result).toBeNull();
    } else {
      expect(result).toBeCloseTo(expected, 10);
    }
  });
});

describe('placementPercentile — additional edge cases documented in the docstring ("missing/non-finite/< 1")', () => {
  it('returns null for undefined placing (missing)', () => {
    expect(placementPercentile(undefined, 100)).toBeNull();
  });

  it('returns null for non-finite placing (NaN)', () => {
    expect(placementPercentile(Number.NaN, 100)).toBeNull();
  });

  it('returns null for non-finite placing (+Infinity)', () => {
    expect(placementPercentile(Number.POSITIVE_INFINITY, 100)).toBeNull();
  });

  it('returns null for a negative placing (< 1)', () => {
    expect(placementPercentile(-5, 100)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// mannWhitneyTheta (plan §3.2)
// ---------------------------------------------------------------------------

describe('mannWhitneyTheta — binding value table (plan §3.2, exact)', () => {
  const cases: Array<[number[], number[], number, string]> = [
    [[1, 1, 1], [0, 0], 1, 'jede Paarung gewonnen'],
    [[0, 0], [1, 1, 1], 0, 'jede Paarung verloren'],
    [[0.5], [0.5], 0.5, 'eine Bindung, halber Kredit'],
    [[0.9, 0.1], [0.5], 0.5, '1 gewonnen, 1 verloren'],
    [[1, 2], [2, 3], 0.125, 'Paare: 0, 0, 0.5, 0 -> 0.5/4'],
    [[3, 4], [1, 2], 1, 'jede Paarung gewonnen'],
  ];

  it.each(cases)('mannWhitneyTheta(%j, %j) -> %s (%s)', (withValues, withoutValues, expected) => {
    expect(mannWhitneyTheta(withValues, withoutValues)).toBeCloseTo(expected, 10);
  });

  it('returns null when withValues is empty', () => {
    expect(mannWhitneyTheta([], [1])).toBeNull();
  });

  it('returns null when withoutValues is empty', () => {
    expect(mannWhitneyTheta([1], [])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// rankEffectiveSampleSize (plan §3.2)
// ---------------------------------------------------------------------------

describe('rankEffectiveSampleSize — binding value table (plan §3.2, exact)', () => {
  it.each([
    [1, 1, 1],
    [10, 10, 300 / 21],
    [100, 100, 30000 / 201],
    [5, 100, 1500 / 106],
    [5, 1000, 15000 / 1006],
    [0, 50, 0],
  ])('rankEffectiveSampleSize(%i, %i) -> %s', (n1, n2, expected) => {
    expect(rankEffectiveSampleSize(n1, n2)).toBeCloseTo(expected, 6);
  });

  it('is symmetric in its two arguments', () => {
    expect(rankEffectiveSampleSize(5, 100)).toBeCloseTo(rankEffectiveSampleSize(100, 5), 10);
  });
});

describe('rankEffectiveSampleSize — n_eff is bounded above by 3*n1 as n2 -> infinity (property test, plan §3.2)', () => {
  it('never reaches 3*n1 for growing n2, and monotonically approaches it', () => {
    const n1 = 5;
    const bound = 3 * n1; // = 15, the plan's stated limit
    const sizes = [10, 100, 1_000, 10_000, 1_000_000];
    let previous = 0;
    for (const n2 of sizes) {
      const nEff = rankEffectiveSampleSize(n1, n2);
      expect(nEff).toBeLessThan(bound);
      expect(nEff).toBeGreaterThan(previous);
      previous = nEff;
    }
  });

  it('a huge opposing group does not rescue a small group (plan §3.2: "eine riesige Gegengruppe rettet 5 Listen nicht")', () => {
    // Table row: n1=5, n2=1000 -> n_eff = 15000/1006 = 14.910536... -- already
    // close to the 3*n1=15 ceiling, which is exactly the point being made.
    expect(rankEffectiveSampleSize(5, 1000)).toBeCloseTo(15000 / 1006, 6);
    expect(rankEffectiveSampleSize(5, 1000)).toBeLessThan(15);
  });
});

// ---------------------------------------------------------------------------
// cardPerformanceDelta (plan §3.3)
//
// Fixture strategy: `spread` builds `count` distinct values strictly inside
// an open interval (no ties). `buildTheta` combines two `spread` ranges so
// the resulting (withValues, withoutValues) pair has an EXACT Mann-Whitney
// theta by construction (all "high" with-values rank above every without-
// value, all "low" with-values rank below every without-value) -- requires
// theta * n1 to be an integer, true for every case in the plan's table.
// ---------------------------------------------------------------------------

function spread(count: number, base: number, width: number): number[] {
  return Array.from({ length: count }, (_, i) => base + ((i + 1) * width) / (count + 1));
}

function buildTheta(
  n1: number,
  n2: number,
  theta: number,
): { withValues: number[]; withoutValues: number[] } {
  const aboveCount = Math.round(theta * n1);
  if (Math.abs(aboveCount - theta * n1) > 1e-9) {
    throw new Error(`buildTheta: theta * n1 must be an integer (got ${theta * n1})`);
  }
  const belowCount = n1 - aboveCount;
  const withoutValues = spread(n2, 0.4, 0.2); // strictly inside (0.4, 0.6)
  const withValues = [
    ...spread(aboveCount, 0.7, 0.29), // strictly inside (0.7, 0.99) > max(withoutValues)
    ...spread(belowCount, 0.0, 0.19), // strictly inside (0.0, 0.19) < min(withoutValues)
  ];
  return { withValues, withoutValues };
}

// Tolerance exactly as stated in the plan's table header: "Toleranz 0,1 pp".
function expectWithinPp(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(0.1 + 1e-9);
}

describe('cardPerformanceDelta — binding value table (plan §3.3, 95% confidence, 1 decimal, tolerance 0.1pp)', () => {
  it('case A: n1=10/n2=10, theta=0.70 -- the "looks decisive, is not" headline example', () => {
    const { withValues, withoutValues } = buildTheta(10, 10, 0.7);
    const result = cardPerformanceDelta(withValues, withoutValues);
    expect(result).not.toBeNull();
    expect(result!.listsWith).toBe(10);
    expect(result!.listsWithout).toBe(10);
    expectWithinPp(result!.superiorityPct, 70.0);
    expectWithinPp(result!.deltaPp, 20.0);
    expectWithinPp(result!.lowPct, 44.2);
    expectWithinPp(result!.highPct, 87.3);
    expect(result!.significant).toBe(false);
    expect(result!.effectiveN).toBeCloseTo(14.29, 2);
  });

  it('case B: n1=100/n2=100, theta=0.70 -- same point estimate as A, but real evidence this time', () => {
    const { withValues, withoutValues } = buildTheta(100, 100, 0.7);
    const result = cardPerformanceDelta(withValues, withoutValues);
    expect(result).not.toBeNull();
    expect(result!.listsWith).toBe(100);
    expect(result!.listsWithout).toBe(100);
    expectWithinPp(result!.superiorityPct, 70.0);
    expectWithinPp(result!.deltaPp, 20.0);
    expectWithinPp(result!.lowPct, 62.2);
    expectWithinPp(result!.highPct, 76.8);
    expect(result!.significant).toBe(true);
    expect(result!.effectiveN).toBeCloseTo(149.25, 2);
  });

  it('case C: n1=20/n2=5, theta=1.00 -- the edge case does NOT collapse to [100,100]', () => {
    const { withValues, withoutValues } = buildTheta(20, 5, 1.0);
    const result = cardPerformanceDelta(withValues, withoutValues);
    expect(result).not.toBeNull();
    expect(result!.listsWith).toBe(20);
    expect(result!.listsWithout).toBe(5);
    expectWithinPp(result!.superiorityPct, 100.0);
    expectWithinPp(result!.deltaPp, 50.0);
    expectWithinPp(result!.lowPct, 75.0);
    expectWithinPp(result!.highPct, 100.0);
    expect(result!.significant).toBe(true);
    expect(result!.effectiveN).toBeCloseTo(11.54, 2);
  });

  it('case D: n1=1/n2=1, theta=1.00 -- consistency anchor to the ALREADY-PINNED wilsonInterval golden 1W/0L row', () => {
    // Chain, not a re-derived number:
    //   rankEffectiveSampleSize(1, 1) = 3*1*1/(1+1+1) = 1
    //   theta-hat = 1  ->  wilsonInterval(1*1, 0*1, 0) = wilsonInterval(1, 0, 0)
    // wilsonInterval.test.ts pins EXACTLY that case:
    //   [1, 0, 0, 100, 20.6549, 100, 'n=1, maximal uncertainty']  (see that file's
    //   golden-table test, verified to still hold before writing this assertion).
    // 20.6549 rounds to 20.7 at the 1-decimal precision CardPerformanceDelta uses.
    expect(rankEffectiveSampleSize(1, 1)).toBe(1);

    const { withValues, withoutValues } = buildTheta(1, 1, 1.0);
    const result = cardPerformanceDelta(withValues, withoutValues);
    expect(result).not.toBeNull();
    expect(result!.listsWith).toBe(1);
    expect(result!.listsWithout).toBe(1);
    expectWithinPp(result!.superiorityPct, 100.0);
    expectWithinPp(result!.deltaPp, 50.0);
    expectWithinPp(result!.lowPct, 20.7);
    expectWithinPp(result!.highPct, 100.0);
    expect(result!.significant).toBe(false);
    expect(result!.effectiveN).toBeCloseTo(1, 2);
  });

  it('case E: n1=50/n2=50, theta=0.50 -- no difference, band symmetric around 50', () => {
    const { withValues, withoutValues } = buildTheta(50, 50, 0.5);
    const result = cardPerformanceDelta(withValues, withoutValues);
    expect(result).not.toBeNull();
    expectWithinPp(result!.superiorityPct, 50.0);
    expectWithinPp(result!.deltaPp, 0.0);
    expect(result!.significant).toBe(false);
    // "symmetrisch um 50" (plan table) -- the band's midpoint sits at 50.
    expect((result!.lowPct + result!.highPct) / 2).toBeCloseTo(50, 1);
    // Precise bounds, independently derived from the same binding formula
    // chain (plan §3.0/§3.2/§3.3) since the plan gives only the qualitative
    // description for this row, not exact numbers.
    expectWithinPp(result!.lowPct, 38.9);
    expectWithinPp(result!.highPct, 61.1);
  });

  it('case F: withValues empty -> null (undefinedness, not a cutoff)', () => {
    const withoutValues = spread(30, 0.4, 0.2);
    expect(cardPerformanceDelta([], withoutValues)).toBeNull();
  });

  it('case G: withoutValues empty -> null (undefinedness, not a cutoff)', () => {
    const withValues = spread(30, 0.4, 0.2);
    expect(cardPerformanceDelta(withValues, [])).toBeNull();
  });
});

describe('cardPerformanceDelta — meanPercentileWithPct / meanPercentileWithoutPct (interface contract, descriptive only -- not in the plan §3.3 golden table)', () => {
  it('reports the mean placement percentile per group, x100, 1 decimal', () => {
    const result = cardPerformanceDelta([1, 1], [0, 0]);
    expect(result).not.toBeNull();
    expect(result!.meanPercentileWithPct).toBeCloseTo(100, 1);
    expect(result!.meanPercentileWithoutPct).toBeCloseTo(0, 1);
  });
});

describe('cardPerformanceDelta — property tests (plan §3.3)', () => {
  it('antisymmetry: deltaPp negates and the band mirrors around 50 when the groups are swapped', () => {
    const { withValues, withoutValues } = buildTheta(10, 10, 0.7); // case A fixture
    const forward = cardPerformanceDelta(withValues, withoutValues);
    const reverse = cardPerformanceDelta(withoutValues, withValues);
    expect(forward).not.toBeNull();
    expect(reverse).not.toBeNull();
    expectWithinPp(reverse!.deltaPp, -forward!.deltaPp);
    expectWithinPp(reverse!.lowPct, 100 - forward!.highPct);
    expectWithinPp(reverse!.highPct, 100 - forward!.lowPct);
  });

  it('monotonicity: widthPct shrinks strictly as both groups grow at the same theta (case A -> case B)', () => {
    const small = buildTheta(10, 10, 0.7);
    const large = buildTheta(100, 100, 0.7);
    const a = cardPerformanceDelta(small.withValues, small.withoutValues);
    const b = cardPerformanceDelta(large.withValues, large.withoutValues);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(b!.widthPct).toBeLessThan(a!.widthPct);
  });

  it('lowPct <= superiorityPct <= highPct always holds (property test across cases A-E)', () => {
    const fixtures = [
      buildTheta(10, 10, 0.7),
      buildTheta(100, 100, 0.7),
      buildTheta(20, 5, 1.0),
      buildTheta(1, 1, 1.0),
      buildTheta(50, 50, 0.5),
    ];
    for (const { withValues, withoutValues } of fixtures) {
      const result = cardPerformanceDelta(withValues, withoutValues);
      expect(result).not.toBeNull();
      expect(result!.lowPct).toBeLessThanOrEqual(result!.superiorityPct + 1e-9);
      expect(result!.superiorityPct).toBeLessThanOrEqual(result!.highPct + 1e-9);
    }
  });

  it('confidence: 0.90 gives a strictly narrower band than the default 0.95', () => {
    const { withValues, withoutValues } = buildTheta(10, 10, 0.7);
    const ci95 = cardPerformanceDelta(withValues, withoutValues);
    const ci90 = cardPerformanceDelta(withValues, withoutValues, { confidence: 0.9 });
    expect(ci95).not.toBeNull();
    expect(ci90).not.toBeNull();
    expect(ci90!.widthPct).toBeLessThan(ci95!.widthPct);
  });

  it('a single observation per group never yields a significant result -- one data point is never an argument', () => {
    const result = cardPerformanceDelta([0.9], [0.1]);
    expect(result).not.toBeNull();
    expect(result!.significant).toBe(false);
    expect(result!.lowPct).toBeLessThanOrEqual(50);
    expect(result!.highPct).toBeGreaterThanOrEqual(50);
  });
});

// ---------------------------------------------------------------------------
// computeArchetypeCardStats (plan §3.4)
// ---------------------------------------------------------------------------

function makeList(
  percentile: number,
  cards: Record<string, { count: number; displayName: string; cardType: CardKind }> = {},
): ListPerformanceEntry {
  const counts: Record<string, number> = {};
  const displayNames: Record<string, string> = {};
  const cardTypes: Record<string, CardKind> = {};
  for (const [key, v] of Object.entries(cards)) {
    counts[key] = v.count;
    displayNames[key] = v.displayName;
    cardTypes[key] = v.cardType;
  }
  return { counts, displayNames, cardTypes, percentile };
}

describe('computeArchetypeCardStats — binding scenario table (plan §3.4)', () => {
  it('4 lists, all include "Ultra Ball" -> listsWith 4, inclusionPct 100, delta null (no "without" group), tier insufficient', () => {
    const lists = [0.9, 0.7, 0.5, 0.3].map((p) =>
      makeList(p, { 'ultra ball': { count: 1, displayName: 'Ultra Ball', cardType: 'trainer' } }),
    );
    const stats = computeArchetypeCardStats(lists);
    expect(stats).toHaveLength(1);
    const ultraBall = stats[0]!;
    expect(ultraBall.cardName).toBe('Ultra Ball');
    expect(ultraBall.listsAnalyzed).toBe(4);
    expect(ultraBall.listsWith).toBe(4);
    expect(ultraBall.inclusionPct).toBeCloseTo(100, 1);
    expect(ultraBall.delta).toBeNull();
    expect(ultraBall.tier).toBe('insufficient');
  });

  it('4 lists, none include "Ultra Ball" -> the card does not appear in the result at all', () => {
    const lists = [0.9, 0.7, 0.5, 0.3].map((p) => makeList(p));
    const stats = computeArchetypeCardStats(lists);
    expect(stats.find((s) => normalizeCardName(s.cardName) === 'ultra ball')).toBeUndefined();
  });

  it('a list with two "Nest Ball" printings already summed to one counts entry (2 + 1) counts as ONE inclusion, avgCount uses the summed 3', () => {
    // ListPerformanceEntry.counts is documented as ALREADY deduped/summed
    // across printings by the producer (plan §3.4 interface docstring) --
    // this fixture represents that pre-summed input directly.
    const lists = [
      makeList(0.8, { 'nest ball': { count: 3, displayName: 'Nest Ball', cardType: 'trainer' } }),
      makeList(0.4),
    ];
    const stats = computeArchetypeCardStats(lists);
    const nestBall = stats.find((s) => normalizeCardName(s.cardName) === 'nest ball');
    expect(nestBall).toBeDefined();
    expect(nestBall!.listsWith).toBe(1);
    expect(nestBall!.avgCount).toBeCloseTo(3, 1);
  });

  it('the same normalised card name typed as two different cardTypes across lists resolves to the FIRST-seen cardType, deterministically', () => {
    const lists = [
      makeList(0.9, { 'trap card': { count: 1, displayName: 'Trap Card', cardType: 'pokemon' } }),
      makeList(0.2, { 'trap card': { count: 1, displayName: 'Trap Card', cardType: 'trainer' } }),
    ];
    const stats = computeArchetypeCardStats(lists);
    const trapCard = stats.find((s) => normalizeCardName(s.cardName) === 'trap card');
    expect(trapCard).toBeDefined();
    expect(trapCard!.cardType).toBe('pokemon'); // first list in the array wins
  });

  it('returns [] for an empty lists array', () => {
    expect(computeArchetypeCardStats([])).toEqual([]);
  });

  it('sorts by inclusionPct desc, then cardName asc on ties', () => {
    // Beta Card: 8/10 lists (80%). Alpha Card and Zebra Card: 5/10 lists each (tie at 50%).
    const lists = Array.from({ length: 10 }, (_, i) => {
      const cards: Record<string, { count: number; displayName: string; cardType: CardKind }> = {};
      if (i < 8) cards['beta card'] = { count: 1, displayName: 'Beta Card', cardType: 'trainer' };
      if (i < 5) {
        cards['alpha card'] = { count: 1, displayName: 'Alpha Card', cardType: 'trainer' };
      } else {
        cards['zebra card'] = { count: 1, displayName: 'Zebra Card', cardType: 'trainer' };
      }
      return makeList(0.1 + i * 0.08, cards);
    });
    const stats = computeArchetypeCardStats(lists);
    expect(stats.map((s) => s.cardName)).toEqual(['Beta Card', 'Alpha Card', 'Zebra Card']);
  });

  it('20 with / 20 without, "with" consistently better placed, inclusionPct exactly 50 -> hiddenGem, NOT confirmed (50 < HIGH_INCLUSION_PCT=55)', () => {
    const { withValues, withoutValues } = buildTheta(20, 20, 1.0);
    const lists = [
      ...withValues.map((p) =>
        makeList(p, { 'edge card': { count: 1, displayName: 'Edge Card', cardType: 'trainer' } }),
      ),
      ...withoutValues.map((p) => makeList(p)),
    ];
    const stats = computeArchetypeCardStats(lists);
    const edgeCard = stats.find((s) => normalizeCardName(s.cardName) === 'edge card');
    expect(edgeCard).toBeDefined();
    expect(edgeCard!.inclusionPct).toBeCloseTo(50, 1);
    expect(edgeCard!.tier).toBe('hiddenGem');
  });

  it('a card in 90% of lists with theta ~ 0.5 (both groups large enough for a usable band) -> popularityParadox', () => {
    const { withValues, withoutValues } = buildTheta(90, 10, 0.5);
    const lists = [
      ...withValues.map((p) =>
        makeList(p, {
          'paradox card': { count: 1, displayName: 'Paradox Card', cardType: 'trainer' },
        }),
      ),
      ...withoutValues.map((p) => makeList(p)),
    ];
    const stats = computeArchetypeCardStats(lists);
    const paradoxCard = stats.find((s) => normalizeCardName(s.cardName) === 'paradox card');
    expect(paradoxCard).toBeDefined();
    expect(paradoxCard!.inclusionPct).toBeCloseTo(90, 1);
    expect(paradoxCard!.tier).toBe('popularityParadox');
  });

  it('avgCount is the mean copies among including lists, 1 decimal (interface docstring, supplementary to the scenario table)', () => {
    const lists = [
      makeList(0.9, { 'test card': { count: 1, displayName: 'Test Card', cardType: 'trainer' } }),
      makeList(0.7, { 'test card': { count: 2, displayName: 'Test Card', cardType: 'trainer' } }),
      makeList(0.5, { 'test card': { count: 2, displayName: 'Test Card', cardType: 'trainer' } }),
      makeList(0.3), // does not include the card
    ];
    const stats = computeArchetypeCardStats(lists);
    const testCard = stats.find((s) => normalizeCardName(s.cardName) === 'test card');
    expect(testCard).toBeDefined();
    expect(testCard!.avgCount).toBeCloseTo(5 / 3, 1); // (1+2+2)/3 = 1.6667 -> 1.7
    expect(testCard!.inclusionPct).toBeCloseTo(75, 1); // 3 of 4 lists
  });

  it('opts.maxBandPp is forwarded to the tier classification (a band too wide by default becomes usable when widened)', () => {
    const { withValues, withoutValues } = buildTheta(10, 10, 0.7); // case A shape: widthPct ~= 43.0 > 40
    const lists = [
      ...withValues.map((p) =>
        makeList(p, {
          'wide band card': { count: 1, displayName: 'Wide Band Card', cardType: 'trainer' },
        }),
      ),
      ...withoutValues.map((p) => makeList(p)),
    ];
    const defaultStats = computeArchetypeCardStats(lists);
    const wideDefault = defaultStats.find(
      (s) => normalizeCardName(s.cardName) === 'wide band card',
    );
    expect(wideDefault).toBeDefined();
    expect(wideDefault!.tier).toBe('insufficient'); // 43.0 > MAX_USABLE_BAND_PP (40)

    const overriddenStats = computeArchetypeCardStats(lists, { maxBandPp: 50 });
    const wideOverridden = overriddenStats.find(
      (s) => normalizeCardName(s.cardName) === 'wide band card',
    );
    expect(wideOverridden).toBeDefined();
    // inclusionPct here is 10/20 = 50% (< 55) and significant is false (case A) --
    // so once the band is no longer "insufficient" it falls through to 'neutral'.
    expect(wideOverridden!.tier).toBe('neutral');
  });
});

// ---------------------------------------------------------------------------
// classifyCardSignal (plan §3.4)
// ---------------------------------------------------------------------------

describe('classifyCardSignal — binding classification rules (plan §3.4, order is binding, first match wins)', () => {
  const baseDelta = (overrides: Partial<CardPerformanceDelta> = {}): CardPerformanceDelta => ({
    listsWith: 20,
    listsWithout: 20,
    superiorityPct: 70,
    deltaPp: 20,
    lowPct: 60,
    highPct: 80,
    widthPct: 20,
    significant: true,
    effectiveN: 30,
    meanPercentileWithPct: 70,
    meanPercentileWithoutPct: 50,
    ...overrides,
  });

  it('rule 1: delta === null -> insufficient', () => {
    expect(classifyCardSignal(90, null)).toBe('insufficient');
  });

  it('rule 1: delta.widthPct > maxBandPp (default 40) -> insufficient, even with a significant positive delta', () => {
    const delta = baseDelta({ widthPct: 41, significant: true, deltaPp: 20 });
    expect(classifyCardSignal(90, delta)).toBe('insufficient');
  });

  it('rule 2: significant && deltaPp > 0 && inclusionPct >= 55 -> confirmed (boundary is inclusive)', () => {
    const delta = baseDelta({ significant: true, deltaPp: 20 });
    expect(classifyCardSignal(55, delta)).toBe('confirmed');
    expect(classifyCardSignal(80, delta)).toBe('confirmed');
  });

  it('rule 3: significant && deltaPp > 0 but inclusionPct < 55 -> hiddenGem', () => {
    const delta = baseDelta({ significant: true, deltaPp: 20 });
    expect(classifyCardSignal(54.9, delta)).toBe('hiddenGem');
    expect(classifyCardSignal(10, delta)).toBe('hiddenGem');
  });

  it('rule 4a: popular AND deltaPp <= 0 -> popularityParadox, even when "significant" is true (takes precedence over rule 5 "discouraged" for popular cards)', () => {
    const delta = baseDelta({ significant: true, deltaPp: -5 });
    expect(classifyCardSignal(80, delta)).toBe('popularityParadox');
  });

  it('rule 4b: popular AND NOT significant (even with a nominally positive deltaPp) -> popularityParadox, not confirmed/hiddenGem', () => {
    const delta = baseDelta({ significant: false, deltaPp: 3 });
    expect(classifyCardSignal(80, delta)).toBe('popularityParadox');
  });

  it('rule 5: significant && deltaPp < 0 && NOT popular -> discouraged', () => {
    const delta = baseDelta({ significant: true, deltaPp: -5 });
    expect(classifyCardSignal(30, delta)).toBe('discouraged');
  });

  it('rule 6: everything else -> neutral', () => {
    expect(classifyCardSignal(30, baseDelta({ significant: false, deltaPp: 3 }))).toBe('neutral');
    expect(classifyCardSignal(30, baseDelta({ significant: false, deltaPp: -3 }))).toBe('neutral');
  });

  it('rule ORDER matters: rule 1 (insufficient) is checked BEFORE rule 4 (popularityParadox) -- a popular staple backed by only a few comparison lists must read as "not enough data", not get smeared as a popularity paradox (plan §3.4, explicit reasoning requirement)', () => {
    const delta = baseDelta({ widthPct: 45, significant: false, deltaPp: -2 });
    // This delta ALSO satisfies rule 4's condition (inclusionPct >= 55 &&
    // (deltaPp <= 0 || !significant)) -- but rule 1 must fire first because
    // the band is wider than maxBandPp. If the implementation checked rule 4
    // before rule 1, this would wrongly return 'popularityParadox'.
    expect(classifyCardSignal(90, delta)).toBe('insufficient');
  });

  it('maxBandPp option overrides the default MAX_USABLE_BAND_PP', () => {
    const delta = baseDelta({ widthPct: 45, significant: true, deltaPp: 20 });
    expect(classifyCardSignal(90, delta, { maxBandPp: 40 })).toBe('insufficient');
    expect(classifyCardSignal(90, delta, { maxBandPp: 50 })).toBe('confirmed');
  });
});
