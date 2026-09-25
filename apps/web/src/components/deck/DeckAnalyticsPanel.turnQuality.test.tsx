import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import type { Deck } from '../../types';
import { DeckAnalyticsPanel } from './DeckAnalyticsPanel';

vi.mock('./DeckTurnQualityPanel', () => ({
  DeckTurnQualityPanel: () => <div data-testid="turn-quality-stub" />,
}));

const DECK: Deck = {
  id: 1,
  archetype: 'dragapult-ex',
  archetypeName: 'Dragapult ex',
  variant: 'Standard',
  createdAt: '2026-01-01T00:00:00.000Z',
};

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

describe('DeckAnalyticsPanel omitTurnQuality (Spec 7 §6: turn quality moves to Coaching)', () => {
  it('renders DeckTurnQualityPanel by default', () => {
    render(<DeckAnalyticsPanel decks={[DECK]} allLogs={[]} metaSnapshots={[]} activeDeckId={1} />);
    expect(screen.getByTestId('turn-quality-stub')).toBeInTheDocument();
  });

  it('omits DeckTurnQualityPanel when omitTurnQuality is set', () => {
    render(
      <DeckAnalyticsPanel
        decks={[DECK]}
        allLogs={[]}
        metaSnapshots={[]}
        activeDeckId={1}
        omitTurnQuality
      />,
    );
    expect(screen.queryByTestId('turn-quality-stub')).toBeNull();
  });
});
