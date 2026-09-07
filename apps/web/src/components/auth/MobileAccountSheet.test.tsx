import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from '../../i18n';
import { MobileAccountSheet } from './MobileAccountSheet';
import { authClient } from '../../lib/authClient';
import { NAV_ITEMS } from '../layout/navItems';

/**
 * Plan .claude/plans/ui-ux-button-consolidation.md §3.5 / §3.11-D (changed by
 * the 2026-09-07 Nachtrag: Option B). This covers the EXTENDED, already
 * existing `MobileAccountSheet` — not a new component. Sync/Refresh become an
 * additional section between the AI-settings button and the language/sign-out
 * row, sourced from the not-yet-existing `SyncControls` (plan §3.4).
 *
 * D1 and D7 are regression net for the extraction, not new behaviour, and are
 * expected to be green from the start (plan §4 Scheibe D, step 7) — flagged
 * as such below rather than reported as red.
 */

// Session mock — mandatory: without a session `MobileAccountSheet` renders
// `null` (MobileAccountSheet.tsx:46). Pattern: UserMenu.test.tsx:8-45.
vi.mock('../../lib/authClient', () => ({
  authClient: {
    useSession: vi.fn(),
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
  },
}));

const useSessionMock = vi.mocked(authClient.useSession);

interface MobileAccountSheetStoreMock {
  syncMeta: () => Promise<unknown>;
  refresh: () => void;
  isLoading: boolean;
  isSyncing: boolean;
  syncProgress: string;
  syncError: string | null;
  lastSynced: Date | null;
  lastRefreshed: Date | null;
}

let storeState: MobileAccountSheetStoreMock;

// Store-Mock nach dem Muster von Sidebar.test.tsx:33-35.
vi.mock('../../store/dashboardStore', () => ({
  useDashboardStore: () => storeState,
}));

function baseStore(): MobileAccountSheetStoreMock {
  return {
    syncMeta: vi.fn(),
    refresh: vi.fn(),
    isLoading: false,
    isSyncing: false,
    syncProgress: '',
    syncError: null,
    lastSynced: null,
    lastRefreshed: null,
  };
}

function signedInSession() {
  return {
    data: {
      user: {
        id: 'u1',
        name: 'Ash Ketchum',
        email: 'ash@example.com',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      session: {},
    },
    isPending: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof authClient.useSession>;
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

function openSheet() {
  fireEvent.click(screen.getByRole('button', { name: i18n.t('auth:userMenu.account') as string }));
}

describe('MobileAccountSheet — initial (closed) state (D1, regression net — green from the start)', () => {
  it('shows the trigger, no dialog, and no sync/refresh buttons before opening', () => {
    useSessionMock.mockReturnValue(signedInSession());
    storeState = baseStore();
    render(<MobileAccountSheet />);

    expect(
      screen.getByRole('button', { name: i18n.t('auth:userMenu.account') as string }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: i18n.t('layout:sidebar.syncLiveMeta') as string }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: i18n.t('layout:sidebar.refreshData') as string }),
    ).not.toBeInTheDocument();
  });
});

describe('MobileAccountSheet — opening the sheet reveals sync and refresh (D2)', () => {
  it('shows a dialog with both a sync button and a refresh button after clicking the trigger', () => {
    useSessionMock.mockReturnValue(signedInSession());
    storeState = baseStore();
    render(<MobileAccountSheet />);

    openSheet();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n.t('layout:sidebar.syncLiveMeta') as string }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n.t('layout:sidebar.refreshData') as string }),
    ).toBeInTheDocument();
  });
});

describe('MobileAccountSheet — sync action wired up (D3)', () => {
  it('calls syncMeta exactly once when the sync button is clicked', () => {
    useSessionMock.mockReturnValue(signedInSession());
    storeState = baseStore();
    render(<MobileAccountSheet />);

    openSheet();
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('layout:sidebar.syncLiveMeta') as string }),
    );

    expect(storeState.syncMeta).toHaveBeenCalledTimes(1);
  });
});

describe('MobileAccountSheet — refresh action wired up (D4)', () => {
  it('calls refresh exactly once when the refresh button is clicked', () => {
    useSessionMock.mockReturnValue(signedInSession());
    storeState = baseStore();
    render(<MobileAccountSheet />);

    openSheet();
    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('layout:sidebar.refreshData') as string }),
    );

    expect(storeState.refresh).toHaveBeenCalledTimes(1);
  });
});

describe('MobileAccountSheet — Escape closes the sheet (D5)', () => {
  it('removes the dialog from the document when Escape is pressed while open', () => {
    useSessionMock.mockReturnValue(signedInSession());
    storeState = baseStore();
    render(<MobileAccountSheet />);

    openSheet();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('MobileAccountSheet — busy state matches the Sidebar 1:1 (D6, plan §3.4)', () => {
  it('disables the sync button and shows the "syncing" label when isSyncing is true', () => {
    useSessionMock.mockReturnValue(signedInSession());
    storeState = { ...baseStore(), isSyncing: true };
    render(<MobileAccountSheet />);

    openSheet();

    const syncButton = screen.getByRole('button', {
      name: i18n.t('layout:sidebar.syncing') as string,
    });
    expect(syncButton).toBeInTheDocument();
    expect(syncButton).toBeDisabled();
  });
});

describe('MobileAccountSheet — regression: existing sheet content survives the extension (D7, regression net — green from the start)', () => {
  it('keeps the account row, AI-settings button, and sign-out, and never shows a NAV_ITEMS label', () => {
    useSessionMock.mockReturnValue(signedInSession());
    storeState = baseStore();
    render(<MobileAccountSheet />);

    openSheet();

    expect(screen.getByText('Ash Ketchum')).toBeInTheDocument();
    expect(screen.getByText('ash@example.com')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n.t('auth:aiSettings.title') as string }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n.t('auth:userMenu.signOut') as string }),
    ).toBeInTheDocument();

    // Abgrenzung zur BottomNav: keines der drei Tab-Labels darf hier auftauchen.
    for (const item of NAV_ITEMS) {
      expect(
        screen.queryByRole('button', { name: i18n.t(`layout:${item.labelKey}`) as string }),
      ).not.toBeInTheDocument();
    }
  });
});
