import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import i18n from '../i18n';
import { MetaPage } from './MetaPage';

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
  };
});

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
