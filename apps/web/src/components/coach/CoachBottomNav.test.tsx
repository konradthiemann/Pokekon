import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { CoachBottomNav } from './CoachBottomNav';

let store: {
  coachTab: string;
  setCoachTab: ReturnType<typeof vi.fn>;
  activeDeckId: number | null;
  refresh: ReturnType<typeof vi.fn>;
};
vi.mock('../../store/dashboardStore', () => ({ useDashboardStore: () => store }));
vi.mock('../opponent/AddLogModal', () => ({
  AddLogModal: ({ preselectedDeckId }: { preselectedDeckId?: number }) => (
    <div role="dialog" aria-label="add-log-stub" data-deck={preselectedDeckId} />
  ),
}));

beforeAll(async () => {
  await i18n.changeLanguage('en');
});
beforeEach(() => {
  store = { coachTab: 'deck', setCoachTab: vi.fn(), activeDeckId: 3, refresh: vi.fn() };
});

describe('CoachBottomNav (Spec 7 §4)', () => {
  it('orders [Start, Deck] · ＋ · [Coaching, Opponents] and has no comparison shortcut', () => {
    render(<CoachBottomNav />);
    const labels = screen
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(labels).toEqual(['Start', 'Deck', 'Paste a log', 'Coaching', 'Opponents']);
  });

  it('marks exactly the active tab and switches tabs', async () => {
    render(<CoachBottomNav />);
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Deck' })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(screen.getByRole('button', { name: 'Opponents' }));
    expect(store.setCoachTab).toHaveBeenCalledWith('opponents');
  });

  it('＋ is blue with a yellow ring (never red) and opens AddLogModal for the active deck', async () => {
    render(<CoachBottomNav />);
    const fab = screen.getByRole('button', { name: 'Paste a log' });
    expect(fab.className).toMatch(/\bbg-brand-\d00\b/);
    expect(fab.className).toContain('ring-energy-500');
    expect(fab.className).not.toMatch(/bg-(poke|red)-/);
    await userEvent.click(fab);
    expect(screen.getByRole('dialog', { name: 'add-log-stub' })).toHaveAttribute('data-deck', '3');
  });

  it('gives every button at least 44 px', () => {
    render(<CoachBottomNav />);
    for (const b of screen.getAllByRole('button'))
      expect(b.className).toMatch(/min-h-\[(44|56)px\]|h-14/);
  });
});
