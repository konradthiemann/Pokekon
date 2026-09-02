import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { attachCardDeltas, fetchArchetypeComparison } from './deckComparison';
import type { CardStat, ComparisonResult } from './deckComparison';
import type { ArchetypeCardStat, CardPerformanceDelta } from '@pokekon/shared';

// A card can appear as more than one printing (different set/number) within
// the same decklist — deckComparison.ts:200-213 previously incremented
// listsCount once per PRINTING ENTRY instead of once per LIST, so a card
// split across two printings in one list inflated frequency past 100%.

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchArchetypeComparison — one inclusion per list, not per printing entry', () => {
  it('never reports a frequency above 100% for a card split across two printings in one list', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/tournaments?')) {
        return Promise.resolve(jsonResponse([{ id: 't1', name: 'Regional', players: 40 }]));
      }
      if (url.includes('/api/tournaments/t1/standings')) {
        return Promise.resolve(
          jsonResponse([
            {
              deck: { id: 'dragapult-ex', name: 'Dragapult ex' },
              placing: 1,
              record: { wins: 8, losses: 0, ties: 0 },
              decklist: {
                // "Basic Energy" appears as two printings in the same list —
                // a single list must still count as ONE inclusion.
                pokemon: [{ name: 'Dragapult ex', count: 3 }],
                trainer: [],
                energy: [
                  { name: 'Basic Energy', count: 6 },
                  { name: 'Basic Energy', count: 2 },
                ],
              },
            },
          ]),
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const result = await fetchArchetypeComparison('dragapult-ex', []);

    const basicEnergy = result.cardStats.find((c) => c.name === 'Basic Energy');
    expect(basicEnergy).toBeDefined();
    expect(basicEnergy?.frequency).toBeLessThanOrEqual(100);
    expect(basicEnergy?.frequency).toBe(100);
    // Copies across both printings are still summed for avgCount.
    expect(basicEnergy?.avgCount).toBe(8);
  });
});

// ─── attachCardDeltas (plan .claude/plans/recommendation-to-prognosis.md §3.7) ──
//
// Pure join, network-free: attaches precomputed server-side card-performance
// deltas to an EXISTING ComparisonResult by normalised card name, without
// touching a single byte of the 55/20/50 frequency-based filters that
// produced suggestedAdds/suggestedRemoves/countAdjustments. This is the test
// that backs the plan's third acceptance criterion (§4 step 11: "vor allem
// die Invarianz-Assertions" + "der Fall 'Delta erscheint in cardStats UND in
// suggestedAdds'").

function makeDelta(overrides: Partial<CardPerformanceDelta> = {}): CardPerformanceDelta {
  return {
    listsWith: 18,
    listsWithout: 2,
    superiorityPct: 65.0,
    deltaPp: 15.0,
    lowPct: 50.0,
    highPct: 78.0,
    widthPct: 28.0,
    significant: true,
    effectiveN: 12.5,
    meanPercentileWithPct: 60.0,
    meanPercentileWithoutPct: 40.0,
    ...overrides,
  };
}

/** Fresh fixture per test (attachCardDeltas is allowed to mutate in place per
 *  the plan, so tests must not share instances across cases). Mirrors the
 *  REAL 55/20/50 derivation in fetchArchetypeComparison (:258-268) so the
 *  suggestedAdds/suggestedRemoves/countAdjustments arrays are derived from
 *  the same cardStats array — exactly the invariant attachCardDeltas must
 *  preserve. */
function buildComparisonResult(): ComparisonResult {
  const cardStats: CardStat[] = [
    {
      name: 'Ultra Ball',
      cardType: 'trainer',
      frequency: 80,
      avgCount: 3.5,
      topAvgCount: 4,
      inUserDeck: false,
      userCount: 0,
    },
    {
      name: "Boss's Orders",
      cardType: 'trainer',
      frequency: 60,
      avgCount: 2,
      topAvgCount: 2,
      inUserDeck: true,
      userCount: 1,
    },
    {
      name: 'Rare Candy',
      cardType: 'trainer',
      frequency: 40,
      avgCount: 2,
      topAvgCount: 2,
      inUserDeck: false,
      userCount: 0,
    },
    {
      name: 'Iono',
      cardType: 'trainer',
      frequency: 15,
      avgCount: 1,
      topAvgCount: 1,
      inUserDeck: true,
      userCount: 2,
    },
  ];

  const suggestedAdds = cardStats.filter((c) => c.frequency >= 55 && !c.inUserDeck);
  const suggestedRemoves = cardStats.filter((c) => c.frequency <= 20 && c.inUserDeck);
  const countAdjustments = cardStats
    .filter((c) => c.inUserDeck && c.frequency >= 50)
    .map((c) => ({
      name: c.name,
      userCount: c.userCount,
      typicalCount: Math.round(c.topAvgCount),
      diff: Math.round(c.topAvgCount) - c.userCount,
    }))
    .filter((c) => Math.abs(c.diff) >= 1);

  return {
    archetypeSlug: 'dragapult-ex',
    listsAnalyzed: 12,
    topListsAnalyzed: 5,
    cardStats,
    suggestedAdds,
    suggestedRemoves,
    countAdjustments,
    fetchedAt: new Date('2026-06-01T00:00:00.000Z'),
  };
}

/** Snapshot of everything attachCardDeltas must NOT change on a CardStat —
 *  frequency/avgCount/topAvgCount/inUserDeck/userCount must stay bit-identical
 *  (plan §3.7 bullet list). Deliberately excludes delta/tier. */
function frequencyFieldsOf(c: CardStat) {
  return {
    name: c.name,
    cardType: c.cardType,
    frequency: c.frequency,
    avgCount: c.avgCount,
    topAvgCount: c.topAvgCount,
    inUserDeck: c.inUserDeck,
    userCount: c.userCount,
  };
}

const SOURCE = { computedAt: '2026-06-01T00:00:00.000Z', windowDays: 14, listsAnalyzed: 40 };

function ultraBallServerRow(overrides: Partial<ArchetypeCardStat> = {}): ArchetypeCardStat {
  return {
    // Lower-cased server spelling — proves the join goes through
    // normalizeCardName, not a raw string match against the client's
    // 'Ultra Ball' (plan §3.7 bullet 3).
    cardName: 'ultra ball',
    cardType: 'trainer',
    listsAnalyzed: 40,
    listsWith: 36,
    inclusionPct: 90,
    avgCount: 3.6,
    delta: makeDelta(),
    tier: 'confirmed',
    ...overrides,
  };
}

describe('attachCardDeltas — pure join, existing frequency logic untouched (plan §3.7)', () => {
  it('keeps suggestedAdds/suggestedRemoves/countAdjustments/cardStats identical in length, order and content', () => {
    const before = buildComparisonResult();
    const beforeSnapshot = {
      cardStats: before.cardStats.map((c) => c.name),
      suggestedAdds: before.suggestedAdds.map((c) => c.name),
      suggestedRemoves: before.suggestedRemoves.map((c) => c.name),
      countAdjustments: before.countAdjustments.map((c) => ({ ...c })),
      frequencyFields: before.cardStats.map(frequencyFieldsOf),
    };

    const after = attachCardDeltas(before, [ultraBallServerRow()], SOURCE);

    expect(after.cardStats.map((c) => c.name)).toEqual(beforeSnapshot.cardStats);
    expect(after.suggestedAdds.map((c) => c.name)).toEqual(beforeSnapshot.suggestedAdds);
    expect(after.suggestedRemoves.map((c) => c.name)).toEqual(beforeSnapshot.suggestedRemoves);
    expect(after.countAdjustments).toEqual(beforeSnapshot.countAdjustments);
    // frequency/avgCount/topAvgCount/inUserDeck/userCount stay bit-identical.
    expect(after.cardStats.map(frequencyFieldsOf)).toEqual(beforeSnapshot.frequencyFields);
  });

  it('joins by normalizeCardName — client "Ultra Ball" finds server "ultra ball"', () => {
    const result = buildComparisonResult();
    const delta = makeDelta({ deltaPp: 12.3 });

    const after = attachCardDeltas(result, [ultraBallServerRow({ delta })], SOURCE);

    const ultraBall = after.cardStats.find((c) => c.name === 'Ultra Ball');
    expect(ultraBall).toBeDefined();
    expect(ultraBall?.delta).toEqual(delta);
    expect(ultraBall?.tier).toBe('confirmed');
  });

  it('leaves delta and tier undefined for a card with no matching server row', () => {
    const result = buildComparisonResult();

    // Only "Ultra Ball" has a server row — "Rare Candy" and "Iono" don't.
    const after = attachCardDeltas(result, [ultraBallServerRow()], SOURCE);

    const rareCandy = after.cardStats.find((c) => c.name === 'Rare Candy');
    const iono = after.cardStats.find((c) => c.name === 'Iono');
    expect(rareCandy).toBeDefined();
    expect(rareCandy?.delta).toBeUndefined();
    expect(rareCandy?.tier).toBeUndefined();
    expect(iono?.delta).toBeUndefined();
    expect(iono?.tier).toBeUndefined();
  });

  it('stats: [] leaves the result structurally identical except cardStatsSource is set', () => {
    const before = buildComparisonResult();
    const beforeSnapshot = {
      cardStats: before.cardStats.map((c) => c.name),
      suggestedAdds: before.suggestedAdds.map((c) => c.name),
      suggestedRemoves: before.suggestedRemoves.map((c) => c.name),
      countAdjustments: before.countAdjustments.map((c) => ({ ...c })),
      frequencyFields: before.cardStats.map(frequencyFieldsOf),
    };

    const after = attachCardDeltas(before, [], SOURCE);

    expect(after.cardStats.map((c) => c.name)).toEqual(beforeSnapshot.cardStats);
    expect(after.suggestedAdds.map((c) => c.name)).toEqual(beforeSnapshot.suggestedAdds);
    expect(after.suggestedRemoves.map((c) => c.name)).toEqual(beforeSnapshot.suggestedRemoves);
    expect(after.countAdjustments).toEqual(beforeSnapshot.countAdjustments);
    expect(after.cardStats.map(frequencyFieldsOf)).toEqual(beforeSnapshot.frequencyFields);
    expect(after.cardStats.every((c) => c.delta === undefined && c.tier === undefined)).toBe(true);
    expect(after.cardStatsSource).toEqual(SOURCE);
  });

  it('propagates the delta to the SAME card in both cardStats and suggestedAdds (plan §4 step 11 anchor test)', () => {
    // deckComparison.ts:258 derives suggestedAdds via cardStats.filter(...) —
    // the concrete regression this test protects against: joining stats must
    // reach the card wherever it is referenced, not just inside cardStats.
    const result = buildComparisonResult();
    const delta = makeDelta({ deltaPp: 20.0 });

    const after = attachCardDeltas(result, [ultraBallServerRow({ delta })], SOURCE);

    const inCardStats = after.cardStats.find((c) => c.name === 'Ultra Ball');
    const inSuggestedAdds = after.suggestedAdds.find((c) => c.name === 'Ultra Ball');
    expect(inSuggestedAdds).toBeDefined();
    expect(inCardStats?.delta).toBeDefined();
    expect(inSuggestedAdds?.delta).toBeDefined();
    expect(inSuggestedAdds?.delta).toEqual(inCardStats?.delta);
    expect(inSuggestedAdds?.tier).toBe(inCardStats?.tier);
    expect(inSuggestedAdds?.tier).toBe('confirmed');
  });
});
