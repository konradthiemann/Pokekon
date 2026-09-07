import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n from '../../i18n';
import { OpponentLog } from './OpponentLog';
import type { OpponentLog as OpponentLogType } from '../../types';

/**
 * Plan .claude/plans/ui-ux-button-consolidation.md §3.8 / §3.11-B — the
 * fourth "Match loggen" entry point (the footer button, only rendered when
 * `filtered.length > 0`, §0.4) is removed; the empty-state CTA stays as the
 * component's only remaining entry point (Entscheidung 2, §0.1).
 *
 * The component reads from `../../db/queries` (delete) and renders
 * `AddLogModal` (add), which itself reads from the same module — both are
 * mocked out so no test here touches IndexedDB (pattern: AddLogModal.test.tsx:10-16).
 */
vi.mock('../../db/queries', () => ({
  deleteOpponentLog: vi.fn().mockResolvedValue(undefined),
  addOpponentLog: vi.fn().mockResolvedValue(1),
}));

interface OpponentLogStoreMock {
  refresh: () => void;
  decks: Array<{ id: number; archetypeName: string; variant: string }>;
  deckSnapshots: unknown[];
  activeDeckId: number | null;
}

let storeState: OpponentLogStoreMock;

// Store-Mock nach dem Muster von Sidebar.test.tsx:33-35 (`refresh`, `decks`);
// `deckSnapshots`/`activeDeckId` sind zusätzlich nötig, weil B3 `AddLogModal`
// öffnet, das denselben Store liest (AddLogModal.tsx:90).
vi.mock('../../store/dashboardStore', () => ({
  useDashboardStore: () => storeState,
}));

function baseStore(): OpponentLogStoreMock {
  return {
    refresh: vi.fn(),
    decks: [],
    deckSnapshots: [],
    activeDeckId: null,
  };
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

function makeLog(overrides: Partial<OpponentLogType> = {}): OpponentLogType {
  return {
    id: 1,
    archetype: 'Dragapult ex',
    eventType: 'LC',
    eventDate: '2026-01-01',
    result: 'W',
    notes: '',
    ...overrides,
  };
}

describe('OpponentLog — empty state (B1)', () => {
  it('renders exactly one button, named "Log first match" (opponents:logList.logFirst)', () => {
    storeState = baseStore();
    render(<OpponentLog logs={[]} />);

    expect(
      screen.getByRole('button', { name: i18n.t('opponents:logList.logFirst') as string }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});

describe('OpponentLog — footer "log match" entry point is gone (B2)', () => {
  it('renders no button named after deck:page.logMatch, opponents:logList.logFirst, or the old "Log Match" text — only delete buttons remain', () => {
    storeState = baseStore();
    render(
      <OpponentLog logs={[makeLog({ id: 1 }), makeLog({ id: 2, archetype: 'Charizard ex' })]} />,
    );

    expect(
      screen.queryByRole('button', { name: i18n.t('deck:page.logMatch') as string }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: i18n.t('opponents:logList.logFirst') as string }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /log match/i })).not.toBeInTheDocument();

    // The delete buttons (common:delete) are the row actions — those must survive.
    const deleteButtons = screen.getAllByRole('button', {
      name: i18n.t('common:delete') as string,
    });
    expect(deleteButtons).toHaveLength(2);
  });
});

describe('OpponentLog — remaining entry point still works (B3)', () => {
  it('opens AddLogModal when the empty-state CTA is clicked', () => {
    storeState = baseStore();
    render(<OpponentLog logs={[]} />);

    fireEvent.click(
      screen.getByRole('button', { name: i18n.t('opponents:logList.logFirst') as string }),
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(i18n.t('opponents:addLog.title') as string)).toBeInTheDocument();
  });
});

describe('OpponentLog — table survives the footer removal (B4)', () => {
  it('still renders both rows when logs are non-empty', () => {
    storeState = baseStore();
    render(
      <OpponentLog
        logs={[
          makeLog({ id: 1, archetype: 'Dragapult ex' }),
          makeLog({ id: 2, archetype: 'Charizard ex' }),
        ]}
      />,
    );

    expect(screen.getByText('Dragapult ex')).toBeInTheDocument();
    expect(screen.getByText('Charizard ex')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3); // header row + 2 data rows
  });
});
