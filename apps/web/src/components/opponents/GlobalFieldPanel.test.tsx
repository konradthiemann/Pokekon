import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import type { MetaWindow } from '../../lib/api';
import { GlobalFieldPanel } from './GlobalFieldPanel';

const W: MetaWindow = { days: 30, online: true, bo1: true };
let state: { data: unknown; isLoading: boolean; notInWindow: boolean; error: string | null };
let requested: [string | null, MetaWindow] | null = null;
vi.mock('../../hooks/useArchetypeAnalysis', () => ({
  useArchetypeAnalysis: (id: string | null, w: MetaWindow) => {
    requested = [id, w];
    return state;
  },
}));
const seen: Record<string, unknown> = {};
vi.mock('../meta/FieldScorePanel', () => ({
  FieldScorePanel: (p: { fieldScore: unknown }) => {
    seen.fieldScore = p.fieldScore;
    return <div data-testid="field-score" />;
  },
}));
vi.mock('../meta/ThreatsPanel', () => ({ ThreatsPanel: () => <div data-testid="threats" /> }));
vi.mock('../meta/MatchupTable', () => ({
  MatchupTable: () => <div data-testid="matchup-table" />,
}));

const FS = { threats: [{}, {}], freeWins: [{}] };
beforeAll(async () => {
  await i18n.changeLanguage('en');
});
beforeEach(() => {
  state = {
    data: { fieldScore: FS, totalRanked: 12, matchupImportedAt: null, iconsById: {} },
    isLoading: false,
    notInWindow: false,
    error: null,
  };
});

describe('GlobalFieldPanel (Spec 7 §5.5, from ArchetypeDetail)', () => {
  it('loads the active archetype for the window and shows field score and threats', () => {
    render(<GlobalFieldPanel archetypeId="dragapult-ex" window={W} />);
    expect(requested).toEqual(['dragapult-ex', W]);
    expect(screen.getByTestId('field-score')).toBeInTheDocument();
    expect(screen.getByTestId('threats')).toBeInTheDocument();
    expect(seen.fieldScore).toBe(FS);
  });

  it('shows the full matchup table only after "show all"', async () => {
    render(<GlobalFieldPanel archetypeId="dragapult-ex" window={W} />);
    expect(screen.queryByTestId('matchup-table')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /3/ }));
    expect(screen.getByTestId('matchup-table')).toBeInTheDocument();
  });

  it('shows loading, not-in-window and error states', () => {
    state = { data: null, isLoading: true, notInWindow: false, error: null };
    const { unmount } = render(<GlobalFieldPanel archetypeId="dragapult-ex" window={W} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    unmount();
    state = { data: null, isLoading: false, notInWindow: true, error: null };
    const second = render(<GlobalFieldPanel archetypeId="dragapult-ex" window={W} />);
    expect(screen.getByText(/not played in this window/i)).toBeInTheDocument();
    second.unmount();
    state = { data: null, isLoading: false, notInWindow: false, error: 'boom' };
    render(<GlobalFieldPanel archetypeId="dragapult-ex" window={W} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
