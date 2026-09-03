import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import i18n from '../../i18n';
import { EquilibriumPanel } from './EquilibriumPanel';
import type { MetaEquilibriumResponse, EquilibriumArchetypeRow } from '../../lib/api';

/**
 * `EquilibriumPanel.tsx` does not exist yet — RED step of the tester/
 * implementer split (rules/tdd.md), for plan
 * .claude/plans/meta-game-theory-layer.md §3.8 / §4 step 21.
 *
 * "UI (`EquilibriumPanel.tsx`) — Datenvertrag, kein fertiges Design." The
 * plan deliberately does NOT dictate markup, only binding data-contract
 * requirements. This suite covers exactly those, per the tester's brief:
 * - Block 1: the plain-language robustness sentence AND the raw exclusion
 *   percentage both render, side by side (Konrad's decision 3) — and are
 *   withheld for `exclusionBand === 'likelyIn'` decks (§3.8 bullet 2).
 * - The stronger "excludedCertain" sentence appears ONLY for archetypes
 *   where the theorem in plan §3.0c actually applies.
 * - `isCompositionFragile` is a mandatory pre-display check (§3.8 bullet 3 /
 *   §6 risk 2): the fragility warning appears/disappears with it.
 * - The popularity-paradox case gets a distinct ICON *and* LABEL, not just a
 *   colour (a11y precedent from the Spec-3 plan §3.6, already applied in
 *   `DeckComparisonPanel.test.tsx`).
 * - Provenance (`computedAt`, `windowDays`, `resamples`, `seed`,
 *   `imputedCellSharePct`) is visible (§3.8 bullet 6).
 * - A cold start (`run: null`) renders gracefully, no crash, no existing
 *   Meta block is affected (§5 rollback story).
 *
 * INFERRED, NOT DICTATED BY THE PLAN (flagged per the tester's brief, same
 * spirit as DeckComparisonPanel.test.tsx's comment block):
 * - `EquilibriumPanel` takes the ALREADY-FETCHED wire response as a single
 *   `data: MetaEquilibriumResponse` prop (pattern: `FieldScorePanel`'s
 *   `fieldScore` prop), rather than fetching via `getMetaEquilibrium` itself
 *   (pattern: `PredictionPanel`/`MatchupMatrix`). The plan's wire contract in
 *   §3.7 already carries a cold-start-safe shape (`run: null`,
 *   `archetypes: []`), which is what makes this prop-based contract
 *   testable without mocking `fetch`. The implementer may choose to fetch
 *   internally instead and pass the same shape down — the DATA contract
 *   below is what is binding, not this prop split.
 * - `data-testid="equilibrium-archetype-<archetypeId>"` on each archetype
 *   row's root, to scope per-row assertions (mirrors `card-row-<name>` in
 *   DeckComparisonPanel.test.tsx).
 * - `data-testid="paradox-icon"` on the popularity-paradox icon element
 *   within a row (mirrors `tier-icon-<tier>`).
 * - `data-testid="composition-fragility-warning"` for the fragility notice:
 *   the plan's i18n table (§3.9) does not give `equilibrium.composition.
 *   fragile` literal copy (unlike the other keys, it is described only as
 *   "Fragilitaets-Hinweis, siehe 3.8"), so this test cannot look up exact
 *   text via `i18n.t()` the way it does for the other keys below.
 * - `data-testid="row-coverage-thin"` for the low-rowCoveragePct flag: the
 *   plan gives no numeric threshold for "thin" (unlike `exclusionBand`'s
 *   90/70/30), so the bonus coverage test below only pins the unambiguous
 *   extreme (`rowCoveragePct === 0`, the "Equalizer" case from plan §3.2),
 *   not a boundary.
 *
 * Every OTHER text assertion is resolved via `i18n.t(...)` with the EXACT
 * keys the plan defines in §3.9 (German — the plan gives literal copy only
 * for `de`, and the existing `de/meta.json` uses real umlauts, not the
 * plan's ASCII-substituted "ae/oe/ue" spellings, so hard-coding the plan's
 * literal text would NOT match the real translation once it lands). Using
 * `i18n.t()` dynamically means these assertions stay correct once the
 * implementer fills in the currently-missing `equilibrium.*` keys, instead
 * of the tester inventing or mistranscribing wording that isn't theirs to
 * define.
 */

beforeAll(async () => {
  await i18n.changeLanguage('de');
});

function makeArchetypeRow(
  overrides: Partial<EquilibriumArchetypeRow> = {},
): EquilibriumArchetypeRow {
  return {
    archetypeId: 'grimmsnarl-ex',
    archetypeName: 'Grimmsnarl ex',
    sharePct: 10.0,
    weightPct: 34.3,
    equilibriumPayoffPct: 50.0,
    paradoxGapPp: -24.3,
    inSupport: true,
    excludedCertain: false,
    rowCoveragePct: 92.0,
    exclusionRatePct: 3.5,
    certainExclusionRatePct: 0.0,
    meanWeightPct: 33.8,
    weightP05Pct: 20.1,
    weightP95Pct: 45.2,
    fitnessPct: 50.0,
    replicatorGrowthPct: 0.0,
    projectedSharePct: 10.0,
    weekFitnessPct: 50.2,
    previousWeekFitnessPct: 49.8,
    fitnessDeltaPp: 0.4,
    observedShareDeltaPp: 0.6,
    direction: 'stable',
    ...overrides,
  };
}

// The reference paper's own Dragapult example (plan §0.4 / §3.8): 15.5 %
// share, 0 % equilibrium weight, excluded in 77.9 % of the 2000 resamples,
// and provably excluded from every equilibrium (excludedCertain).
const DRAGAPULT_ROW = makeArchetypeRow({
  archetypeId: 'dragapult-dusknoir',
  archetypeName: 'Dragapult Dusknoir',
  sharePct: 15.5,
  weightPct: 0,
  equilibriumPayoffPct: 44.0,
  paradoxGapPp: 15.5,
  inSupport: false,
  excludedCertain: true,
  rowCoveragePct: 88.0,
  exclusionRatePct: 77.9,
});

const GRIMMSNARL_ROW = makeArchetypeRow(); // exclusionRatePct 3.5 -> 'likelyIn', not certain, not paradox

const THIN_COVERAGE_ROW = makeArchetypeRow({
  archetypeId: 'ceruledge-ex',
  archetypeName: 'Ceruledge ex',
  sharePct: 2.3,
  weightPct: 8.0,
  paradoxGapPp: -5.7,
  inSupport: true,
  excludedCertain: false,
  rowCoveragePct: 0, // no real data at all -> the "Equalizer" risk (plan §3.2)
  exclusionRatePct: 40.0,
});

function makeResponse(overrides: Partial<MetaEquilibriumResponse> = {}): MetaEquilibriumResponse {
  return {
    windowDays: 14,
    online: true,
    bo1: true,
    computedAt: '2026-06-01T12:00:00.000Z',
    run: {
      archetypeCount: 8,
      valuePct: 50.0,
      supportSize: 7,
      equalizerCount: 7,
      imputedCellSharePct: 4.2,
      resamples: 2000,
      seed: 42,
      failedResamples: 0,
      exactSupportRatePct: 2.1,
      currentPeriod: '2026-W23',
      previousPeriod: '2026-W22',
    },
    archetypes: [DRAGAPULT_ROW, GRIMMSNARL_ROW],
    ...overrides,
  };
}

describe('EquilibriumPanel — robust plain-language text + percentage (plan §3.8, Konrad decision 3)', () => {
  it('shows BOTH the plain-language sentence and the exclusion percentage for a robustly-excluded archetype', () => {
    render(<EquilibriumPanel data={makeResponse()} />);
    const row = screen.getByTestId('equilibrium-archetype-dragapult-dusknoir');

    // exclusionRatePct 77.9 -> exclusionBand 'robust' (plan §3.8 table).
    const robustSentence = i18n.t('meta:equilibrium.robust.robust', {
      name: DRAGAPULT_ROW.archetypeName,
    });
    expect(within(row).getByText(robustSentence)).toBeInTheDocument();
    // The raw percentage must ALSO be visible, never replaced by the sentence.
    expect(
      within(row).getByText((content) => content.includes('77.9') || content.includes('77,9')),
    ).toBeInTheDocument();
  });

  it('additionally shows the stronger "provably excluded" sentence for excludedCertain === true', () => {
    render(<EquilibriumPanel data={makeResponse()} />);
    const row = screen.getByTestId('equilibrium-archetype-dragapult-dusknoir');

    const certainSentence = i18n.t('meta:equilibrium.robust.certain');
    expect(within(row).getByText(certainSentence)).toBeInTheDocument();
  });

  it('does NOT show the certain-exclusion sentence for an archetype where the theorem does not apply', () => {
    render(<EquilibriumPanel data={makeResponse()} />);
    const row = screen.getByTestId('equilibrium-archetype-grimmsnarl-ex');

    const certainSentence = i18n.t('meta:equilibrium.robust.certain');
    expect(within(row).queryByText(certainSentence)).not.toBeInTheDocument();
  });

  it('does NOT show any robust-exclusion sentence for an exclusionBand === "likelyIn" archetype (plan §3.8 bullet 2)', () => {
    render(<EquilibriumPanel data={makeResponse()} />);
    const row = screen.getByTestId('equilibrium-archetype-grimmsnarl-ex');

    // GRIMMSNARL_ROW.exclusionRatePct === 3.5 -> 'likelyIn', excluded from
    // Block 1 entirely per the plan ("Je Archetyp mit exclusionBand !==
    // 'likelyIn'").
    for (const key of [
      'meta:equilibrium.robust.veryRobust',
      'meta:equilibrium.robust.robust',
      'meta:equilibrium.robust.unclear',
    ]) {
      const sentence = i18n.t(key, { name: GRIMMSNARL_ROW.archetypeName });
      expect(within(row).queryByText(sentence)).not.toBeInTheDocument();
    }
  });
});

describe('EquilibriumPanel — composition fragility warning (plan §3.8 bullet 3 / §6 risk 2)', () => {
  it('shows the fragility warning when isCompositionFragile is true (paper value: 2.1 % exact-support rate)', () => {
    const data = makeResponse({
      run: {
        archetypeCount: 8,
        valuePct: 50.0,
        supportSize: 7,
        equalizerCount: 7,
        imputedCellSharePct: 4.2,
        resamples: 2000,
        seed: 42,
        failedResamples: 0,
        exactSupportRatePct: 2.1, // fragile: below FRAGILE_SUPPORT_RATE_PCT (50)
        currentPeriod: '2026-W23',
        previousPeriod: '2026-W22',
      },
    });
    render(<EquilibriumPanel data={data} />);

    expect(screen.getByTestId('composition-fragility-warning')).toBeInTheDocument();
  });

  it('does NOT show the fragility warning when the composition is robust (exactSupportRatePct 80, equalizerCount === supportSize)', () => {
    const data = makeResponse({
      run: {
        archetypeCount: 8,
        valuePct: 50.0,
        supportSize: 7,
        equalizerCount: 7,
        imputedCellSharePct: 4.2,
        resamples: 2000,
        seed: 42,
        failedResamples: 0,
        exactSupportRatePct: 80,
        currentPeriod: '2026-W23',
        previousPeriod: '2026-W22',
      },
    });
    render(<EquilibriumPanel data={data} />);

    expect(screen.queryByTestId('composition-fragility-warning')).not.toBeInTheDocument();
  });
});

describe('EquilibriumPanel — popularity paradox (plan §3.8 bullet 4, a11y precedent from Spec-3 plan §3.6)', () => {
  it('gives the popularity-paradox archetype a distinct icon AND text label, not just a colour', () => {
    render(<EquilibriumPanel data={makeResponse()} />);
    const row = screen.getByTestId('equilibrium-archetype-dragapult-dusknoir');
    const paradoxLabel = i18n.t('meta:equilibrium.paradox.label');

    expect(within(row).getByText(paradoxLabel)).toBeInTheDocument();
    expect(within(row).getByTestId('paradox-icon')).toBeInTheDocument();
  });

  it('does NOT mark an archetype without a popularity paradox (weight roughly tracks share)', () => {
    render(<EquilibriumPanel data={makeResponse()} />);
    const row = screen.getByTestId('equilibrium-archetype-grimmsnarl-ex');
    const paradoxLabel = i18n.t('meta:equilibrium.paradox.label');

    expect(within(row).queryByText(paradoxLabel)).not.toBeInTheDocument();
    expect(within(row).queryByTestId('paradox-icon')).not.toBeInTheDocument();
  });
});

describe('EquilibriumPanel — provenance (plan §3.8 bullet 6)', () => {
  it('shows computedAt, windowDays, resamples, seed and imputedCellSharePct', () => {
    const data = makeResponse();
    render(<EquilibriumPanel data={data} />);

    // Exact wording/format is not dictated — only that every value is
    // visible somewhere in the panel (plan: "sind sichtbar").
    expect(
      screen.getByText((content) => content.includes('14')), // windowDays
    ).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes('2000'))).toBeInTheDocument(); // resamples
    expect(screen.getByText((content) => content.includes('42'))).toBeInTheDocument(); // seed
    expect(
      screen.getByText((content) => content.includes('4.2') || content.includes('4,2')), // imputedCellSharePct
    ).toBeInTheDocument();
    // computedAt: rendered as SOME human-readable form of the ISO date; the
    // day (01) is the most format-agnostic fragment to assert on.
    expect(
      screen.getByText((content) => content.includes('2026') || content.includes('01')),
    ).toBeInTheDocument();
  });
});

describe('EquilibriumPanel — cold start (plan §5 rollout: empty tables, computedAt/run null)', () => {
  it('renders gracefully without crashing when run is null and archetypes is empty', () => {
    const coldData = makeResponse({ computedAt: null, run: null, archetypes: [] });

    expect(() => render(<EquilibriumPanel data={coldData} />)).not.toThrow();
    expect(screen.getByText(i18n.t('meta:equilibrium.empty'))).toBeInTheDocument();
  });
});

describe('EquilibriumPanel — thin row coverage (plan §3.2 "Equalizer" risk / §3.8 bullet 5)', () => {
  it('flags a support member whose row is backed entirely by imputed data (rowCoveragePct === 0)', () => {
    const data = makeResponse({ archetypes: [THIN_COVERAGE_ROW] });
    render(<EquilibriumPanel data={data} />);
    const row = screen.getByTestId('equilibrium-archetype-ceruledge-ex');

    expect(within(row).getByTestId('row-coverage-thin')).toBeInTheDocument();
  });
});
