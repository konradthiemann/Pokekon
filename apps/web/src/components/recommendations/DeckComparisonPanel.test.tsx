import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import i18n from '../../i18n';
import { DeckComparisonPanel } from './DeckComparisonPanel';
import type { CardStat, ComparisonResult } from '../../lib/deckComparison';
import type { CardPerformanceDelta } from '@pokekon/shared';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

/**
 * Plan .claude/plans/recommendation-to-prognosis.md §3.7 — "UI (
 * DeckComparisonPanel.tsx) — Datenvertrag, kein fertiges Design." The plan
 * deliberately does NOT dictate markup, only these binding data-contract
 * requirements, which this suite covers:
 * - CardRow renders BOTH signals side by side (existing FrequencyBar +
 *   the new delta).
 * - tier === 'popularityParadox' gets its own icon AND its own text label,
 *   not just a colour.
 * - tier === 'insufficient' shows no number, only the "not enough data" text.
 * - comparison.delta.correlationNote is present at every delta display
 *   (plan §6 risk 2 — a hard requirement, not optional).
 *
 * INFERRED, NOT DICTATED BY THE PLAN (flagged per the tester's brief):
 * - `data-testid="card-row-<name>"` on each CardRow's root element, to scope
 *   assertions to one card's row.
 * - `data-testid="tier-icon-<tier>"` on the tier's icon element, to verify
 *   an icon (not just text) exists for the paradox tier.
 * The implementer may use different hooks as long as an equivalent way to
 * scope per-row assertions exists — these two are the minimal seams this
 * test needed given the plan's explicit "no fixed design" note.
 *
 * Text assertions are resolved via `i18n.t(...)` with the EXACT keys the
 * plan defines in §3.9, not hard-coded English copy — so the test stays
 * correct once the implementer fills in the (currently missing) translation
 * files instead of the tester inventing wording that isn't theirs to define.
 */

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

const CARD_WITH_DELTA: CardStat = {
  name: 'Ultra Ball',
  cardType: 'trainer',
  frequency: 80,
  avgCount: 3.5,
  topAvgCount: 4,
  inUserDeck: false,
  userCount: 0,
  delta: makeDelta({ deltaPp: 15.0, lowPct: 50.0, highPct: 78.0, significant: true }),
  tier: 'confirmed',
};

const PARADOX_CARD: CardStat = {
  name: 'Charizard ex',
  cardType: 'pokemon',
  frequency: 70,
  avgCount: 2,
  topAvgCount: 2,
  inUserDeck: false,
  userCount: 0,
  delta: makeDelta({ deltaPp: -2.0, lowPct: 38.0, highPct: 58.0, significant: false }),
  tier: 'popularityParadox',
};

const INSUFFICIENT_CARD: CardStat = {
  name: 'Rare Candy',
  cardType: 'trainer',
  frequency: 60,
  avgCount: 3,
  topAvgCount: 3,
  inUserDeck: false,
  userCount: 0,
  delta: makeDelta({ deltaPp: 5.0, widthPct: 55.0, significant: false }),
  tier: 'insufficient',
};

// All three qualify for suggestedAdds (frequency >= 55 && !inUserDeck) —
// deckComparison.ts:258, unchanged — so they render via the existing
// CardRow used in that section.
const CARD_STATS = [CARD_WITH_DELTA, PARADOX_CARD, INSUFFICIENT_CARD];

const COMPARISON_RESULT: ComparisonResult = {
  archetypeSlug: 'dragapult-ex',
  listsAnalyzed: 30,
  topListsAnalyzed: 9,
  cardStats: CARD_STATS,
  suggestedAdds: CARD_STATS,
  suggestedRemoves: [],
  countAdjustments: [],
  fetchedAt: new Date('2026-06-01T00:00:00.000Z'),
  cardStatsSource: { computedAt: '2026-06-01T00:00:00.000Z', windowDays: 14, listsAnalyzed: 30 },
};

vi.mock('../../store/dashboardStore', () => ({
  useDashboardStore: () => ({
    deckArchSlug: 'dragapult-ex',
    comparisonResult: COMPARISON_RESULT,
    isComparing: false,
    compareProgress: '',
    compareError: null,
    runDeckComparison: vi.fn(),
    setActiveTab: vi.fn(),
  }),
}));

describe('DeckComparisonPanel — performance delta signal (plan §3.7)', () => {
  it('renders both the existing copy frequency AND the delta side by side for a card with a delta', () => {
    render(<DeckComparisonPanel />);
    const row = screen.getByTestId('card-row-Ultra Ball');

    // Existing frequency signal, unchanged (FrequencyBar renders `${pct}%`).
    expect(within(row).getByText('80%')).toBeInTheDocument();
    // The new delta signal: the raw deltaPp number must appear somewhere in
    // the same row (the plan does not dictate exact wording, only that the
    // number is shown via formatWithInterval).
    expect(within(row).getByText((content) => content.includes('15'))).toBeInTheDocument();
  });

  it('gives tier === "popularityParadox" a distinct label AND icon, not just a colour', () => {
    render(<DeckComparisonPanel />);
    const paradoxRow = screen.getByTestId('card-row-Charizard ex');
    const paradoxLabel = i18n.t('recommendations:comparison.delta.paradox');

    expect(within(paradoxRow).getByText(paradoxLabel)).toBeInTheDocument();
    expect(within(paradoxRow).getByTestId('tier-icon-popularityParadox')).toBeInTheDocument();

    // A confirmed-tier row must NOT carry the paradox label — this is what
    // makes the label "distinct", not just present everywhere.
    const confirmedRow = screen.getByTestId('card-row-Ultra Ball');
    expect(within(confirmedRow).queryByText(paradoxLabel)).not.toBeInTheDocument();
  });

  it('shows no number for tier === "insufficient", only the "not enough data" text', () => {
    render(<DeckComparisonPanel />);
    const row = screen.getByTestId('card-row-Rare Candy');
    const insufficientLabel = i18n.t('recommendations:comparison.delta.insufficient');

    expect(within(row).getByText(insufficientLabel)).toBeInTheDocument();
    // deltaPp (5.0) must NOT be rendered as a number for this tier, even
    // though the fixture's delta object carries a value.
    expect(within(row).queryByText((content) => content.includes('5.0'))).not.toBeInTheDocument();
  });

  it('shows the mandatory correlation-not-causation note at every delta display (plan §6 risk 2)', () => {
    render(<DeckComparisonPanel />);
    const correlationNote = i18n.t('recommendations:comparison.delta.correlationNote');

    for (const name of ['Ultra Ball', 'Charizard ex', 'Rare Candy']) {
      const row = screen.getByTestId(`card-row-${name}`);
      expect(within(row).getByText(correlationNote)).toBeInTheDocument();
    }
  });
});
