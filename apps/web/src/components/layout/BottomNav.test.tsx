import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '../../i18n';
import { BottomNav } from './BottomNav';
import { NAV_ITEMS } from './navItems';

interface BottomNavStoreMock {
  activeTab: string;
  deckSection: string;
  setActiveTab: () => void;
  openDeckComparison: () => void;
  refresh: () => void;
}

let storeState: BottomNavStoreMock;

vi.mock('../../store/dashboardStore', () => ({
  useDashboardStore: () => storeState,
}));

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

function baseStore(activeTab: string, deckSection = 'deck'): BottomNavStoreMock {
  return {
    activeTab,
    deckSection,
    setActiveTab: vi.fn(),
    openDeckComparison: vi.fn(),
    refresh: vi.fn(),
  };
}

describe('BottomNav navigation (plan ui-ux-hub-rework.md §3.2, §3.3, Slice D)', () => {
  it('renders exactly the three NAV_ITEMS labels as buttons (plus the "log match" FAB, no other nav button)', () => {
    storeState = baseStore('meta');
    render(<BottomNav />);

    for (const item of NAV_ITEMS) {
      expect(
        screen.getByRole('button', { name: i18n.t(`layout:${item.labelKey}`) as string }),
      ).toBeInTheDocument();
    }

    // The FAB ("Log match") is the only button that isn't a NAV_ITEMS entry.
    // The deck comparison shortcut (Slice E, plan §3.3, §4 step 12) adds a
    // fourth non-FAB button that is intentionally not part of NAV_ITEMS, so
    // the expected count is NAV_ITEMS.length + 1 rather than NAV_ITEMS.length.
    const navButtons = screen.getAllByRole('button');
    const nonFabButtons = navButtons.filter(
      (button) => button.getAttribute('aria-label') !== i18n.t('layout:bottomNav.logMatch'),
    );
    expect(nonFabButtons).toHaveLength(NAV_ITEMS.length + 1);
  });

  it('does not render the old "Recommendations" or "Tips" nav labels anymore (plan §3.8)', () => {
    storeState = baseStore('meta');
    render(<BottomNav />);

    expect(
      screen.queryByRole('button', { name: i18n.t('layout:nav.recommendations') as string }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: i18n.t('layout:nav.tips') as string }),
    ).not.toBeInTheDocument();
  });

  it('marks exactly one nav button with aria-current="page", matching activeTab', () => {
    storeState = baseStore('deck');
    render(<BottomNav />);

    const current = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-current') === 'page');

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent(i18n.t('layout:nav.myDeck') as string);
  });
});

describe('BottomNav deck comparison shortcut (plan ui-ux-hub-rework.md §3.3, §4 Slice E)', () => {
  it('renders a fourth button labeled "nav.comparison" in addition to the three NAV_ITEMS buttons', () => {
    storeState = baseStore('meta');
    render(<BottomNav />);

    expect(
      screen.getByRole('button', { name: i18n.t('layout:nav.comparison') as string }),
    ).toBeInTheDocument();
  });

  it('calls openDeckComparison exactly once when the shortcut is clicked', async () => {
    storeState = baseStore('meta');
    render(<BottomNav />);
    const user = userEvent.setup();

    await user.click(
      screen.getByRole('button', { name: i18n.t('layout:nav.comparison') as string }),
    );

    expect(storeState.openDeckComparison).toHaveBeenCalledTimes(1);
  });

  it('never marks the shortcut with aria-current, even when activeTab="deck" and deckSection="tips" (the shortcut is not a tab)', () => {
    storeState = baseStore('deck', 'tips');
    render(<BottomNav />);

    const shortcut = screen.getByRole('button', {
      name: i18n.t('layout:nav.comparison') as string,
    });

    expect(shortcut).not.toHaveAttribute('aria-current');
  });

  it('orders buttons as [overview, meta] · FAB (log match) · [deck, comparison]', () => {
    storeState = baseStore('meta');
    render(<BottomNav />);

    const nav = screen.getByRole('navigation');
    const buttonNames = within(nav)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') || button.textContent);

    expect(buttonNames).toEqual([
      i18n.t('layout:nav.overview'),
      i18n.t('layout:nav.meta'),
      i18n.t('layout:bottomNav.logMatch'),
      i18n.t('layout:nav.myDeck'),
      i18n.t('layout:nav.comparison'),
    ]);
  });
});
