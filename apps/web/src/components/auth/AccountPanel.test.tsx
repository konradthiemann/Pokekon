import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { authClient } from '../../lib/authClient';
import { AccountPanel } from './AccountPanel';

vi.mock('../../lib/authClient', () => ({
  authClient: {
    useSession: vi.fn(),
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
  },
}));

// SyncControls reads the store.
vi.mock('../../store/dashboardStore', () => ({
  useDashboardStore: () => ({
    syncMeta: vi.fn(),
    refresh: vi.fn(),
    isLoading: false,
    isSyncing: false,
    syncProgress: '',
    syncError: null,
    lastSynced: null,
    lastRefreshed: null,
  }),
}));

const useSessionMock = vi.mocked(authClient.useSession);

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  useSessionMock.mockReturnValue({
    data: {
      user: { id: 'u1', name: 'Ash Ketchum', email: 'ash@example.com' },
      session: {},
    },
    isPending: false,
    error: null,
  } as unknown as ReturnType<typeof authClient.useSession>);
});

describe('AccountPanel (shared by the mobile sheet and the coach header menu)', () => {
  it('shows name and e-mail', () => {
    render(<AccountPanel onOpenAiSettings={() => {}} />);
    expect(screen.getByText('Ash Ketchum')).toBeInTheDocument();
    expect(screen.getByText('ash@example.com')).toBeInTheDocument();
  });

  it('opens the AI settings via the callback', () => {
    const onOpen = vi.fn();
    render(<AccountPanel onOpenAiSettings={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'AI analysis' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('contains the sync controls', () => {
    render(<AccountPanel onOpenAiSettings={() => {}} />);
    expect(screen.getByTestId('sync-controls')).toBeInTheDocument();
  });

  it('signs out', () => {
    render(<AccountPanel onOpenAiSettings={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(authClient.signOut).toHaveBeenCalled();
  });

  it('renders nothing without a session', () => {
    useSessionMock.mockReturnValue({ data: null } as unknown as ReturnType<
      typeof authClient.useSession
    >);
    const { container } = render(<AccountPanel onOpenAiSettings={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
