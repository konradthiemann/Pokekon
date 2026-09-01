import { parseBattleLog, tournamentWinRatePct } from '@pokekon/shared';
import type { OpponentLog, DeckPerformanceStats, CardPerformance } from '../types';

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1);
}

/**
 * Aggregates all battle logs into deck performance statistics.
 *
 * Returns null when no logs have a battle log attached.
 *
 * `playerName` is used to identify "my" turns in the log. It is accepted as a
 * parameter rather than read from localStorage so that this function remains a
 * pure computation with no side effects. Callers should read the stored key
 * `'tcg-player-name'` from localStorage and pass the value here.
 *
 * @param opponentLogs - The game logs to analyse.
 * @param playerName - The player's name as it appears in battle-log text. Defaults to `''`.
 */
export function computeDeckPerformanceStats(
  opponentLogs: OpponentLog[],
  playerName: string = '',
): DeckPerformanceStats | null {
  const myPlayerName = playerName;

  const logsWithLog = opponentLogs.filter((l) => l.battleLog?.trim());
  if (logsWithLog.length === 0) return null;

  // Parse all logs, skip unparseable ones silently
  const games: { result: 'W' | 'L' | 'T'; parsed: ReturnType<typeof parseBattleLog> }[] = [];
  for (const log of logsWithLog) {
    try {
      const parsed = parseBattleLog(log.battleLog!, myPlayerName);
      games.push({ result: log.result, parsed });
    } catch {
      // ignore
    }
  }
  if (games.length === 0) return null;

  const wins = games.filter((g) => g.result === 'W');
  const losses = games.filter((g) => g.result === 'L');
  const ties = games.filter((g) => g.result === 'T');
  // Tie-weighted (a tie counts as a third of a win), not wins/(wins+losses) —
  // plan personal-data-role-rework.md §6 decision 1, single win-rate formula.
  const overallWinRate = tournamentWinRatePct(wins.length, losses.length, ties.length, 0) ?? 0;

  // ── Game length ─────────────────────────────────────────────────────────────
  const avgGameLength = avg(games.map((g) => g.parsed.totalTurns));
  const avgGameLengthWins = avg(wins.map((g) => g.parsed.totalTurns));
  const avgGameLengthLosses = avg(losses.map((g) => g.parsed.totalTurns));

  // ── Turn-1 actions & low-activity turns ─────────────────────────────────────
  const turn1Actions: number[] = [];
  let totalMyTurns = 0;
  let lowActivityTurns = 0;

  for (const { parsed } of games) {
    const myTurns = parsed.turns.filter((t) => t.player === parsed.player1);
    if (myTurns[0]) turn1Actions.push(myTurns[0].actionsCount);
    for (const turn of myTurns) {
      totalMyTurns++;
      if (turn.actionsCount <= 1) lowActivityTurns++;
    }
  }

  const avgTurn1Actions = avg(turn1Actions);
  const lowActivityTurnRate =
    totalMyTurns > 0 ? Math.round((lowActivityTurns / totalMyTurns) * 100) : 0;

  // ── Card performance ─────────────────────────────────────────────────────────
  const cardMap = new Map<
    string,
    { totalPlays: number; gamesPlayed: number; wins: number; losses: number }
  >();

  for (const { parsed, result } of games) {
    const myTurns = parsed.turns.filter((t) => t.player === parsed.player1);
    const playedThisGame = new Map<string, number>();

    for (const turn of myTurns) {
      for (const card of turn.cardsPlayed) {
        playedThisGame.set(card, (playedThisGame.get(card) ?? 0) + 1);
      }
    }

    for (const [card, count] of playedThisGame) {
      const e = cardMap.get(card) ?? { totalPlays: 0, gamesPlayed: 0, wins: 0, losses: 0 };
      e.totalPlays += count;
      e.gamesPlayed++;
      if (result === 'W') e.wins++;
      if (result === 'L') e.losses++;
      cardMap.set(card, e);
    }
  }

  const cardPerformance: CardPerformance[] = [...cardMap.entries()]
    .filter(([, d]) => d.gamesPlayed >= 2)
    .map(([card, d]) => ({
      card,
      totalPlays: d.totalPlays,
      gamesPlayed: d.gamesPlayed,
      totalGames: games.length,
      playRate: Math.round((d.gamesPlayed / games.length) * 100),
      winsWithCard: d.wins,
      lossesWithCard: d.losses,
      winRate: d.wins + d.losses > 0 ? Math.round((d.wins / (d.wins + d.losses)) * 100) : 0,
      avgPlaysPerGame: +(d.totalPlays / d.gamesPlayed).toFixed(1),
    }))
    .sort((a, b) => b.playRate - a.playRate || b.gamesPlayed - a.gamesPlayed);

  // ── Prize efficiency ─────────────────────────────────────────────────────────
  // p1 = myPlayer prizes remaining. When I win: p1 → 0. When I lose: p2 → 0.
  // "Prizes opponent took in wins"   = 6 - lastPrize.p2   (how far they got before I won)
  // "Prizes I took in losses"        = 6 - lastPrize.p1   (how far I got before I lost)
  const opponentPrizesInWins: number[] = [];
  const myPrizesInLosses: number[] = [];

  for (const { parsed, result } of games) {
    const last = parsed.prizeProgression.at(-1);
    if (!last) continue;
    if (result === 'W') opponentPrizesInWins.push(6 - last.p2);
    if (result === 'L') myPrizesInLosses.push(6 - last.p1);
  }

  return {
    totalGamesAnalyzed: games.length,
    overallWinRate,
    avgGameLength,
    avgGameLengthWins,
    avgGameLengthLosses,
    avgTurn1Actions,
    lowActivityTurnRate,
    cardPerformance,
    prizeEfficiency: {
      avgPrizesOpponentTookInWins: avg(opponentPrizesInWins),
      avgPrizesYouTookInLosses: avg(myPrizesInLosses),
      winGamesCount: wins.length,
      lossGamesCount: losses.length,
    },
  };
}
