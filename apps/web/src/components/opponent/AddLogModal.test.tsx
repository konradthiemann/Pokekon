import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import i18n from '../../i18n';
import { AddLogModal } from './AddLogModal';
import { addOpponentLog } from '../../db/queries';
import { prefillFromBattleLog, type BattleLogPrefill } from '@pokekon/shared';

// The modal must never hit the network / IndexedDB in this test — only the
// write call is observed.
vi.mock('../../db/queries', () => ({
  addOpponentLog: vi.fn().mockResolvedValue(1),
}));

vi.mock('../../store/dashboardStore', () => ({
  useDashboardStore: () => ({ decks: [], deckSnapshots: [], activeDeckId: null }),
}));

// The battle-log-prefill *decision logic* is @pokekon/shared's job and is
// tested exhaustively (with real card-name matching) in
// packages/shared/src/battleLogPrefill.test.ts. Here we only test that
// AddLogModal REACTS correctly to a given BattleLogPrefill — mocking this out
// decouples the UI test from the real KNOWN_ARCHETYPES.logNames data (plan
// personal-data-role-rework §3.6, still an implementer TODO at time of writing).
vi.mock('@pokekon/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pokekon/shared')>();
  return { ...actual, prefillFromBattleLog: vi.fn() };
});

const addOpponentLogMock = vi.mocked(addOpponentLog);
const prefillFromBattleLogMock = vi.mocked(prefillFromBattleLog);

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
  prefillFromBattleLogMock.mockReset();
  localStorage.clear();
});

/** Builds a `BattleLogPrefill` fixture (plan §3.1) with sane defaults; override
 *  only what a given scenario needs. `parsed` is never read by AddLogModal
 *  itself (it's the shared-package's internal plumbing), so it is stubbed. */
function fakePrefill(overrides: Partial<BattleLogPrefill> = {}): BattleLogPrefill {
  return {
    parsed: {} as unknown as BattleLogPrefill['parsed'],
    playerPinned: true,
    detectedPlayers: ['Gtmap', 'Premiox'],
    opponentCards: ['Ns Zoroark-ex'],
    archetype: { candidates: [], best: null, confidence: 'none' },
    result: null,
    ...overrides,
  };
}

const DRAGAPULT_CANDIDATE = {
  slug: 'dragapult-ex',
  name: 'Dragapult ex',
  matched: ['Dragapult'],
  coverage: 1,
};
const LUCARIO_CANDIDATE = {
  slug: 'lucario-hariyama',
  name: 'Lucario Hariyama',
  matched: ['Lucario', 'Hariyama'],
  coverage: 1,
};

/** Pastes non-empty text into the (already-existing) battle-log textarea. */
function pasteBattleLog(text = 'FAKE BATTLE LOG TEXT') {
  fireEvent.change(screen.getByPlaceholderText(/paste battle log here/i), {
    target: { value: text },
  });
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Battle-log-first pre-fill (plan personal-data-role-rework §3.6, M1–M10).
// `prefillFromBattleLog` itself is mocked (see top of file) — these tests only
// assert how the MODAL reacts to a given prefill result.
//
// NOTE on assumed copy: the exact English strings for the new "from log"
// badge / "who are you" prompt / Bo3 notice are NOT frozen anywhere in the
// plan (only the German target text is, via the i18n key descriptions in
// §3.9). The regexes below encode a reasonable literal-English-mirror
// assumption ("from log", "who are you", "one game", "not recognised") — if
// @implementer's chosen copy differs, adjust the matching regex, not the
// underlying behavioural assertion.
// ─────────────────────────────────────────────────────────────────────────────
describe('AddLogModal — battle-log prefill (plan §3.6)', () => {
  it('M1: a unique guess pre-selects the archetype tile and the result, both marked as from-log', () => {
    prefillFromBattleLogMock.mockReturnValue(
      fakePrefill({
        archetype: {
          candidates: [DRAGAPULT_CANDIDATE],
          best: DRAGAPULT_CANDIDATE,
          confidence: 'unique',
        },
        result: 'W',
      }),
    );
    render(<AddLogModal onClose={() => {}} />);
    pasteBattleLog();

    expect(
      screen.getByRole('button', { name: /Dragapult ex/i, pressed: true }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Win', pressed: true })).toBeInTheDocument();
    expect(screen.getAllByText(/from log/i).length).toBeGreaterThan(0);
  });

  it('M2: a manual override after a unique guess is not overwritten by a later render', () => {
    prefillFromBattleLogMock.mockReturnValue(
      fakePrefill({
        archetype: {
          candidates: [DRAGAPULT_CANDIDATE],
          best: DRAGAPULT_CANDIDATE,
          confidence: 'unique',
        },
        result: 'W',
      }),
    );
    render(<AddLogModal onClose={() => {}} />);
    pasteBattleLog();
    expect(
      screen.getByRole('button', { name: /Dragapult ex/i, pressed: true }),
    ).toBeInTheDocument();

    // Manual override: pick a different known archetype.
    fireEvent.click(screen.getByText('Lucario Hariyama'));
    expect(
      screen.getByRole('button', { name: /Lucario Hariyama/i, pressed: true }),
    ).toBeInTheDocument();

    // Trigger an unrelated re-render (event type change) — the same battleLog
    // text must NOT re-trigger the prefill and revert the manual choice.
    fireEvent.change(screen.getByDisplayValue('Online'), { target: { value: 'LC' } });

    expect(
      screen.getByRole('button', { name: /Lucario Hariyama/i, pressed: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Dragapult ex/i, pressed: false }),
    ).toBeInTheDocument();
  });

  it('M3: an ambiguous guess offers candidates as chips but auto-selects none', () => {
    prefillFromBattleLogMock.mockReturnValue(
      fakePrefill({
        archetype: {
          candidates: [DRAGAPULT_CANDIDATE, LUCARIO_CANDIDATE],
          best: null,
          confidence: 'ambiguous',
        },
        result: 'W',
      }),
    );
    render(<AddLogModal onClose={() => {}} />);
    pasteBattleLog();

    // Neither the tile grid nor any chip auto-selects a candidate.
    expect(
      screen.queryByRole('button', { name: /^Dragapult ex$/i, pressed: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Lucario Hariyama$/i, pressed: true }),
    ).not.toBeInTheDocument();

    // A chip row offers the candidates — the candidate name now appears more
    // than once (once in the always-visible tile grid, once as a chip).
    expect(screen.getAllByText(/Dragapult ex/i).length).toBeGreaterThan(1);

    // Tapping the chip sets the archetype (tile becomes pressed).
    const chips = screen.getAllByText(/Dragapult ex/i);
    fireEvent.click(chips[chips.length - 1]!);
    expect(
      screen.getByRole('button', { name: /^Dragapult ex$/i, pressed: true }),
    ).toBeInTheDocument();
  });

  it('M4: no match shows a neutral hint, never error styling', () => {
    prefillFromBattleLogMock.mockReturnValue(
      fakePrefill({ archetype: { candidates: [], best: null, confidence: 'none' }, result: null }),
    );
    render(<AddLogModal onClose={() => {}} />);
    pasteBattleLog();

    expect(screen.getByText(/not recognised|not recognized/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });

  it('M5: an unpinned player is asked to choose before anything is pre-filled', () => {
    prefillFromBattleLogMock.mockImplementation((_log, playerName) =>
      fakePrefill({
        playerPinned: playerName === 'Gtmap',
        archetype:
          playerName === 'Gtmap'
            ? { candidates: [DRAGAPULT_CANDIDATE], best: DRAGAPULT_CANDIDATE, confidence: 'unique' }
            : { candidates: [], best: null, confidence: 'none' },
        result: playerName === 'Gtmap' ? 'W' : null,
      }),
    );
    render(<AddLogModal onClose={() => {}} />);
    pasteBattleLog();

    // Nothing pre-filled yet — playerName in localStorage is empty, so the
    // fixture reports playerPinned: false.
    expect(
      screen.getByRole('button', { name: /Dragapult ex/i, pressed: false }),
    ).toBeInTheDocument();
    expect(screen.getByText(/who are you/i)).toBeInTheDocument();
    const gtmapButton = screen.getByRole('button', { name: 'Gtmap' });
    const premioxButton = screen.getByRole('button', { name: 'Premiox' });
    expect(gtmapButton).toBeInTheDocument();
    expect(premioxButton).toBeInTheDocument();

    fireEvent.click(gtmapButton);

    expect(localStorage.getItem('tcg-player-name')).toBe('Gtmap');
    expect(
      screen.getByRole('button', { name: /Dragapult ex/i, pressed: true }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Win', pressed: true })).toBeInTheDocument();
  });

  it('M6: a Bo3 event does not pre-fill the result, and shows a "one game only" notice', () => {
    prefillFromBattleLogMock.mockReturnValue(
      fakePrefill({
        archetype: {
          candidates: [DRAGAPULT_CANDIDATE],
          best: DRAGAPULT_CANDIDATE,
          confidence: 'unique',
        },
        result: 'W',
      }),
    );
    render(<AddLogModal onClose={() => {}} />);
    fireEvent.change(screen.getByDisplayValue('Online'), { target: { value: 'Regional' } });
    pasteBattleLog();

    // The archetype can still pre-fill (it's not Bo1/Bo3-specific); the RESULT
    // must not, because one battle log covers one game, not a Bo3 match.
    expect(screen.getByRole('button', { name: 'Win', pressed: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Loss', pressed: false })).toBeInTheDocument();
    expect(screen.getByText(/one game|not the (whole|entire) match/i)).toBeInTheDocument();
  });

  it('M7: unparseable text behaves exactly like no log at all — no crash, no error UI', () => {
    prefillFromBattleLogMock.mockReturnValue(null);
    render(<AddLogModal onClose={() => {}} />);
    pasteBattleLog('this is not a battle log');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();

    // The manual path still works exactly as before this feature existed.
    fillMinimalLog();
    expect(screen.getByRole('button', { name: 'Win', pressed: true })).toBeInTheDocument();
  });

  it('M9: saving with a pinned player name sends it in the create-log payload', async () => {
    prefillFromBattleLogMock.mockReturnValue(fakePrefill());
    localStorage.setItem('tcg-player-name', 'Gtmap');
    render(<AddLogModal onClose={() => {}} />);
    fillMinimalLog();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(addOpponentLogMock).toHaveBeenCalled());
    expect(addOpponentLogMock.mock.calls[0]?.[0]).toMatchObject({ playerName: 'Gtmap' });
  });

  it('M10: saving without a log and without a stored player name omits playerName entirely', async () => {
    render(<AddLogModal onClose={() => {}} />);
    fillMinimalLog();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(addOpponentLogMock).toHaveBeenCalled());
    expect(addOpponentLogMock.mock.calls[0]?.[0]).not.toHaveProperty('playerName');
  });
});
