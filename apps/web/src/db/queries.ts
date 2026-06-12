import { db } from './database';
import { isPostRotationPeriod, ROTATION_PERIOD } from '../constants/season';
import type {
  Deck,
  DeckCard,
  DeckSnapshot,
  OpponentLog,
  MetaSnapshot,
  ArchetypeStats,
  DeckVariantStats,
} from '../types';

// ─── Deck queries ─────────────────────────────────────────────────────────────

export async function getDecks(): Promise<Deck[]> {
  const decks = await db.decks.toArray();
  return decks.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getDeckById(id: number): Promise<Deck | undefined> {
  return db.decks.get(id);
}

export async function createDeck(deck: Omit<Deck, 'id'>): Promise<number> {
  return db.decks.add(deck);
}

export async function updateDeck(id: number, patch: Partial<Omit<Deck, 'id'>>): Promise<void> {
  await db.decks.update(id, patch);
}

export async function deleteDeck(id: number): Promise<void> {
  await db.transaction(
    'rw',
    db.decks,
    db.deckCards,
    db.deckSnapshots,
    db.opponentLogs,
    async () => {
      await db.decks.delete(id);
      await db.deckCards.where('deckId').equals(id).delete();
      await db.deckSnapshots.where('deckId').equals(id).delete();
      await db.opponentLogs.where('deckId').equals(id).delete();
    },
  );
}

// ─── Deck card queries ────────────────────────────────────────────────────────

export async function getDeckCards(deckId?: number): Promise<DeckCard[]> {
  if (deckId !== undefined) {
    return db.deckCards.where('deckId').equals(deckId).toArray();
  }
  return db.deckCards.toArray();
}

/**
 * Insert or update a deck card by name, deduplicating within the given deck.
 * When `deckId` is provided, the lookup uses `.and(c => c.name === ...)` as a post-filter
 * rather than an index scan — no compound `[deckId+name]` index exists on `deckCards`.
 * Acceptable for small decks (≤60 cards), but avoid calling this in tight loops.
 */
export async function upsertDeckCard(card: Omit<DeckCard, 'id'>, deckId?: number): Promise<number> {
  const cardWithDeck = deckId !== undefined ? { ...card, deckId } : card;
  const existing =
    deckId !== undefined
      ? await db.deckCards
          .where('deckId')
          .equals(deckId)
          .and((c) => c.name === card.name)
          .first()
      : await db.deckCards.where('name').equals(card.name).first();
  if (existing?.id != null) {
    await db.deckCards.update(existing.id, cardWithDeck);
    return existing.id;
  }
  return db.deckCards.add(cardWithDeck);
}

export async function deleteDeckCard(id: number): Promise<void> {
  await db.deckCards.delete(id);
}

export async function updateDeckCard(
  id: number,
  patch: Partial<Omit<DeckCard, 'id'>>,
): Promise<void> {
  await db.deckCards.update(id, patch);
}

/** Copy all cards from one deck to another. Skips cards that already exist by name. */
export async function copyDeckCards(fromDeckId: number, toDeckId: number): Promise<void> {
  const src = await db.deckCards.where('deckId').equals(fromDeckId).toArray();
  const dstExisting = await db.deckCards.where('deckId').equals(toDeckId).toArray();
  const existingNames = new Set(dstExisting.map((c) => c.name));
  const toInsert = src
    .filter((c) => !existingNames.has(c.name))
    .map(({ id: _id, ...rest }) => ({ ...rest, deckId: toDeckId }));
  if (toInsert.length > 0) await db.deckCards.bulkAdd(toInsert);
}

export async function clearDeck(deckId?: number): Promise<void> {
  if (deckId !== undefined) {
    await db.deckCards.where('deckId').equals(deckId).delete();
  } else {
    await db.deckCards.clear();
  }
}

// ─── Deck snapshot queries ────────────────────────────────────────────────────

export async function getDeckSnapshots(deckId?: number): Promise<DeckSnapshot[]> {
  if (deckId !== undefined) {
    return db.deckSnapshots.where('deckId').equals(deckId).reverse().sortBy('createdAt');
  }
  return db.deckSnapshots.orderBy('createdAt').reverse().toArray();
}

/**
 * Persists a full point-in-time snapshot of the deck list.
 * `cards` must be the **complete** current deck list — this is not a diff.
 * The array is JSON-serialized into `DeckSnapshot.cards` for storage; use
 * `parseDeckSnapshot` to deserialize it back.
 */
export async function saveDeckSnapshot(
  label: string,
  cards: DeckCard[],
  deckId?: number,
): Promise<number> {
  const snap: Omit<DeckSnapshot, 'id'> = {
    label,
    cards: JSON.stringify(cards),
    totalCards: cards.reduce((s, c) => s + c.count, 0),
    createdAt: new Date().toISOString(),
    ...(deckId !== undefined && { deckId }),
  };
  return db.deckSnapshots.add(snap);
}

export async function getDeckSnapshotById(id: number): Promise<DeckSnapshot | undefined> {
  return db.deckSnapshots.get(id);
}

export function parseDeckSnapshot(snap: DeckSnapshot): DeckCard[] {
  try {
    return JSON.parse(snap.cards);
  } catch {
    return [];
  }
}

// ─── Opponent log queries ─────────────────────────────────────────────────────

export async function getOpponentLogs(deckId?: number): Promise<OpponentLog[]> {
  if (deckId !== undefined) {
    return db.opponentLogs.where('deckId').equals(deckId).reverse().sortBy('eventDate');
  }
  return db.opponentLogs.orderBy('eventDate').reverse().toArray();
}

export async function addOpponentLog(log: Omit<OpponentLog, 'id'>): Promise<number> {
  return db.opponentLogs.add(log);
}

export async function deleteOpponentLog(id: number): Promise<void> {
  await db.opponentLogs.delete(id);
}

export async function updateOpponentLog(
  id: number,
  patch: Partial<Omit<OpponentLog, 'id'>>,
): Promise<void> {
  await db.opponentLogs.update(id, patch);
}

// ─── Meta snapshot queries ────────────────────────────────────────────────────

/**
 * Returns all meta snapshots that belong to the most-recent period string (e.g. "2026-W15").
 * Two-step query: first walks the `period` index to find the latest value, then fetches
 * all rows that share that period — avoids loading the entire history into memory.
 */
export async function getLatestMetaSnapshots(): Promise<MetaSnapshot[]> {
  const latest = await db.metaSnapshots.orderBy('period').last();
  if (!latest) return [];
  // Pre-rotation periods are never served — a stale local history must not
  // surface old-format meta data (see constants/season.ts).
  if (!isPostRotationPeriod(latest.period)) return [];
  return db.metaSnapshots.where('period').equals(latest.period).toArray();
}

export async function getAllMetaSnapshots(): Promise<MetaSnapshot[]> {
  const all = await db.metaSnapshots.orderBy('period').toArray();
  return all.filter((s) => isPostRotationPeriod(s.period));
}

/**
 * One-time hygiene at app start: removes snapshots recorded before the
 * current rotation so trend views and "latest period" lookups can never
 * resurface data from the previous card pool.
 */
export async function deletePreRotationMetaSnapshots(): Promise<number> {
  return db.metaSnapshots.where('period').below(ROTATION_PERIOD).delete();
}

export async function upsertMetaSnapshot(snap: Omit<MetaSnapshot, 'id'>): Promise<number> {
  const existing = await db.metaSnapshots
    .where('[archetype+period]')
    .equals([snap.archetype, snap.period])
    .first()
    .catch(() => undefined);
  if (existing?.id != null) {
    await db.metaSnapshots.update(existing.id, snap);
    return existing.id;
  }
  return db.metaSnapshots.add(snap);
}

export async function clearMetaSnapshots(): Promise<void> {
  await db.metaSnapshots.clear();
}

// ─── Derived stats ────────────────────────────────────────────────────────────

/**
 * Merges the user's personal opponent logs with the latest meta frequency data to produce
 * one `ArchetypeStats` row per known archetype. Archetypes that appear in meta snapshots
 * but have zero personal logs are still included — their `encounters`, `wins`, `losses`,
 * and `ties` will all be 0, ensuring the UI can surface blind spots.
 */
export async function getArchetypeStats(): Promise<ArchetypeStats[]> {
  const [logs, metaSnaps] = await Promise.all([getOpponentLogs(), getLatestMetaSnapshots()]);

  const freqMap = new Map(metaSnaps.map((s) => [s.archetype, s.frequencyPct]));
  const metaWRMap = new Map(metaSnaps.map((s) => [s.archetype, s.winRatePct ?? 0]));

  const statsMap = new Map<string, ArchetypeStats>();

  for (const log of logs) {
    const existing = statsMap.get(log.archetype) ?? {
      archetype: log.archetype,
      encounters: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      winRate: 0,
      frequencyPct: freqMap.get(log.archetype) ?? 0,
      metaWinRate: metaWRMap.get(log.archetype) ?? 0,
    };
    existing.encounters++;
    if (log.result === 'W') existing.wins++;
    if (log.result === 'L') existing.losses++;
    if (log.result === 'T') existing.ties++;
    statsMap.set(log.archetype, existing);
  }

  for (const stats of statsMap.values()) {
    const decisive = stats.wins + stats.losses;
    stats.winRate = decisive > 0 ? Math.round((stats.wins / decisive) * 100) : 0;
  }

  for (const snap of metaSnaps) {
    if (!statsMap.has(snap.archetype)) {
      statsMap.set(snap.archetype, {
        archetype: snap.archetype,
        encounters: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        winRate: 0,
        frequencyPct: snap.frequencyPct,
        metaWinRate: snap.winRatePct ?? 0,
      });
    }
  }

  return [...statsMap.values()].sort(
    (a, b) => b.frequencyPct - a.frequencyPct || b.encounters - a.encounters,
  );
}

/**
 * Compute DeckVariantStats for a set of decks that share the same archetype.
 * Used for the variant-comparison analytics panel.
 *
 * The `metaScore` denominator is the total meta frequency of ALL archetypes with meta
 * data, not just the ones the deck has encountered — untested matchups rightfully drag
 * the score down, preventing inflation from a narrow sample.
 */
export async function getDeckVariantStats(decks: Deck[]): Promise<DeckVariantStats[]> {
  const deckIds = decks.map((d) => d.id!).filter(Boolean);
  const [allLogs, allMetaSnaps] = await Promise.all([
    db.opponentLogs.where('deckId').anyOf(deckIds).toArray(),
    getLatestMetaSnapshots(),
  ]);
  const freqMap = new Map(allMetaSnaps.map((s) => [s.archetype.toLowerCase(), s.frequencyPct]));

  return decks
    .map((deck) => {
      if (!deck.id) return null;
      const logs = allLogs.filter((l) => l.deckId === deck.id);

      const statsMap = new Map<string, { wins: number; losses: number; ties: number }>();
      for (const log of logs) {
        const cur = statsMap.get(log.archetype) ?? { wins: 0, losses: 0, ties: 0 };
        if (log.result === 'W') cur.wins++;
        if (log.result === 'L') cur.losses++;
        if (log.result === 'T') cur.ties++;
        statsMap.set(log.archetype, cur);
      }

      const matchupBreakdown = [...statsMap.entries()].map(([archetype, s]) => {
        const decisive = s.wins + s.losses;
        return {
          archetype,
          wins: s.wins,
          losses: s.losses,
          ties: s.ties,
          winRate: decisive > 0 ? Math.round((s.wins / decisive) * 100) : 0,
          metaFreq: freqMap.get(archetype.toLowerCase()) ?? 0,
        };
      });

      const wins = logs.filter((l) => l.result === 'W').length;
      const losses = logs.filter((l) => l.result === 'L').length;
      const ties = logs.filter((l) => l.result === 'T').length;
      const decisive = wins + losses;
      const winRate = decisive > 0 ? Math.round((wins / decisive) * 100) : 0;

      // Meta-weighted score: Σ(metaFreq * WR) / Σ(metaFreq of ALL meta archetypes)
      // Using all archetypes with meta data as denominator correctly penalises gaps
      // where the deck has not been tested against a meta threat.
      const encountered = matchupBreakdown.filter((m) => m.wins + m.losses >= 2 && m.metaFreq > 0);
      const allWithMeta = matchupBreakdown.filter((m) => m.metaFreq > 0);
      const totalMetaFreq = allWithMeta.reduce((s, m) => s + m.metaFreq, 0);
      const metaScore =
        totalMetaFreq > 0
          ? Math.round(encountered.reduce((s, m) => s + m.metaFreq * m.winRate, 0) / totalMetaFreq)
          : 0;

      const recentForm = logs.slice(0, 10).map((l) => l.result as import('../types').MatchResult);

      return {
        deckId: deck.id,
        deck,
        games: logs.length,
        wins,
        losses,
        ties,
        winRate,
        metaScore,
        recentForm,
        matchupBreakdown,
      };
    })
    .filter(Boolean) as DeckVariantStats[];
}

/**
 * Returns per-snapshot win/loss breakdown for a specific archetype.
 * Used by the recommendations engine to compare deck versions.
 */
export async function getSnapshotStatsForArchetype(
  archetype: string,
): Promise<
  { snapshotId: number | null; label: string; wins: number; losses: number; ties: number }[]
> {
  const logs = await db.opponentLogs.where('archetype').equals(archetype).toArray();

  const snapshots = await getDeckSnapshots();
  const snapMap = new Map(snapshots.map((s) => [s.id!, s.label]));

  const grouped = new Map<number | null, { wins: number; losses: number; ties: number }>();

  for (const log of logs) {
    const key = log.deckSnapshotId ?? null;
    const cur = grouped.get(key) ?? { wins: 0, losses: 0, ties: 0 };
    if (log.result === 'W') cur.wins++;
    if (log.result === 'L') cur.losses++;
    if (log.result === 'T') cur.ties++;
    grouped.set(key, cur);
  }

  return [...grouped.entries()].map(([snapshotId, stat]) => ({
    snapshotId,
    label:
      snapshotId != null
        ? (snapMap.get(snapshotId) ?? `Snapshot #${snapshotId}`)
        : 'Untagged matches',
    ...stat,
  }));
}
