import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { ActiveListChip } from './ActiveListChip';

interface StoreMock {
  activeDeck: { archetypeName: string; variant: string } | null;
  deckSnapshots: { label: string; createdAt: string }[];
  setCoachTab: (t: string) => void;
  setDeckView: (v: string) => void;
}
let storeState: StoreMock;
vi.mock('../../store/dashboardStore', () => ({
  useDashboardStore: () => storeState,
}));

beforeAll(async () => {
  await i18n.changeLanguage('en');
});
beforeEach(() => {
  storeState = { activeDeck: null, deckSnapshots: [], setCoachTab: vi.fn(), setDeckView: vi.fn() };
});

describe('ActiveListChip (Spec 7 §4 header, E17)', () => {
  it('shows the variant and the newest snapshot label as version', () => {
    storeState.activeDeck = { archetypeName: 'Dragapult ex', variant: 'Dusknoir' };
    storeState.deckSnapshots = [
      { label: 'v1', createdAt: '2026-09-01T00:00:00.000Z' },
      { label: 'v2', createdAt: '2026-09-10T00:00:00.000Z' },
    ];
    render(<ActiveListChip />);
    const chip = screen.getByRole('button');
    expect(chip).toHaveTextContent('Dusknoir');
    expect(chip).toHaveTextContent('v2');
  });

  it('falls back to the archetype name without a variant', () => {
    storeState.activeDeck = { archetypeName: 'Dragapult ex', variant: '' };
    render(<ActiveListChip />);
    expect(screen.getByRole('button')).toHaveTextContent('Dragapult ex');
  });

  it('says "No list" without an active deck', () => {
    render(<ActiveListChip />);
    expect(screen.getByRole('button')).toHaveTextContent('No list');
  });

  it('opens Deck › My lists', async () => {
    render(<ActiveListChip />);
    await userEvent.click(screen.getByRole('button'));
    expect(storeState.setCoachTab).toHaveBeenCalledWith('deck');
    expect(storeState.setDeckView).toHaveBeenCalledWith('myLists');
  });
});
