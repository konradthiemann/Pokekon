import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18n from '../../i18n';
import { DeckAnalyticsPanel } from './DeckAnalyticsPanel';
import type { Deck, OpponentLog } from '../../types';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

// DeckTurnQualityPanel (nested) fetches server analytics on mount — stub it
// so this test never hits the network.
vi.mock('../../lib/api', () => ({
  getDeckAnalytics: vi.fn().mockResolvedValue({
    record: { games: 0, wins: 0, losses: 0, ties: 0, winRatePct: null },
    goingFirst: { games: 0, wins: 0, losses: 0, ties: 0, winRatePct: null },
    goingSecond: { games: 0, wins: 0, losses: 0, ties: 0, winRatePct: null },
    setup: { cleanRatePct: null, parsedGames: 0 },
    deadTurns: { avgPerGame: null, parsedGames: 0 },
    prizeCurveWins: [],
  }),
}));

const DECK: Deck = {
  id: 1,
  archetype: 'dragapult-ex',
  archetypeName: 'Dragapult ex',
  variant: 'Standard',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function log(over: Partial<OpponentLog>): OpponentLog {
  return {
    deckId: 1,
    archetype: 'Gardevoir',
    eventType: 'Online',
    eventDate: '2026-06-01',
    result: 'W',
    notes: '',
    ...over,
  };
}

// 2W/1L/3T: naive wins/(wins+losses) = 67 %, tie-weighted
// (2 + 3*(1/3)) / 6 = 3/6 = 50 % (plan personal-data-role-rework §6
// decision 1 — the sixth, previously overlooked win-rate spot: the `wr()`
// helper in DeckAnalyticsPanel, not part of Spec 2's original five).
const LOGS: OpponentLog[] = [
  log({ result: 'W' }),
  log({ result: 'W' }),
  log({ result: 'L' }),
  log({ result: 'T' }),
  log({ result: 'T' }),
  log({ result: 'T' }),
];

describe('DeckAnalyticsPanel — win rate (plan personal-data-role-rework §6 decision 1)', () => {
  it('counts ties as a third of a win in the active variant win-rate KPI', () => {
    render(
      <DeckAnalyticsPanel decks={[DECK]} allLogs={LOGS} metaSnapshots={[]} activeDeckId={1} />,
    );
    expect(screen.getAllByText('50%').length).toBeGreaterThan(0);
    expect(screen.queryByText('67%')).not.toBeInTheDocument();
  });
});
