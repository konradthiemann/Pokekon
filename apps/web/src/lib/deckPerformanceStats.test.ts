import { describe, it, expect } from 'vitest';
import { computeDeckPerformanceStats } from './deckPerformanceStats';
import type { OpponentLog, MatchResult } from '../types';

const LOG_WIN = `Konrad hat den Münzwurf gewonnen.
Konrad hat für die Starthand 7 Karten gezogen.
GegnerX hat für die Starthand 7 Karten gezogen.

Zug von Konrad
Konrad hat Nest Ball gespielt.
Konrad hat Iono gespielt.

Zug von GegnerX
GegnerX hat Pokégear 3.0 gespielt.

Zug von Konrad
Konrad hat Nest Ball gespielt.

Konrad hat gewonnen!`;

const LOG_LOSS = `Konrad hat den Münzwurf verloren.
Konrad hat für die Starthand 7 Karten gezogen.
GegnerX hat für die Starthand 7 Karten gezogen.

Zug von GegnerX
GegnerX hat Professor's Research gespielt.

Zug von Konrad
Konrad hat Nest Ball gespielt.
Konrad hat Ultra Ball gespielt.

GegnerX hat gewonnen!`;

function makeLog(result: MatchResult, battleLog?: string): OpponentLog {
  return {
    archetype: 'charizard-pidgeot',
    eventType: 'Online',
    eventDate: '2026-06-01',
    result,
    notes: '',
    battleLog,
  };
}

describe('computeDeckPerformanceStats', () => {
  it('returns null when no log has battle-log text attached', () => {
    expect(computeDeckPerformanceStats([], 'Konrad')).toBeNull();
    expect(computeDeckPerformanceStats([makeLog('W'), makeLog('L', '   ')], 'Konrad')).toBeNull();
  });

  it('computes win rate from decisive games only', () => {
    const stats = computeDeckPerformanceStats(
      [makeLog('W', LOG_WIN), makeLog('L', LOG_LOSS)],
      'Konrad',
    );
    expect(stats?.totalGamesAnalyzed).toBe(2);
    expect(stats?.overallWinRate).toBe(50);
    expect(stats?.prizeEfficiency.winGamesCount).toBe(1);
    expect(stats?.prizeEfficiency.lossGamesCount).toBe(1);
  });

  it('computes average game length overall and split by result', () => {
    const stats = computeDeckPerformanceStats(
      [makeLog('W', LOG_WIN), makeLog('L', LOG_LOSS)],
      'Konrad',
    );
    expect(stats?.avgGameLength).toBe(2.5);
    expect(stats?.avgGameLengthWins).toBe(3);
    expect(stats?.avgGameLengthLosses).toBe(2);
  });

  it('measures turn-1 actions and low-activity turn rate for my turns', () => {
    const stats = computeDeckPerformanceStats(
      [makeLog('W', LOG_WIN), makeLog('L', LOG_LOSS)],
      'Konrad',
    );
    // First own turn has 2 actions in both games
    expect(stats?.avgTurn1Actions).toBe(2);
    // 3 own turns total, 1 of them with <=1 action → 33 %
    expect(stats?.lowActivityTurnRate).toBe(33);
  });

  it('only includes cards that appeared in at least two games', () => {
    const stats = computeDeckPerformanceStats(
      [makeLog('W', LOG_WIN), makeLog('L', LOG_LOSS)],
      'Konrad',
    );
    const nestBall = stats?.cardPerformance.find((c) => c.card === 'Nest Ball');
    expect(nestBall).toMatchObject({
      totalPlays: 3,
      gamesPlayed: 2,
      playRate: 100,
      winsWithCard: 1,
      lossesWithCard: 1,
      winRate: 50,
      avgPlaysPerGame: 1.5,
    });
    // Iono only appeared in one game → filtered out
    expect(stats?.cardPerformance.find((c) => c.card === 'Iono')).toBeUndefined();
  });

  // Plan `.claude/plans/personal-data-role-rework.md` §6, "Entscheidungen
  // (bestätigt 2026-09-01)" #1 — one of the five Spec-2 win-rate laggards
  // carried over: `overallWinRate` still computes wins/(wins+losses),
  // silently dropping ties from the denominator entirely.
  it('counts ties as a third of a win in the overall win rate (tie-weighted formula, plan §6 decision 1)', () => {
    const stats = computeDeckPerformanceStats(
      [
        makeLog('W', LOG_WIN),
        makeLog('L', LOG_LOSS),
        makeLog('T', LOG_WIN),
        makeLog('T', LOG_LOSS),
        makeLog('T', LOG_WIN),
      ],
      'Konrad',
    );
    // Naive wins/(wins+losses) would give 1/2 = 50 %.
    // Tie-weighted: (1 + 3*(1/3)) / 5 = 2/5 = 40 %.
    expect(stats?.totalGamesAnalyzed).toBe(5);
    expect(stats?.overallWinRate).toBe(40);
  });

  it('skips logs without battle text but keeps the rest', () => {
    const stats = computeDeckPerformanceStats(
      [makeLog('W', LOG_WIN), makeLog('T'), makeLog('L', LOG_LOSS)],
      'Konrad',
    );
    expect(stats?.totalGamesAnalyzed).toBe(2);
  });
});
