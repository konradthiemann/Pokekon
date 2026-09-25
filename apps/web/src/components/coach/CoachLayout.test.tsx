import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { authClient } from '../../lib/authClient';
import { CoachLayout } from './CoachLayout';

interface StoreMock {
  preferencesStatus: 'idle' | 'loading' | 'ready' | 'error';
  activeArchetypeId: string | null;
  decks: unknown[];
  coachTab: string;
  lastRefreshed: Date | null;
  refreshError: boolean;
  isHydrating: boolean;
  demoSeedPending: boolean;
  loadPreferences: ReturnType<typeof vi.fn>;
  hydrate: ReturnType<typeof vi.fn>;
}
let store: StoreMock;
vi.mock('../../store/dashboardStore', () => ({ useDashboardStore: () => store }));
vi.mock('../../lib/authClient', () => ({ authClient: { useSession: vi.fn() } }));

vi.mock('../DeckSpriteBackground', () => ({ DeckSpriteBackground: () => null }));
vi.mock('../auth/DemoBanner', () => ({ DemoBanner: () => null }));
vi.mock('./CoachSidebar', () => ({ CoachSidebar: () => null }));
vi.mock('./CoachBottomNav', () => ({ CoachBottomNav: () => null }));
vi.mock('./CoachHeader', () => ({
  CoachHeader: ({ onSwitchArchetype }: { onSwitchArchetype: () => void }) => (
    <button onClick={onSwitchArchetype}>switch-stub</button>
  ),
}));
vi.mock('./onboarding/OnboardingFlow', () => ({
  OnboardingFlow: ({ mode, onDone }: { mode: string; onDone: () => void }) => (
    <div data-testid="onboarding" data-mode={mode}>
      <button onClick={onDone}>done-stub</button>
    </div>
  ),
}));
vi.mock('../../pages/coach/StartPage', () => ({
  StartPage: () => <div data-testid="page-start" />,
}));
vi.mock('../../pages/coach/DeckHubPage', () => ({
  DeckHubPage: () => <div data-testid="page-deck" />,
}));
vi.mock('../../pages/coach/CoachingPage', () => ({
  CoachingPage: () => <div data-testid="page-coaching" />,
}));
vi.mock('../../pages/coach/OpponentsPage', () => ({
  OpponentsPage: () => <div data-testid="page-opponents" />,
}));
vi.mock('../../pages/coach/ToolsPage', () => ({
  ToolsPage: () => <div data-testid="page-tools" />,
}));

const useSessionMock = vi.mocked(authClient.useSession);
function session(isAnonymous: boolean) {
  useSessionMock.mockReturnValue({ data: { user: { isAnonymous } } } as unknown as ReturnType<
    typeof authClient.useSession
  >);
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});
beforeEach(() => {
  session(false);
  store = {
    preferencesStatus: 'ready',
    activeArchetypeId: 'dragapult-ex',
    decks: [{}],
    coachTab: 'start',
    lastRefreshed: new Date(),
    refreshError: false,
    isHydrating: false,
    demoSeedPending: false,
    loadPreferences: vi.fn(),
    hydrate: vi.fn(),
  };
});

describe('CoachLayout (Spec 7 §4, §5.1)', () => {
  it('root element carries the coach-ui class', () => {
    const { container } = render(<CoachLayout />);
    expect(container.firstElementChild).toHaveClass('coach-ui');
  });

  it('shows Start when an archetype is set', async () => {
    render(<CoachLayout />);
    expect(await screen.findByTestId('page-start')).toBeInTheDocument();
    expect(screen.queryByTestId('onboarding')).toBeNull();
  });

  it('shows the onboarding when preferences are ready and no archetype is set', () => {
    store.activeArchetypeId = null;
    render(<CoachLayout />);
    expect(screen.getByTestId('onboarding')).toHaveAttribute('data-mode', 'firstRun');
  });

  it('shows a skeleton, not the onboarding, while preferences load', () => {
    store.activeArchetypeId = null;
    store.preferencesStatus = 'loading';
    render(<CoachLayout />);
    expect(screen.queryByTestId('onboarding')).toBeNull();
    expect(screen.getByTestId('coach-skeleton')).toBeInTheDocument();
  });

  it('shows a skeleton while the demo seed is in flight', () => {
    session(true);
    store.activeArchetypeId = null;
    store.decks = [];
    store.demoSeedPending = true;
    render(<CoachLayout />);
    expect(screen.queryByTestId('onboarding')).toBeNull();
    expect(screen.getByTestId('coach-skeleton')).toBeInTheDocument();
  });

  it('does not hang for an anonymous user who deleted every deck (no seed pending)', async () => {
    session(true);
    store.decks = [];
    render(<CoachLayout />);
    expect(await screen.findByTestId('page-start')).toBeInTheDocument();
  });

  it("shows a skeleton while hydrating, so no other archetype's deck flashes", () => {
    store.isHydrating = true;
    render(<CoachLayout />);
    expect(screen.getByTestId('coach-skeleton')).toBeInTheDocument();
  });

  it('shows an error with retry instead of an endless skeleton when loading the data failed', async () => {
    store.lastRefreshed = null;
    store.refreshError = true;
    render(<CoachLayout />);
    expect(screen.queryByTestId('coach-skeleton')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(store.hydrate).toHaveBeenCalled();
  });

  it('offers a skip link to the main content', () => {
    render(<CoachLayout />);
    const link = screen.getByRole('link', { name: 'Skip to content' });
    expect(link).toHaveAttribute('href', '#coach-main');
    expect(document.getElementById('coach-main')).not.toBeNull();
  });

  it.each(['start', 'deck', 'coaching', 'opponents', 'tools'])(
    'renders the page for coachTab %s',
    async (tab) => {
      store.coachTab = tab;
      render(<CoachLayout />);
      expect(await screen.findByTestId(`page-${tab}`)).toBeInTheDocument();
    },
  );

  it('switching the archetype shows the onboarding in switch mode until done', async () => {
    render(<CoachLayout />);
    await userEvent.click(screen.getByRole('button', { name: 'switch-stub' }));
    expect(screen.getByTestId('onboarding')).toHaveAttribute('data-mode', 'switchArchetype');
    await userEvent.click(screen.getByRole('button', { name: 'done-stub' }));
    expect(screen.queryByTestId('onboarding')).toBeNull();
  });

  it('keeps working (Start + retry hint) when loading preferences failed', async () => {
    store.activeArchetypeId = null;
    store.preferencesStatus = 'error';
    render(<CoachLayout />);
    expect(await screen.findByTestId('page-start')).toBeInTheDocument();
    expect(screen.queryByTestId('onboarding')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(store.loadPreferences).toHaveBeenCalled();
  });
});
