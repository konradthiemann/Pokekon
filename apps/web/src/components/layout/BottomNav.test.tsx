import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../../i18n';
import { BottomNav } from './BottomNav';
import { NAV_ITEMS } from './navItems';

interface BottomNavStoreMock {
  activeTab: string;
  setActiveTab: () => void;
  refresh: () => void;
}

let storeState: BottomNavStoreMock;

vi.mock('../../store/dashboardStore', () => ({
  useDashboardStore: () => storeState,
}));

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

function baseStore(activeTab: string): BottomNavStoreMock {
  return {
    activeTab,
    setActiveTab: vi.fn(),
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
    const navButtons = screen.getAllByRole('button');
    const nonFabButtons = navButtons.filter(
      (button) => button.getAttribute('aria-label') !== i18n.t('layout:bottomNav.logMatch'),
    );
    expect(nonFabButtons).toHaveLength(NAV_ITEMS.length);
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
