import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { CardStatsPanel } from './CardStatsPanel';

let state: { data: unknown; isLoading: boolean; error: boolean };
vi.mock('../../hooks/useArchetypeCardStats', () => ({ useArchetypeCardStats: () => state }));

const card = (cardName: string, cardType: string, tier: string, inclusionPct: number) => ({
  cardName,
  cardType,
  listsAnalyzed: 40,
  listsWith: Math.round((inclusionPct / 100) * 40),
  inclusionPct,
  avgCount: 2.5,
  delta:
    tier === 'insufficient' ? null : { deltaPp: 4.2, lowPct: 50.5, highPct: 58, widthPct: 7.5 },
  tier,
});

beforeAll(async () => {
  await i18n.changeLanguage('en');
});
beforeEach(() => {
  state = {
    data: {
      archetypeId: 'dragapult-ex',
      windowDays: 28,
      online: true,
      bo1: true,
      computedAt: '2026-09-28T10:00:00.000Z',
      listsAnalyzed: 40,
      cards: [
        card('Dragapult ex', 'pokemon', 'confirmed', 100),
        card('Budew', 'pokemon', 'hiddenGem', 35),
        card('Ultra Ball', 'trainer', 'neutral', 95),
        card('Unfair Stamp', 'trainer', 'discouraged', 20),
        card('Basic Psychic Energy', 'energy', 'insufficient', 100),
      ],
    },
    isLoading: false,
    error: false,
  };
});

describe('CardStatsPanel (Spec 7 §5.6)', () => {
  it('groups cards by type and keeps the server order within a group', () => {
    render(<CardStatsPanel archetypeId="dragapult-ex" days={30} />);
    const groups = screen.getAllByRole('table');
    expect(groups).toHaveLength(3);
    const pokemon = within(groups[0]!)
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.textContent);
    expect(pokemon[0]).toContain('Dragapult ex');
    expect(pokemon[1]).toContain('Budew');
  });

  it('shows inclusion rate, average count and the delta with its band', () => {
    render(<CardStatsPanel archetypeId="dragapult-ex" days={30} />);
    const row = screen.getByText('Budew').closest('tr')!;
    expect(row).toHaveTextContent('35');
    expect(row).toHaveTextContent('2.5');
    expect(row).toHaveTextContent('4.2');
  });

  it('filters by signal tier via chips (real buttons, aria-pressed)', async () => {
    render(<CardStatsPanel archetypeId="dragapult-ex" days={30} />);
    const chip = screen.getByRole('button', {
      name: i18n.t('recommendations:comparison.delta.hiddenGem'),
    });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Budew')).toBeInTheDocument();
    expect(screen.queryByText('Ultra Ball')).toBeNull();
  });

  it('shows the snapped window and "online Bo1" in the header', () => {
    render(<CardStatsPanel archetypeId="dragapult-ex" days={30} />);
    expect(screen.getByText(/28 days/)).toBeInTheDocument();
    expect(screen.getByText(/online Bo1/i)).toBeInTheDocument();
    expect(screen.getByText(/40 lists/)).toBeInTheDocument();
  });

  it('cold start: computedAt null explains that stats are not computed yet', () => {
    state.data = { ...(state.data as object), computedAt: null, cards: [] };
    render(<CardStatsPanel archetypeId="dragapult-ex" days={30} />);
    expect(screen.getByText(/not been computed yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('keeps the correlation-not-causation note', () => {
    render(<CardStatsPanel archetypeId="dragapult-ex" days={30} />);
    expect(
      screen.getAllByText(i18n.t('recommendations:comparison.delta.correlationNote')).length,
    ).toBeGreaterThan(0);
  });

  it('shows loading and error states', () => {
    state = { data: null, isLoading: true, error: false };
    const { unmount } = render(<CardStatsPanel archetypeId="dragapult-ex" days={30} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    unmount();
    state = { data: null, isLoading: false, error: true };
    render(<CardStatsPanel archetypeId="dragapult-ex" days={30} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
