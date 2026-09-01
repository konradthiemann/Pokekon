import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import i18n from '../../i18n';
import { AddLogModal } from './AddLogModal';
import { addOpponentLog } from '../../db/queries';

// The modal must never hit the network / IndexedDB in this test — only the
// write call is observed.
vi.mock('../../db/queries', () => ({
  addOpponentLog: vi.fn().mockResolvedValue(1),
}));

vi.mock('../../store/dashboardStore', () => ({
  useDashboardStore: () => ({ decks: [], deckSnapshots: [], activeDeckId: null }),
}));

const addOpponentLogMock = vi.mocked(addOpponentLog);

beforeAll(async () => {
  // Pin the language so assertions on English strings are deterministic.
  await i18n.changeLanguage('en');
});

// Deliberate test fix (not silent, see tdd.md): this suite's call-count
// assertions (`toHaveBeenCalledTimes(1)`) need a clean mock per test, matching
// the established pattern elsewhere in this codebase (see
// AuthModal.test.tsx's `requestPasswordReset.mockReset()`) — without it, call
// counts accumulate across the `it` blocks below (vitest does not clear mocks
// between tests by default) and the last test's `toHaveBeenCalledTimes(1)`
// would fail even though the feature behaves correctly.
beforeEach(() => {
  addOpponentLogMock.mockClear();
});

/**
 * NOTE for @implementer: this test assumes the bestOf picker follows the same
 * pattern already used in this file for the result/archetype tiles — two
 * buttons whose accessible name contains "BO1"/"BO3" (case-insensitive, so a
 * translated "Bo1"/"Bo3" label also matches) with `aria-pressed` reflecting
 * the active choice (plan §3.7: "zwei Buttons oder Select").
 */

/** Picks an opponent archetype and a result so the Save buttons become
 *  reachable — both are required independently of `bestOf`. */
function fillMinimalLog() {
  fireEvent.click(screen.getByText('Dragapult ex'));
  fireEvent.click(screen.getByText('Win'));
}

describe('AddLogModal — bestOf (match format, plan §3.7)', () => {
  it('defaults bestOf to BO1 for a non-Bo3 event type (Online, the initial default)', () => {
    render(<AddLogModal onClose={() => {}} />);
    fillMinimalLog();
    expect(screen.getByRole('button', { name: /bo1/i, pressed: true })).toBeInTheDocument();
  });

  it('defaults bestOf to BO3 when the event type is Regional or Worlds', () => {
    render(<AddLogModal onClose={() => {}} />);
    fireEvent.change(screen.getByDisplayValue('Online'), { target: { value: 'Regional' } });
    expect(screen.getByRole('button', { name: /bo3/i, pressed: true })).toBeInTheDocument();
  });

  it('keeps a manual bestOf choice when eventType changes afterwards (default no longer applies)', () => {
    render(<AddLogModal onClose={() => {}} />);
    // Manually confirm BO1 while eventType is still 'Online' (Bo1 default),
    // then switch to a Bo3-typical event type — the manual choice must stick.
    fireEvent.click(screen.getByRole('button', { name: /bo1/i }));
    fireEvent.change(screen.getByDisplayValue('Online'), { target: { value: 'Worlds' } });
    expect(screen.getByRole('button', { name: /bo1/i, pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bo3/i, pressed: false })).toBeInTheDocument();
  });

  it('sends the currently selected bestOf value in the create-log body', async () => {
    render(<AddLogModal onClose={() => {}} />);
    fillMinimalLog();
    fireEvent.change(screen.getByDisplayValue('Online'), { target: { value: 'Regional' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(addOpponentLogMock).toHaveBeenCalled());
    expect(addOpponentLogMock.mock.calls[0]?.[0]).toMatchObject({ bestOf: 'BO3' });
  });

  it('keeps bestOf as event context (like eventType/date) across "Save & next round"', async () => {
    render(<AddLogModal onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /bo3/i }));
    fillMinimalLog();
    fireEvent.click(screen.getByRole('button', { name: /next round/i }));

    await waitFor(() => expect(addOpponentLogMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: /bo3/i, pressed: true })).toBeInTheDocument();
  });
});
