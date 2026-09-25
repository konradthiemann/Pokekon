import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { isArchetypeCoachUiEnabled } from './lib/featureFlags';

vi.mock('./lib/featureFlags', () => ({ isArchetypeCoachUiEnabled: vi.fn() }));
vi.mock('./lib/authClient', () => ({
  authClient: { useSession: () => ({ data: { user: { id: 'u1' } }, isPending: false }) },
}));
vi.mock('./lib/localImport', () => ({ shouldOfferLocalImport: vi.fn().mockResolvedValue(false) }));
vi.mock('./store/dashboardStore', () => ({
  useDashboardStore: () => ({ activeTab: 'overview', hydrate: vi.fn(), isLoading: false }),
}));
vi.mock('./components/layout/Sidebar', () => ({
  Sidebar: () => <div data-testid="old-sidebar" />,
}));
vi.mock('./components/layout/BottomNav', () => ({
  BottomNav: () => <div data-testid="old-bottom-nav" />,
}));
vi.mock('./components/auth/MobileAccountSheet', () => ({ MobileAccountSheet: () => null }));
vi.mock('./components/auth/DemoBanner', () => ({ DemoBanner: () => null }));
vi.mock('./components/DeckSpriteBackground', () => ({ DeckSpriteBackground: () => null }));
vi.mock('./pages/OverviewPage', () => ({ OverviewPage: () => null }));
vi.mock('./components/coach/CoachLayout', () => ({
  CoachLayout: () => <div data-testid="coach-layout" />,
}));

const flag = vi.mocked(isArchetypeCoachUiEnabled);

beforeEach(() => flag.mockReset());

describe('App layout switch (Spec 7 §9, flag archetypeCoachUi)', () => {
  it('renders the old layout with the flag off', () => {
    flag.mockReturnValue(false);
    render(<App />);
    expect(screen.getByTestId('old-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('old-bottom-nav')).toBeInTheDocument();
    expect(screen.queryByTestId('coach-layout')).toBeNull();
  });

  it('renders the coach layout with the flag on', () => {
    flag.mockReturnValue(true);
    render(<App />);
    expect(screen.getByTestId('coach-layout')).toBeInTheDocument();
    expect(screen.queryByTestId('old-sidebar')).toBeNull();
  });
});
