import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../../i18n';
import { Sidebar } from './Sidebar';
import { NAV_ITEMS } from './navItems';

// Tests must never hit the network: the entire auth client is replaced
// (pattern: UserMenu.test.tsx).
vi.mock('../../lib/authClient', () => ({
  authClient: {
    useSession: vi.fn(() => ({ data: null, isPending: false, error: null, refetch: vi.fn() })),
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
  },
}));

interface SidebarStoreMock {
  activeTab: string;
  setActiveTab: () => void;
  refresh: () => void;
  isLoading: boolean;
  lastRefreshed: Date | null;
  syncMeta: () => Promise<unknown>;
  isSyncing: boolean;
  syncProgress: string;
  lastSynced: Date | null;
  syncError: string | null;
}

let storeState: SidebarStoreMock;

vi.mock('../../store/dashboardStore', () => ({
  useDashboardStore: () => storeState,
}));

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

function baseStore(activeTab: string): SidebarStoreMock {
  return {
    activeTab,
    setActiveTab: vi.fn(),
    refresh: vi.fn(),
    isLoading: false,
    lastRefreshed: null,
    syncMeta: vi.fn(),
    isSyncing: false,
    syncProgress: '',
    lastSynced: null,
    syncError: null,
  };
}

describe('Sidebar navigation (plan ui-ux-hub-rework.md §3.2, §3.3, Slice D)', () => {
  it('renders exactly the three NAV_ITEMS as nav buttons, and no other nav button', () => {
    storeState = baseStore('meta');
    const { container } = render(<Sidebar />);

    for (const item of NAV_ITEMS) {
      expect(
        screen.getByRole('button', { name: i18n.t(`layout:${item.labelKey}`) as string }),
      ).toBeInTheDocument();
    }
    // The Sidebar's main nav list is the first <nav> in document order (the
    // footer's LegalLinks — Impressum/Datenschutz — is also a <nav>, but
    // renders further down and is untouched by this plan, §3.3: "Alles
    // unterhalb der Navigation ... bleibt unverändert"). Counting only its
    // buttons — not the sync/refresh/user-menu/language buttons below it —
    // confirms exactly one button per NAV_ITEMS entry, nothing extra.
    const nav = container.querySelector('nav');
    expect(nav?.querySelectorAll('button')).toHaveLength(NAV_ITEMS.length);
  });

  it('does not render the old "Recommendations" nav label anymore (plan §3.8: nav.recommendations removed)', () => {
    storeState = baseStore('meta');
    render(<Sidebar />);

    expect(
      screen.queryByRole('button', { name: i18n.t('layout:nav.recommendations') as string }),
    ).not.toBeInTheDocument();
  });

  it('marks exactly one nav button with aria-current="page", matching activeTab', () => {
    storeState = baseStore('deck');
    render(<Sidebar />);

    const current = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-current') === 'page');

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent(i18n.t('layout:nav.myDeck') as string);
  });
});
