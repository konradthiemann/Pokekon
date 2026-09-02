import { describe, it, expect, beforeAll } from 'vitest';
import { renderHook } from '@testing-library/react';
import i18n from '../i18n';
import { useRecommendations } from './useRecommendations';
import type { ArchetypeStats, DeckCard, DeckSnapshot, OpponentLog } from '../types';
import type { ArchetypeCardStat, CardPerformanceDelta } from '@pokekon/shared';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

function snapshot(over: Partial<DeckSnapshot>): DeckSnapshot {
  return {
    id: 1,
    label: 'V1',
    cards: '[]',
    totalCards: 60,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function log(over: Partial<OpponentLog>): OpponentLog {
  return {
    archetype: 'Dragapult ex',
    eventType: 'Online',
    eventDate: '2026-06-01',
    result: 'W',
    notes: '',
    ...over,
  };
}

const MINIMAL_STATS: ArchetypeStats = {
  archetype: 'Dragapult ex',
  encounters: 1,
  wins: 0,
  losses: 0,
  ties: 0,
  winRate: 0,
  frequencyPct: 0,
  metaWinRate: 0,
  bo1EquivalentWinRate: null,
  bo1Games: 0,
  bo3Games: 0,
  unknownFormatGames: 0,
};

// ─── Fixtures & helpers for Slice D (plan recommendation-to-prognosis.md §3.8) ─

function deckCard(over: Partial<DeckCard>): DeckCard {
  return {
    cardId: 1,
    name: 'Nest Ball',
    count: 4,
    type: 'Trainer',
    role: 'item',
    ...over,
  };
}

function deltaFixture(over: Partial<CardPerformanceDelta>): CardPerformanceDelta {
  return {
    listsWith: 20,
    listsWithout: 20,
    superiorityPct: 70,
    deltaPp: 20,
    lowPct: 55,
    highPct: 85,
    widthPct: 30,
    significant: true,
    effectiveN: 15,
    meanPercentileWithPct: 65,
    meanPercentileWithoutPct: 45,
    ...over,
  };
}

function cardStat(over: Partial<ArchetypeCardStat>): ArchetypeCardStat {
  return {
    cardName: 'Iono',
    cardType: 'trainer',
    listsAnalyzed: 40,
    listsWith: 20,
    inclusionPct: 50,
    avgCount: 1,
    delta: deltaFixture({}),
    tier: 'hiddenGem',
    ...over,
  };
}

/** Weak-matchup opponent that satisfies Rule 2's own trigger condition
 * (`stats.wins > 0 && stats.winRate <= 50 && stats.encounters >= 5`,
 * `useRecommendations.ts:166`) with `encounters < 8` and no local-meta match,
 * so priority is 'medium' — deliberately unrelated to the card names used in
 * the cardDeltas fixtures above, so a card-name string can never accidentally
 * collide with the opponent archetype name in these tests. */
const RULE2_OPPONENT: ArchetypeStats = {
  archetype: 'Gardevoir ex',
  encounters: 6,
  wins: 3,
  losses: 3,
  ties: 0,
  winRate: 50,
  frequencyPct: 10,
  metaWinRate: 50,
  bo1EquivalentWinRate: null,
  bo1Games: 0,
  bo3Games: 0,
  unknownFormatGames: 0,
};

/**
 * Golden fixture for Rule 2's `suggestion`, reconstructed from the CURRENT
 * production code (`useRecommendations.ts:173`) using the real, already-
 * loaded `en` translations — not an invented string. This is what "identical
 * to today" (plan §3.8 behavior 1) is measured against.
 */
function expectedTechSuggestion(archetype: string, isLocal: boolean): string {
  const base = i18n.t('recommendations:rules.tech.suggestion', { archetype });
  return `${base}${isLocal ? ` ${i18n.t('recommendations:localMetaBadge')}` : ''}`;
}

/**
 * Golden fixture for Rule 2's `reasoning`, reconstructed from the CURRENT
 * production code (`useRecommendations.ts:174-180`) the same way. Used by
 * every regression/fallback assertion below.
 */
function expectedTechReasoning(
  stats: Pick<ArchetypeStats, 'wins' | 'losses' | 'archetype' | 'winRate' | 'encounters'>,
  isLocal: boolean,
): string {
  const gamesFragment = i18n.t('recommendations:games', { count: stats.encounters });
  const base = i18n.t('recommendations:rules.tech.reasoning', {
    wins: stats.wins,
    losses: stats.losses,
    archetype: stats.archetype,
    winRate: stats.winRate,
    games: gamesFragment,
  });
  const localPart = isLocal ? ` ${i18n.t('recommendations:rules.tech.localNote')}` : '';
  return `${base}${localPart} ${i18n.t('recommendations:rules.tech.dataHint')}`;
}

describe('useRecommendations — win-rate degradation rule (plan personal-data-role-rework §6 decision 1)', () => {
  it('counts ties as a third of a win when comparing deck-snapshot win rates (rule 6, overall decline)', () => {
    // "Current" snapshot (id 1, deckSnapshots[0]): 1W/1L/2T. Naive
    // wins/(wins+losses) = 50 %; tie-weighted = (1 + 2/3) / 4 = 41.7 % ≈ 42 %.
    const currentLogs: OpponentLog[] = [
      log({ deckSnapshotId: 1, result: 'W' }),
      log({ deckSnapshotId: 1, result: 'L' }),
      log({ deckSnapshotId: 1, result: 'T' }),
      log({ deckSnapshotId: 1, result: 'T' }),
    ];
    // "Best" older snapshot (id 2): 3W/0L/0T = 100 % either way.
    const bestLogs: OpponentLog[] = [
      log({ deckSnapshotId: 2, result: 'W' }),
      log({ deckSnapshotId: 2, result: 'W' }),
      log({ deckSnapshotId: 2, result: 'W' }),
    ];

    const { result } = renderHook(() =>
      useRecommendations({
        archetypeStats: [MINIMAL_STATS],
        deckCards: [],
        opponentLogs: [...currentLogs, ...bestLogs],
        deckSnapshots: [snapshot({ id: 1, label: 'Current' }), snapshot({ id: 2, label: 'Old' })],
        localMeta: [],
      }),
    );

    const decline = result.current.find((r) => r.id === 'version-overall-decline');
    expect(decline).toBeDefined();
    // Old naive formula would read "100% → 50%"; tie-weighted reads "100% → 42%".
    expect(decline?.suggestion).toContain('42%');
    expect(decline?.suggestion).not.toContain('50%');
  });
});

// ─── Slice D — Rule 2 card-delta enrichment (plan recommendation-to-prognosis.md §3.8) ─
//
// `RecommendationInput.cardDeltas?: ArchetypeCardStat[] | null` does not exist
// yet on the hook's input type, so every call below that references it is
// expected to fail TypeScript's excess-property check until the field is
// added — that is the correct red state for this slice (see plan §3.8 and
// the tester's task description).
describe('useRecommendations — rule 2 card-delta enrichment (plan recommendation-to-prognosis §3.8)', () => {
  const CARD_DELTAS_ABSENT_CASES: [string, ArchetypeCardStat[] | null | undefined][] = [
    ['undefined', undefined],
    ['null', null],
    ['[] (empty array)', []],
  ];

  it.each(CARD_DELTAS_ABSENT_CASES)(
    'produces the exact current-behavior recommendation when cardDeltas is %s (regression, behavior 1)',
    (_label, cardDeltas) => {
      const { result } = renderHook(() =>
        useRecommendations({
          archetypeStats: [RULE2_OPPONENT],
          deckCards: [],
          opponentLogs: [],
          deckSnapshots: [],
          localMeta: [],
          cardDeltas,
        }),
      );

      const rec = result.current.find((r) => r.id === `tech-${RULE2_OPPONENT.archetype}`);
      expect(rec).toBeDefined();
      expect(rec?.priority).toBe('medium');
      expect(rec?.category).toBe('tech');
      expect(rec?.dataPoints).toBe(RULE2_OPPONENT.encounters);
      expect(rec?.suggestion).toBe(expectedTechSuggestion(RULE2_OPPONENT.archetype, false));
      expect(rec?.reasoning).toBe(expectedTechReasoning(RULE2_OPPONENT, false));
      // Must still literally end on the dataHint closing sentence (plan §3.8
      // behavior 1: "the same rules.tech.dataHint closing sentence").
      expect(rec?.reasoning.endsWith(i18n.t('recommendations:rules.tech.dataHint'))).toBe(true);
    },
  );

  it('enriches Rule 2 reasoning with up to two archetype-wide cards, sorted by deltaPp desc then inclusionPct desc as tiebreak (behavior 2)', () => {
    const ownedCard = deckCard({ name: 'Ultra Ball' });

    // Best delta of the qualifying pool -> must be named first.
    const cardA = cardStat({
      cardName: 'Iono',
      tier: 'hiddenGem',
      delta: deltaFixture({ deltaPp: 25, significant: true }),
      inclusionPct: 10,
    });
    // Ties with cardB on deltaPp (18); wins the tiebreak via higher inclusionPct
    // (70 vs 30) -> must be named second, ahead of cardB.
    const cardD = cardStat({
      cardName: 'Counter Catcher',
      tier: 'confirmed',
      delta: deltaFixture({ deltaPp: 18, significant: true }),
      inclusionPct: 70,
    });
    // Loses the deltaPp tie against cardD (lower inclusionPct) -> excluded by
    // the "up to two" cap.
    const cardB = cardStat({
      cardName: 'Night Stretcher',
      tier: 'hiddenGem',
      delta: deltaFixture({ deltaPp: 18, significant: true }),
      inclusionPct: 30,
    });
    // Qualifying tier but a strictly worse deltaPp than both named cards ->
    // excluded by the "up to two" cap.
    const cardC = cardStat({
      cardName: 'Rare Candy',
      tier: 'confirmed',
      delta: deltaFixture({ deltaPp: 12, significant: true }),
      inclusionPct: 90,
    });
    // Numerically the single best delta of the whole pool (+40pp, hiddenGem)
    // but already in the deck (matched case-insensitively via
    // normalizeCardName) -> must NOT be named, even though it would
    // otherwise outrank cardA.
    const ownedHiddenGem = cardStat({
      cardName: 'ULTRA BALL',
      tier: 'hiddenGem',
      delta: deltaFixture({ deltaPp: 40, significant: true }),
      inclusionPct: 5,
    });
    // Wrong tier despite a huge deltaPp -> the popularity-paradox anti-pattern
    // this whole slice must not resurrect.
    const paradox = cardStat({
      cardName: "Boss's Orders",
      tier: 'popularityParadox',
      delta: deltaFixture({ deltaPp: 99, significant: false }),
      inclusionPct: 95,
    });
    const discouraged = cardStat({
      cardName: 'Choice Belt',
      tier: 'discouraged',
      delta: deltaFixture({ deltaPp: -30, significant: true }),
      inclusionPct: 15,
    });
    const neutral = cardStat({
      cardName: 'Switch',
      tier: 'neutral',
      delta: deltaFixture({ deltaPp: 2, significant: false }),
      inclusionPct: 40,
    });
    const insufficient = cardStat({
      cardName: 'Buddy-Buddy Poffin',
      tier: 'insufficient',
      delta: null,
      inclusionPct: 60,
    });

    const { result } = renderHook(() =>
      useRecommendations({
        archetypeStats: [RULE2_OPPONENT],
        deckCards: [ownedCard],
        opponentLogs: [],
        deckSnapshots: [],
        localMeta: [],
        cardDeltas: [
          cardA,
          cardD,
          cardB,
          cardC,
          ownedHiddenGem,
          paradox,
          discouraged,
          neutral,
          insufficient,
        ],
      }),
    );

    const rec = result.current.find((r) => r.id === `tech-${RULE2_OPPONENT.archetype}`);
    expect(rec).toBeDefined();

    // The pre-existing reasoning (behavior 1) is preserved unchanged; the
    // delta sentence is APPENDED, per plan §3.8 behavior 2 ("wird an
    // reasoning ... ein zusätzlicher Satz angehängt").
    const baseline = expectedTechReasoning(RULE2_OPPONENT, false);
    expect(rec!.reasoning.startsWith(baseline)).toBe(true);
    expect(rec!.reasoning.length).toBeGreaterThan(baseline.length);
    const appended = rec!.reasoning.slice(baseline.length);

    const ionoIndex = appended.indexOf('Iono');
    const counterCatcherIndex = appended.indexOf('Counter Catcher');
    expect(ionoIndex).toBeGreaterThanOrEqual(0);
    expect(counterCatcherIndex).toBeGreaterThan(ionoIndex);

    // Excluded: the lower-ranked tie loser, a strictly worse qualifying card,
    // every wrong tier, and the owned card despite its huge delta.
    for (const excludedName of [
      'Night Stretcher',
      'Rare Candy',
      "Boss's Orders",
      'Choice Belt',
      'Switch',
      'Buddy-Buddy Poffin',
    ]) {
      expect(appended).not.toContain(excludedName);
    }
    expect(appended.toLowerCase()).not.toContain('ultra ball');
  });

  it("never names the weak-matchup opponent's archetype in the appended delta sentence (behavior 3, hard guardrail against the removed tech-suggestion anti-pattern)", () => {
    // Chosen to share no substring with any card name in this test, so the
    // ONLY way it could leak into `appended` is a naive implementation bug
    // (e.g. reusing the matchup's `archetype` interpolation value for the
    // delta sentence too).
    const opponent: ArchetypeStats = { ...RULE2_OPPONENT, archetype: 'Gholdengo ex' };

    const first = cardStat({
      cardName: 'Iono',
      tier: 'confirmed',
      delta: deltaFixture({ deltaPp: 22, significant: true }),
      inclusionPct: 60,
    });
    const second = cardStat({
      cardName: 'Counter Catcher',
      tier: 'hiddenGem',
      delta: deltaFixture({ deltaPp: 15, significant: true }),
      inclusionPct: 20,
    });

    const { result } = renderHook(() =>
      useRecommendations({
        archetypeStats: [opponent],
        deckCards: [],
        opponentLogs: [],
        deckSnapshots: [],
        localMeta: [],
        cardDeltas: [first, second],
      }),
    );

    const rec = result.current.find((r) => r.id === `tech-${opponent.archetype}`);
    expect(rec).toBeDefined();

    const baseline = expectedTechReasoning(opponent, false);
    expect(rec!.reasoning.startsWith(baseline)).toBe(true);
    const appended = rec!.reasoning.slice(baseline.length);
    expect(appended.length).toBeGreaterThan(0);

    // The opponent archetype legitimately appears in `baseline` (the
    // existing "You're {{wins}}W/{{losses}}L vs {{archetype}}" sentence) —
    // that is unchanged and fine. The hard guardrail (plan §3.8 point 3,
    // useRecommendations.ts:13-19) is that it must NEVER appear in the
    // newly-appended, archetype-wide/correlational portion.
    expect(appended).not.toContain(opponent.archetype);
    expect(appended.toLowerCase()).not.toContain(opponent.archetype.toLowerCase());
  });

  it('falls back to the exact behavior-1 output when cardDeltas has no qualifying card (behavior 4)', () => {
    const paradox = cardStat({
      cardName: 'Iono',
      tier: 'popularityParadox',
      delta: deltaFixture({ deltaPp: 30, significant: false }),
      inclusionPct: 80,
    });
    const discouraged = cardStat({
      cardName: 'Choice Belt',
      tier: 'discouraged',
      delta: deltaFixture({ deltaPp: -10, significant: true }),
      inclusionPct: 15,
    });
    const insufficient = cardStat({
      cardName: 'Rare Candy',
      tier: 'insufficient',
      delta: null,
      inclusionPct: 50,
    });
    // Would qualify by tier (hiddenGem, +20pp), but it's already in the deck.
    const ownedHiddenGem = cardStat({
      cardName: 'Nest Ball',
      tier: 'hiddenGem',
      delta: deltaFixture({ deltaPp: 20, significant: true }),
      inclusionPct: 25,
    });

    const { result } = renderHook(() =>
      useRecommendations({
        archetypeStats: [RULE2_OPPONENT],
        deckCards: [deckCard({ name: 'Nest Ball' })],
        opponentLogs: [],
        deckSnapshots: [],
        localMeta: [],
        cardDeltas: [paradox, discouraged, insufficient, ownedHiddenGem],
      }),
    );

    const rec = result.current.find((r) => r.id === `tech-${RULE2_OPPONENT.archetype}`);
    expect(rec).toBeDefined();
    expect(rec?.suggestion).toBe(expectedTechSuggestion(RULE2_OPPONENT.archetype, false));
    expect(rec?.reasoning).toBe(expectedTechReasoning(RULE2_OPPONENT, false));
  });

  it('does not change priority, dataPoints, or recommendation order when cardDeltas enriches the reasoning (behavior 5)', () => {
    const opponent1: ArchetypeStats = { ...RULE2_OPPONENT, archetype: 'Gardevoir ex' };
    // encounters >= 8 -> priority 'high' (useRecommendations.ts:171),
    // distinct dataPoints so array order is deterministic.
    const opponent2: ArchetypeStats = {
      ...RULE2_OPPONENT,
      archetype: 'Lugia VSTAR',
      encounters: 9,
      wins: 4,
      losses: 5,
      winRate: 44.4,
    };

    const withoutDeltas = renderHook(() =>
      useRecommendations({
        archetypeStats: [opponent1, opponent2],
        deckCards: [],
        opponentLogs: [],
        deckSnapshots: [],
        localMeta: [],
        cardDeltas: undefined,
      }),
    );

    const qualifying = cardStat({
      cardName: 'Iono',
      tier: 'hiddenGem',
      delta: deltaFixture({ deltaPp: 22, significant: true }),
      inclusionPct: 40,
    });
    const withDeltas = renderHook(() =>
      useRecommendations({
        archetypeStats: [opponent1, opponent2],
        deckCards: [],
        opponentLogs: [],
        deckSnapshots: [],
        localMeta: [],
        cardDeltas: [qualifying],
      }),
    );

    // Same total number of recommendations -- enrichment never adds a 15th
    // rule/id (plan §3.8 point 5: "die Zahl der Regeln bleibt 14").
    expect(withDeltas.result.current.length).toBe(withoutDeltas.result.current.length);

    const ids = ['tech-Gardevoir ex', 'tech-Lugia VSTAR', 'ratio-boss'];
    for (const id of ids) {
      const before = withoutDeltas.result.current.find((r) => r.id === id);
      const after = withDeltas.result.current.find((r) => r.id === id);
      expect(before).toBeDefined();
      expect(after).toBeDefined();
      expect(after?.priority).toBe(before?.priority);
      expect(after?.dataPoints).toBe(before?.dataPoints);

      const beforeIndex = withoutDeltas.result.current.findIndex((r) => r.id === id);
      const afterIndex = withDeltas.result.current.findIndex((r) => r.id === id);
      expect(afterIndex).toBe(beforeIndex);
    }

    // Sanity check that this test actually exercises the enrichment path --
    // otherwise the assertions above would trivially hold without proving
    // anything about behavior 5.
    const enrichedBefore = withoutDeltas.result.current.find((r) => r.id === 'tech-Gardevoir ex');
    const enrichedAfter = withDeltas.result.current.find((r) => r.id === 'tech-Gardevoir ex');
    expect(enrichedAfter?.reasoning).not.toBe(enrichedBefore?.reasoning);
  });
});
