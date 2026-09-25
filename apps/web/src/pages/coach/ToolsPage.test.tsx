import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import type { MetaWindow } from '../../lib/api';
import { ToolsPage } from './ToolsPage';

const WINDOW: MetaWindow = { days: 14, online: true, bo1: true };
let store: Record<string, unknown>;
vi.mock('../../store/dashboardStore', () => ({ useDashboardStore: () => store }));
vi.mock('../../hooks/useFieldAnalysis', () => ({
  useFieldAnalysis: () => ({
    data: {
      archetypes: [
        { archetypeId: 'dragapult-ex', archetypeName: 'Dragapult ex', icons: ['dragapult'] },
      ],
    },
    isLoading: false,
    error: false,
  }),
}));
let equilibriumDays: number | null = null;
vi.mock('../../hooks/useMetaEquilibrium', () => ({
  useMetaEquilibrium: (days: number) => {
    equilibriumDays = days;
    return { data: { ok: true }, error: false };
  },
}));

const seen: Record<string, unknown> = {};
vi.mock('../../components/meta/ArchetypeDetail', () => ({
  ArchetypeDetail: (p: Record<string, unknown>) => {
    seen.detail = p;
    return <div data-testid="archetype-detail" />;
  },
}));
vi.mock('../../components/meta/MatchupMatrix', () => ({
  MatchupMatrix: () => <div data-testid="matchup-matrix" />,
}));
vi.mock('../../components/meta/EquilibriumPanel', () => ({
  EquilibriumPanel: () => <div data-testid="equilibrium" />,
}));
vi.mock('../../components/layout/CollapsibleSection', () => ({
  CollapsibleSection: ({
    title,
    defaultOpen,
    children,
  }: {
    title: ReactNode;
    defaultOpen?: boolean;
    children: ReactNode;
  }) => (
    <section
      data-testid="collapsible"
      data-title={String(title)}
      data-open={String(Boolean(defaultOpen))}
    >
      {children}
    </section>
  ),
}));

beforeAll(async () => {
  await i18n.changeLanguage('en');
});
beforeEach(() => {
  equilibriumDays = null;
  for (const k of Object.keys(seen)) delete seen[k];
  store = {
    activeArchetypeId: 'dragapult-ex',
    metaWindow: WINDOW,
    setMetaWindow: vi.fn(),
    archetypeStats: [],
    localMeta: [],
    decks: [],
  };
});

function section(title: RegExp): HTMLElement {
  return screen.getAllByTestId('collapsible').find((s) => title.test(s.dataset.title ?? ''))!;
}

describe('ToolsPage (Spec 7 §5.6, Scheibe 1: unfiltered)', () => {
  it('embeds ArchetypeDetail for the active archetype without a back button', () => {
    render(<ToolsPage />);
    expect(screen.getByTestId('archetype-detail')).toBeInTheDocument();
    expect(seen.detail).toMatchObject({
      archetypeId: 'dragapult-ex',
      archetypeName: 'Dragapult ex',
      window: WINDOW,
    });
    expect((seen.detail as { onBack?: unknown }).onBack).toBeUndefined();
    expect(section(/Tournament lists/).dataset.open).toBe('true');
  });

  it('has the matchup matrix and game theory collapsed, equilibrium for the window days', () => {
    render(<ToolsPage />);
    expect(within(section(/Matchup matrix/)).getByTestId('matchup-matrix')).toBeInTheDocument();
    expect(section(/Matchup matrix/).dataset.open).toBe('false');
    expect(within(section(/Game theory/)).getByTestId('equilibrium')).toBeInTheDocument();
    expect(section(/Game theory/).dataset.open).toBe('false');
    expect(equilibriumDays).toBe(14);
  });

  it('links to Limitless and TrainerHill in a new tab safely', () => {
    render(<ToolsPage />);
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      'https://limitlesstcg.com/decks',
      'https://www.trainerhill.com/',
    ]);
    for (const l of links) {
      expect(l).toHaveAttribute('target', '_blank');
      expect(l).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('does not render the general tournament tables of the old Meta page', () => {
    render(<ToolsPage />);
    expect(screen.queryByText(/Recent tournaments/i)).toBeNull();
  });
});
