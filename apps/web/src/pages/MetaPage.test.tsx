import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import i18n from '../i18n';
import { MetaPage } from './MetaPage';
import { getMetaEquilibrium } from '../lib/api';
import type { MetaEquilibriumResponse } from '../lib/api';
import { META_DEFAULT_DAYS } from '../components/meta/metaWindow';

/** Lets the mocked getFieldAnalysis/getMetaMatchups promises (and their
 *  effect callbacks) settle before assertions run, so React doesn't warn
 *  about state updates outside `act(...)`. Unrelated to the behaviour under
 *  test — the section list itself renders synchronously either way. */
async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

/**
 * The one binding requirement the plan is explicit about for `MetaPage.tsx`
 * (.claude/plans/meta-game-theory-layer.md §0.5, §3.8, §4 step 21, §6
 * decision 12, AC 6): the new equilibrium section is wired in as a
 * `CollapsibleSection` WITHOUT `defaultOpen` — collapsed by default, per the
 * "experimental/additional, doesn't replace the field-score" framing (spec
 * AC 5/6). The three EXISTING sections (matchup matrix, tournament meta,
 * prediction) all pass `defaultOpen` today (MetaPage.tsx:624,636,655) and
 * must keep doing so — their diff must stay empty (AC 6: "das Diff ... ist
 * leer").
 *
 * `MetaPage.tsx` does not render an equilibrium section yet — RED step of
 * the tester/implementer split (rules/tdd.md).
 *
 * INFERRED, NOT DICTATED BY THE PLAN: this test mocks `CollapsibleSection`
 * to inspect the `defaultOpen` prop each call site actually passes, rather
 * than asserting on collapsed/expanded DOM state. `CollapsibleSection.tsx`
 * (components/layout/CollapsibleSection.tsx) does not expose an
 * `aria-expanded` attribute or any other stable open/closed signal on its
 * toggle button, so prop-inspection via a mock is the most direct way to
 * pin this contract without inventing new markup on a component this plan
 * does not touch. Sections are matched by their title text containing
 * "experiment" (case-insensitive), which both `equilibrium.title` ("...
 * (experimentell)") and `equilibrium.experimentalBadge` ("experimentell")
 * satisfy regardless of exact final wording/casing.
 */

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  localStorage.clear();
  vi.mocked(getMetaEquilibrium)
    .mockReset()
    .mockResolvedValue(equilibriumResponse(META_DEFAULT_DAYS, '2020-06-15T00:00:00.000Z'));
});

vi.mock('../store/dashboardStore', () => ({
  useDashboardStore: () => ({
    syncMeta: vi.fn(),
    isSyncing: false,
    syncProgress: '',
    syncError: null,
    lastSynced: null,
    recentTournaments: [],
    isFetchingTournaments: false,
    tournamentsError: null,
    loadRecentTournaments: vi.fn(),
  }),
}));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getFieldAnalysis: vi.fn().mockResolvedValue({
      days: 14,
      online: true,
      bo1: true,
      tournamentCount: 0,
      totalPlayers: 0,
      matchupImportedAt: null,
      matchupSource: {
        ownPairs: 0,
        fallbackPairs: 0,
        ownGames: 0,
        trainerHillImportedAt: null,
        conflictCount: 0,
        conflicts: [],
      },
      archetypes: [],
    }),
    getMetaMatchups: vi.fn().mockResolvedValue({
      days: 14,
      online: true,
      bo1: true,
      matchupSource: {
        ownPairs: 0,
        fallbackPairs: 0,
        ownGames: 0,
        trainerHillImportedAt: null,
        conflictCount: 0,
        conflicts: [],
      },
      rows: [],
    }),
    // Explicit mock (not left to `...actual`) so individual tests below can
    // control resolution timing/failure per call — a real fetch would hang
    // or reject unpredictably in jsdom.
    getMetaEquilibrium: vi.fn(),
  };
});

function equilibriumResponse(windowDays: number, computedAt: string): MetaEquilibriumResponse {
  return {
    windowDays,
    online: true,
    bo1: true,
    computedAt,
    run: {
      archetypeCount: 3,
      valuePct: 50.0,
      supportSize: 3,
      equalizerCount: 3,
      imputedCellSharePct: 0,
      resamples: 2000,
      seed: 1,
      failedResamples: 0,
      exactSupportRatePct: 100,
      currentPeriod: null,
      previousPeriod: null,
    },
    archetypes: [],
  };
}

vi.mock('../components/layout/CollapsibleSection', () => ({
  CollapsibleSection: ({
    title,
    defaultOpen,
    children,
  }: {
    title: React.ReactNode;
    defaultOpen?: boolean;
    children: React.ReactNode;
  }) => (
    <section data-testid="collapsible-section" data-default-open={defaultOpen ? 'true' : 'false'}>
      <div data-testid="collapsible-section-title">{title}</div>
      <div data-testid="collapsible-section-body">{children}</div>
    </section>
  ),
}));

describe('MetaPage — equilibrium section is collapsed by default (plan §4 step 21, §6 decision 12, AC 6)', () => {
  it('wires the equilibrium section as a CollapsibleSection WITHOUT defaultOpen', async () => {
    render(<MetaPage />);
    await flushEffects();

    const sections = screen.getAllByTestId('collapsible-section');
    const experimentalSection = sections.find((section) =>
      /experiment/i.test(
        section.querySelector('[data-testid="collapsible-section-title"]')?.textContent ?? '',
      ),
    );

    expect(experimentalSection).toBeDefined();
    expect(experimentalSection).toHaveAttribute('data-default-open', 'false');
  });

  it('keeps the three pre-existing sections (matchup matrix, tournament meta, prediction) defaultOpen — their diff stays empty (AC 6)', async () => {
    render(<MetaPage />);
    await flushEffects();

    const sections = screen.getAllByTestId('collapsible-section');
    const existingTitles = [
      i18n.t('meta:page.matchupMatrix'),
      i18n.t('meta:page.tournamentMeta'),
      i18n.t('meta:prediction.title'),
    ];

    for (const titleText of existingTitles) {
      const section = sections.find((s) =>
        (s.querySelector('[data-testid="collapsible-section-title"]')?.textContent ?? '').includes(
          titleText,
        ),
      );
      expect(section, `expected a section titled "${titleText}"`).toBeDefined();
      expect(section).toHaveAttribute('data-default-open', 'true');
    }
  });
});

function experimentalSectionBody() {
  const sections = screen.getAllByTestId('collapsible-section');
  const section = sections.find((s) =>
    /experiment/i.test(
      s.querySelector('[data-testid="collapsible-section-title"]')?.textContent ?? '',
    ),
  );
  if (!section) throw new Error('experimental section not found');
  const body = section.querySelector('[data-testid="collapsible-section-body"]');
  if (!body) throw new Error('experimental section body not found');
  return body as HTMLElement;
}

// Bug found in code review of feat/meta-game-theory-layer (2026-09-03): the
// equilibrium fetch's .catch() was empty, leaving the section stuck on
// "loading" forever on a genuine fetch error — unlike the sibling
// fieldAnalysis effect a few lines above, which already distinguishes a
// failed request from a still-loading one.
describe('MetaPage — equilibrium fetch failure does not loop forever on "loading" (bug found in code review)', () => {
  it('shows an error state instead of the loading indicator when the equilibrium fetch rejects', async () => {
    vi.mocked(getMetaEquilibrium).mockReset().mockRejectedValue(new Error('network down'));

    render(<MetaPage />);
    await flushEffects();

    const body = experimentalSectionBody();
    expect(body.textContent).not.toContain(i18n.t('meta:metaTable.loading'));
    expect(body.textContent).toContain(i18n.t('meta:metaTable.loadError'));
  });
});

// Bug found in code review of feat/meta-game-theory-layer (2026-09-03): the
// equilibrium effect had no staleness guard (unlike the sibling
// fieldAnalysis effect, which tags each result with a requestKey), so a
// slow, stale in-flight request for a PREVIOUS window could overwrite the
// data for the window the user has since switched to.
describe('MetaPage — equilibrium data does not go stale across a window switch (bug found in code review)', () => {
  it("keeps the newer window's data when an older, slower request resolves last", async () => {
    let resolveOldWindow!: (value: MetaEquilibriumResponse) => void;
    const oldWindowPromise = new Promise<MetaEquilibriumResponse>((resolve) => {
      resolveOldWindow = resolve;
    });
    vi.mocked(getMetaEquilibrium)
      .mockReset()
      .mockImplementation((days) => {
        if (days === META_DEFAULT_DAYS) return oldWindowPromise;
        if (days === 7) {
          return Promise.resolve(equilibriumResponse(7, '2021-03-10T00:00:00.000Z'));
        }
        return Promise.reject(new Error(`unexpected days: ${String(days)}`));
      });

    render(<MetaPage />);
    await flushEffects();
    // Initial (default-window) request is still pending — loading, not stale.
    expect(experimentalSectionBody().textContent).toContain(i18n.t('meta:metaTable.loading'));

    // Switch windows before the old request resolves.
    fireEvent.click(screen.getByRole('button', { name: '7' }));
    await flushEffects();
    expect(experimentalSectionBody().textContent).toContain('2021');

    // The stale, slower request for the OLD window now finally resolves.
    resolveOldWindow(equilibriumResponse(META_DEFAULT_DAYS, '2020-06-15T00:00:00.000Z'));
    await flushEffects();

    // Must still show the current (7-day) window's data, never the stale one.
    expect(experimentalSectionBody().textContent).toContain('2021');
    expect(experimentalSectionBody().textContent).not.toContain('2020');
  });
});
