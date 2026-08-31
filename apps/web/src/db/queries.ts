import { bo1EquivalentWinRate, tournamentWinRatePct, type MetaSyncResult } from '@pokekon/shared';
import i18n from '../i18n';
import * as api from '../lib/api';
import type {
  Deck,
  DeckCard,
  DeckSnapshot,
  OpponentLog,
  MetaSnapshot,
  ArchetypeStats,
  DeckVariantStats,
} from '../types';

/**
 * Domain data layer.
 *
 * Decks, deck cards, deck snapshots and opponent logs live in Postgres behind
 * the REST API (single source of truth, session-scoped) — every function below
 * delegates to src/lib/api.ts. Only META SNAPSHOTS remain in the local Dexie
 * database: they are a per-browser cache of public tournament data and need no
 * account. The Dexie domain tables are no longer written to, but the schema is
 * kept so the one-time local-data import (src/lib/localImport.ts) can still
 * READ legacy data.
 */

// ─── Deck queries ─────────────────────────────────────────────────────────────

export async function getDecks(): Promise<Deck[]> {
  const decks = await api.listDecks();
  return decks.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getDeckById(id: number): Promise<Deck | undefined> {
  const decks = await api.listDecks();
  return decks.find((d) => d.id === id);
}

export async function createDeck(deck: Omit<Deck, 'id'>): Promise<number> {
  // `createdAt` is server-assigned; only the editable fields are sent.
  const created = await api.createDeck({
    archetype: deck.archetype,
    archetypeName: deck.archetypeName,
    variant: deck.variant,
  });
  return created.id!;
}

export async function updateDeck(id: number, patch: Partial<Omit<Deck, 'id'>>): Promise<void> {
  const body: Partial<{ archetype: string; archetypeName: string; variant: string }> = {};
  if (patch.archetype !== undefined) body.archetype = patch.archetype;
  if (patch.archetypeName !== undefined) body.archetypeName = patch.archetypeName;
  if (patch.variant !== undefined) body.variant = patch.variant;
  if (Object.keys(body).length === 0) return;
  await api.updateDeck(id, body);
}

/** Deletes the deck — cards, snapshots and logs cascade server-side. */
export async function deleteDeck(id: number): Promise<void> {
  await api.deleteDeck(id);
}

// ─── Deck card queries ────────────────────────────────────────────────────────

export async function getDeckCards(deckId?: number): Promise<DeckCard[]> {
  if (deckId !== undefined) {
    return api.listDeckCards(deckId);
  }
  const decks = await api.listDecks();
  const perDeck = await Promise.all(decks.map((d) => api.listDeckCards(d.id!)));
  return perDeck.flat();
}

function requireDeckId(deckId: number | undefined): number {
  if (deckId === undefined) {
    throw new Error(i18n.t('deck:import.noActiveDeck'));
  }
  return deckId;
}

/**
 * Insert or update a deck card by name within the given deck.
 * The API only exposes whole-list PUT semantics, so this is implemented as
 * read–merge–replace. Returns the (new) server id of the upserted card.
 * `deckId` is required now that cards always belong to a server deck.
 */
export async function upsertDeckCard(card: Omit<DeckCard, 'id'>, deckId?: number): Promise<number> {
  const id = requireDeckId(deckId ?? card.deckId);
  const current = await api.listDeckCards(id);
  const next = current.some((c) => c.name === card.name)
    ? current.map((c) => (c.name === card.name ? { ...c, ...card } : c))
    : [...current, card];
  const saved = await api.replaceDeckCards(id, next);
  const savedCard = saved.find((c) => c.name === card.name);
  return savedCard?.id ?? 0;
}

/** Removes one card from the deck's list (read–filter–replace). */
export async function deleteDeckCard(deckId: number, id: number): Promise<void> {
  const current = await api.listDeckCards(deckId);
  await api.replaceDeckCards(
    deckId,
    current.filter((c) => c.id !== id),
  );
}

export async function updateDeckCard(
  deckId: number,
  id: number,
  patch: Partial<Omit<DeckCard, 'id'>>,
): Promise<void> {
  const current = await api.listDeckCards(deckId);
  await api.replaceDeckCards(
    deckId,
    current.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  );
}

/** Copy all cards from one deck to another. Skips cards that already exist by name. */
export async function copyDeckCards(fromDeckId: number, toDeckId: number): Promise<void> {
  const [src, dst] = await Promise.all([
    api.listDeckCards(fromDeckId),
    api.listDeckCards(toDeckId),
  ]);
  const existingNames = new Set(dst.map((c) => c.name));
  const toInsert = src.filter((c) => !existingNames.has(c.name));
  if (toInsert.length > 0) await api.replaceDeckCards(toDeckId, [...dst, ...toInsert]);
}

export async function clearDeck(deckId: number): Promise<void> {
  await api.replaceDeckCards(deckId, []);
}

// ─── Deck snapshot queries ────────────────────────────────────────────────────

export async function getDeckSnapshots(deckId?: number): Promise<DeckSnapshot[]> {
  if (deckId !== undefined) {
    return api.listDeckSnapshots(deckId);
  }
  const decks = await api.listDecks();
  const perDeck = await Promise.all(decks.map((d) => api.listDeckSnapshots(d.id!)));
  return perDeck.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Persists a full point-in-time snapshot of the deck list.
 * `cards` must be the **complete** current deck list — this is not a diff.
 * The server stores the list as jsonb and computes `totalCards`; use
 * `parseDeckSnapshot` to deserialize the client-side JSON string back.
 */
export async function saveDeckSnapshot(
  label: string,
  cards: DeckCard[],
  deckId?: number,
): Promise<number> {
  const id = requireDeckId(deckId);
  const created = await api.createDeckSnapshot(id, { label, cards: JSON.stringify(cards) });
  return created.id!;
}

export async function getDeckSnapshotById(id: number): Promise<DeckSnapshot | undefined> {
  // No GET /api/snapshots/:id route — resolve via the per-deck listings.
  const snapshots = await getDeckSnapshots();
  return snapshots.find((s) => s.id === id);
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
  // The server already orders by eventDate desc, id desc.
  return api.listAllLogs(deckId);
}

export async function addOpponentLog(log: Omit<OpponentLog, 'id'>): Promise<number> {
  const created = await api.createLog(log);
  return created.id!;
}

export async function deleteOpponentLog(id: number): Promise<void> {
  await api.deleteLog(id);
}

export async function updateOpponentLog(
  id: number,
  patch: Partial<Omit<OpponentLog, 'id'>>,
): Promise<void> {
  await api.updateLog(id, patch);
}

// ─── Meta snapshot queries (server-side, global) ──────────────────────────────
// Meta now lives in Postgres and is populated by the server-side sync job
// (GET /api/meta returns only in-season periods). The former local Dexie cache,
// per-browser sync and demo seed have been removed (single source of truth).

/** All in-season meta snapshots across every post-rotation period. */
export async function getAllMetaSnapshots(): Promise<MetaSnapshot[]> {
  return api.getMeta();
}

/** Meta snapshots for the most-recent period only. */
export async function getLatestMetaSnapshots(): Promise<MetaSnapshot[]> {
  const all = await api.getMeta();
  if (all.length === 0) return [];
  const latestPeriod = all.reduce((max, s) => (s.period > max ? s.period : max), all[0]!.period);
  return all.filter((s) => s.period === latestPeriod);
}

/** Trigger the server-side meta sync; returns the run summary. */
export async function syncMeta(): Promise<MetaSyncResult> {
  return api.syncMeta();
}

// ─── Derived stats ────────────────────────────────────────────────────────────

/** Per-format W/L/T buckets accumulated while scanning logs, so the Bo1-
 *  equivalent win rate (plan §3.2) can be derived once per archetype without a
 *  second pass over the logs. */
interface FormatBuckets {
  bo1: { wins: number; losses: number; ties: number };
  bo3: { wins: number; losses: number; ties: number };
  unknown: { wins: number; losses: number; ties: number };
}

function emptyFormatRecord(): { wins: number; losses: number; ties: number } {
  return { wins: 0, losses: 0, ties: 0 };
}

/**
 * Merges the user's personal opponent logs (API) with the latest local meta
 * frequency data to produce one `ArchetypeStats` row per known archetype.
 * Archetypes that appear in meta snapshots but have zero personal logs are
 * still included — their `encounters`, `wins`, `losses`, and `ties` will all
 * be 0, ensuring the UI can surface blind spots.
 *
 * `winRate` is the tie-weighted tournament win rate across ALL logs (a tie
 * counts as a third of a win, see `tournamentWinRatePct`); `bo1EquivalentWinRate`
 * additionally converts Bo3 results back to their Bo1 equivalent and excludes
 * logs with no known `bestOf` (pre-dating the field) from the comparison.
 */
export async function getArchetypeStats(): Promise<ArchetypeStats[]> {
  const [logs, metaSnaps] = await Promise.all([getOpponentLogs(), getLatestMetaSnapshots()]);

  const freqMap = new Map(metaSnaps.map((s) => [s.archetype, s.frequencyPct]));
  const metaWRMap = new Map(metaSnaps.map((s) => [s.archetype, s.winRatePct ?? 0]));

  const statsMap = new Map<string, ArchetypeStats>();
  const bucketsMap = new Map<string, FormatBuckets>();

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
      bo1EquivalentWinRate: null,
      bo1Games: 0,
      bo3Games: 0,
      unknownFormatGames: 0,
    };
    const buckets = bucketsMap.get(log.archetype) ?? {
      bo1: emptyFormatRecord(),
      bo3: emptyFormatRecord(),
      unknown: emptyFormatRecord(),
    };
    const bucket =
      log.bestOf === 'BO1' ? buckets.bo1 : log.bestOf === 'BO3' ? buckets.bo3 : buckets.unknown;

    existing.encounters++;
    if (log.result === 'W') {
      existing.wins++;
      bucket.wins++;
    }
    if (log.result === 'L') {
      existing.losses++;
      bucket.losses++;
    }
    if (log.result === 'T') {
      existing.ties++;
      bucket.ties++;
    }
    statsMap.set(log.archetype, existing);
    bucketsMap.set(log.archetype, buckets);
  }

  for (const stats of statsMap.values()) {
    stats.winRate = tournamentWinRatePct(stats.wins, stats.losses, stats.ties, 0) ?? 0;

    const buckets = bucketsMap.get(stats.archetype);
    if (buckets) {
      // 1 decimal, matching the display precision the other win-rate badges
      // in this view use (winRatePct1).
      const bo1Equiv = bo1EquivalentWinRate(buckets, 1);
      stats.bo1EquivalentWinRate = bo1Equiv.winRatePct;
      stats.bo1Games = bo1Equiv.bo1Games;
      stats.bo3Games = bo1Equiv.bo3Games;
      stats.unknownFormatGames = bo1Equiv.unknownGames;
    }
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
        bo1EquivalentWinRate: null,
        bo1Games: 0,
        bo3Games: 0,
        unknownFormatGames: 0,
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
 *
 * `winRate` (overall and per-archetype in `matchupBreakdown`) uses the same
 * tie-weighted `tournamentWinRatePct` as `getArchetypeStats` — a tie counts as
 * a third of a win, not excluded from the calculation.
 */
export async function getDeckVariantStats(decks: Deck[]): Promise<DeckVariantStats[]> {
  const deckIds = new Set(decks.map((d) => d.id!).filter(Boolean));
  const [logsAll, allMetaSnaps] = await Promise.all([getOpponentLogs(), getLatestMetaSnapshots()]);
  const allLogs = logsAll.filter((l) => l.deckId != null && deckIds.has(l.deckId));
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

      const matchupBreakdown = [...statsMap.entries()].map(([archetype, s]) => ({
        archetype,
        wins: s.wins,
        losses: s.losses,
        ties: s.ties,
        winRate: tournamentWinRatePct(s.wins, s.losses, s.ties, 0) ?? 0,
        metaFreq: freqMap.get(archetype.toLowerCase()) ?? 0,
      }));

      const wins = logs.filter((l) => l.result === 'W').length;
      const losses = logs.filter((l) => l.result === 'L').length;
      const ties = logs.filter((l) => l.result === 'T').length;
      const winRate = tournamentWinRatePct(wins, losses, ties, 0) ?? 0;

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
  const [allLogs, snapshots] = await Promise.all([getOpponentLogs(), getDeckSnapshots()]);
  const logs = allLogs.filter((l) => l.archetype === archetype);
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
