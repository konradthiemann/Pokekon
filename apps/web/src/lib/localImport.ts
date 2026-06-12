import { db } from '../db/database';
import * as api from './api';

/**
 * One-time migration of pre-account local data (IndexedDB/Dexie) to the
 * server, offered right after the first login. The local data is READ ONLY —
 * nothing is deleted from IndexedDB, so a failed or declined import can
 * always be retried by clearing the localStorage flag below.
 */

export const LOCAL_IMPORT_FLAG = 'pokekon-local-import-done';

export function isLocalImportDone(): boolean {
  return localStorage.getItem(LOCAL_IMPORT_FLAG) !== null;
}

export function markLocalImportDone(): void {
  localStorage.setItem(LOCAL_IMPORT_FLAG, '1');
}

export interface LocalDataCounts {
  decks: number;
  logs: number;
}

/** Counts the legacy domain data still sitting in the local Dexie database. */
export async function getLocalDataCounts(): Promise<LocalDataCounts> {
  const [decks, logs] = await Promise.all([db.decks.count(), db.opponentLogs.count()]);
  return { decks, logs };
}

/**
 * The import is offered exactly when:
 * (a) the server account has 0 decks AND 0 logs,
 * (b) local Dexie still has decks or opponent logs, and
 * (c) the one-time flag has not been set yet.
 * Any API failure suppresses the offer — it will be re-evaluated next login.
 */
export async function shouldOfferLocalImport(): Promise<boolean> {
  if (isLocalImportDone()) return false;

  const local = await getLocalDataCounts();
  if (local.decks === 0 && local.logs === 0) return false;

  try {
    const [serverDecks, serverLogs] = await Promise.all([
      api.listDecks(),
      api.listLogs({ limit: 1 }),
    ]);
    return serverDecks.length === 0 && serverLogs.length === 0;
  } catch {
    return false;
  }
}

export interface ImportProgress {
  done: number;
  total: number;
}

/**
 * Uploads all local domain data to the server, REMAPPING ids as it goes:
 * - decks are created first; an old→new deck-id map is built from the responses
 * - each deck's cards are PUT under the new deck id
 * - snapshots are POSTed under the remapped deck id; an old→new snapshot-id
 *   map is built (the snapshot's JSON `cards` string is parsed server-bound
 *   inside api.createDeckSnapshot)
 * - logs are POSTed with `deckId`/`deckSnapshotId` translated through the two
 *   maps; references that cannot be resolved locally anymore are dropped from
 *   the payload (the log itself is still imported)
 *
 * Throws on the first failed request — the caller shows the error, keeps the
 * flag unset and offers a retry. Local data is never modified.
 */
export async function importLocalData(
  onProgress?: (progress: ImportProgress) => void,
): Promise<void> {
  const [decks, cards, snapshots, logs] = await Promise.all([
    db.decks.toArray(),
    db.deckCards.toArray(),
    db.deckSnapshots.toArray(),
    db.opponentLogs.toArray(),
  ]);

  const decksWithCards = decks.filter((d) => cards.some((c) => c.deckId === d.id)).length;
  const total = decks.length + decksWithCards + snapshots.length + logs.length;
  let done = 0;
  const step = () => {
    done++;
    onProgress?.({ done, total });
  };
  onProgress?.({ done, total });

  const deckIdMap = new Map<number, number>();
  const snapshotIdMap = new Map<number, number>();

  // 1) Decks (+ per-deck card lists)
  for (const deck of decks) {
    const created = await api.createDeck({
      archetype: deck.archetype,
      archetypeName: deck.archetypeName,
      variant: deck.variant,
    });
    if (deck.id != null) deckIdMap.set(deck.id, created.id!);
    step();

    const deckCards = cards.filter((c) => c.deckId === deck.id);
    if (deckCards.length > 0) {
      await api.replaceDeckCards(created.id!, deckCards);
      step();
    }
  }

  // 2) Snapshots — need a remapped parent deck; orphans cannot exist server-side.
  for (const snap of snapshots) {
    const newDeckId = snap.deckId != null ? deckIdMap.get(snap.deckId) : undefined;
    if (newDeckId === undefined) {
      step();
      continue;
    }
    const created = await api.createDeckSnapshot(newDeckId, {
      label: snap.label,
      cards: snap.cards,
    });
    if (snap.id != null) snapshotIdMap.set(snap.id, created.id!);
    step();
  }

  // 3) Logs — translate both references; unresolved ones are sent without.
  for (const log of logs) {
    await api.createLog({
      deckId: log.deckId != null ? deckIdMap.get(log.deckId) : undefined,
      archetype: log.archetype,
      eventType: log.eventType,
      eventDate: log.eventDate,
      result: log.result,
      notes: log.notes,
      round: log.round,
      deckSnapshotId:
        log.deckSnapshotId != null ? snapshotIdMap.get(log.deckSnapshotId) : undefined,
      battleLog: log.battleLog,
      analysis: log.analysis,
    });
    step();
  }
}
