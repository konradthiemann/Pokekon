import { and, eq } from 'drizzle-orm';
import { parseBattleLog } from '@pokekon/shared';
import type { Db } from '../db/index.js';
import { matchLogParsed } from '../db/schema.js';

/**
 * Parse-on-write pipeline (plan §4): the expensive battle-log parse runs once
 * when a log is saved/updated, and the structured result is persisted to
 * match_log_parsed so later analytics reads never re-parse.
 *
 * - empty/absent battleLog → any existing parsed row for the log is removed.
 * - otherwise the log is parsed and upserted (keyed on the unique opponentLogId).
 *
 * `playerName` pins which side is "me"; when unknown the parser falls back to
 * its heuristic player detection.
 */
export async function syncParsedLog(
  db: Db,
  opts: {
    opponentLogId: number;
    userId: string;
    battleLog: string | null | undefined;
    playerName?: string | null | undefined;
  },
): Promise<void> {
  const { opponentLogId, userId, battleLog, playerName } = opts;

  if (battleLog == null || battleLog.trim() === '') {
    await db
      .delete(matchLogParsed)
      .where(
        and(eq(matchLogParsed.opponentLogId, opponentLogId), eq(matchLogParsed.userId, userId)),
      );
    return;
  }

  const parsed = parseBattleLog(battleLog, playerName ?? '');

  const values = {
    opponentLogId,
    userId,
    totalTurns: parsed.totalTurns,
    wentFirst: parsed.wentFirst,
    turns: parsed.turns,
    prizeProgression: parsed.prizeProgression,
    parserVersion: parsed.parserVersion,
    setupCleanByTurn2: parsed.setupCleanByTurn2,
    deadTurns: parsed.deadTurns,
  };

  await db
    .insert(matchLogParsed)
    .values(values)
    .onConflictDoUpdate({
      target: matchLogParsed.opponentLogId,
      set: {
        totalTurns: values.totalTurns,
        wentFirst: values.wentFirst,
        turns: values.turns,
        prizeProgression: values.prizeProgression,
        parserVersion: values.parserVersion,
        setupCleanByTurn2: values.setupCleanByTurn2,
        deadTurns: values.deadTurns,
      },
    });
}
