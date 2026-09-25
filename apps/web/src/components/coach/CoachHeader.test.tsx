import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { CoachHeader } from './CoachHeader';

let store: Record<string, unknown>;
vi.mock('../../store/dashboardStore', () => ({ useDashboardStore: () => store }));
vi.mock('./ActiveListChip', () => ({ ActiveListChip: () => <div data-testid="list-chip" /> }));
vi.mock('./HeaderMenuSheet', () => ({
  HeaderMenuSheet: ({ open }: { open: boolean }) =>
    open ? <div data-testid="menu-sheet" /> : null,
}));

beforeAll(async () => {
  await i18n.changeLanguage('en');
});
beforeEach(() => {
  store = { activeArchetypeId: 'n-zoroark', decks: [] };
});

describe('CoachHeader (Spec 7 §4, §9a)', () => {
  it('is a red brand band with a yellow edge', () => {
    render(<CoachHeader onSwitchArchetype={() => {}} />);
    const header = screen.getByRole('banner');
    expect(header.className).toContain('bg-poke-600');
    expect(header.className).toContain('border-energy-500');
  });

  it('switches the archetype via the switcher button', async () => {
    const onSwitch = vi.fn();
    render(<CoachHeader onSwitchArchetype={onSwitch} />);
    await userEvent.click(screen.getByRole('button', { name: /Switch archetype: N's Zoroark/ }));
    expect(onSwitch).toHaveBeenCalled();
  });

  it('shows the active list chip and opens the menu', async () => {
    render(<CoachHeader onSwitchArchetype={() => {}} />);
    expect(screen.getByTestId('list-chip')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByTestId('menu-sheet')).toBeInTheDocument();
  });
});
