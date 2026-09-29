import { render, screen } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import type { MetaWindow } from '../../lib/api';
import { ArchetypeMetaSummary } from './ArchetypeMetaSummary';

const W: MetaWindow = { days: 30, online: true, bo1: true };
let state: { data: unknown; isLoading: boolean; notInWindow: boolean; error: string | null };
vi.mock('../../hooks/useArchetypeAnalysis', () => ({ useArchetypeAnalysis: () => state }));

const analysis = (trend: unknown[]) => ({
  archetype: { sharePct: 9.1, wins: 30, losses: 20, ties: 0, playerCount: 44, icons: [] },
  fieldScore: {
    fieldWinRatePct: 52.3,
    fieldWinRateLowPct: 48.1,
    fieldWinRateHighPct: 56.4,
    rank: 3,
  },
  trend,
  tournamentCount: 12,
  totalPlayers: 480,
});

beforeAll(async () => {
  await i18n.changeLanguage('en');
});
beforeEach(() => {
  state = { data: analysis([]), isLoading: false, notInWindow: false, error: null };
});

describe('ArchetypeMetaSummary (Spec 7 §5.6, from ArchetypeDetail)', () => {
  it('shows share, win rate with band, players and field score with rank', () => {
    render(
      <ArchetypeMetaSummary archetypeId="dragapult-ex" archetypeName="Dragapult ex" window={W} />,
    );
    expect(screen.getByText('9.1%')).toBeInTheDocument();
    expect(screen.getByText('60.0%')).toBeInTheDocument();
    expect(screen.getByText('44')).toBeInTheDocument();
    expect(screen.getByText(/52\.3%/)).toBeInTheDocument();
    expect(screen.getByText('#3')).toBeInTheDocument();
    expect(screen.getByText('48.1–56.4 %')).toBeInTheDocument();
  });

  it('shows trend chips only from two points on', () => {
    const { unmount } = render(
      <ArchetypeMetaSummary archetypeId="dragapult-ex" archetypeName="Dragapult ex" window={W} />,
    );
    expect(screen.queryByText(/Trend/i)).toBeNull();
    unmount();
    state.data = analysis([
      { period: '2026-09-01', frequencyPct: 8, winRatePct: 50 },
      { period: '2026-09-08', frequencyPct: 9, winRatePct: 52 },
    ]);
    render(
      <ArchetypeMetaSummary archetypeId="dragapult-ex" archetypeName="Dragapult ex" window={W} />,
    );
    expect(screen.getByText(/Trend/i)).toBeInTheDocument();
  });

  it('explains when the archetype was not played in the window', () => {
    state = { data: null, isLoading: false, notInWindow: true, error: null };
    render(
      <ArchetypeMetaSummary archetypeId="dragapult-ex" archetypeName="Dragapult ex" window={W} />,
    );
    expect(screen.queryByText('#3')).toBeNull();
    expect(screen.getByText(/window/i)).toBeInTheDocument();
  });
});
