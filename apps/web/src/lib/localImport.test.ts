import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '../db/database';
import { importLocalData, shouldOfferLocalImport, LOCAL_IMPORT_FLAG } from './localImport';
import * as api from './api';
import type { Deck, DeckSnapshot, OpponentLog } from '../types';

// The entire API module is replaced — these tests assert the REMAPPED
// payloads that importLocalData sends, never touching the network.
vi.mock('./api');

const mockedApi = vi.mocked(api);

function wireDeck(id: number): Deck {
  return { id, archetype: 'a', archetypeName: 'A', variant: 'V', createdAt: '2026-06-01' };
}

function wireSnapshot(id: number, deckId: number): DeckSnapshot {
  return { id, deckId, label: 's', cards: '[]', totalCards: 0, createdAt: '2026-06-01' };
}

function wireLog(id: number): OpponentLog {
  return {
    id,
    archetype: 'gholdengo',
    eventType: 'Online',
    eventDate: '2026-06-01',
    result: 'W',
    notes: '',
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  await Promise.all([
    db.decks.clear(),
    db.deckCards.clear(),
    db.deckSnapshots.clear(),
    db.opponentLogs.clear(),
  ]);
});

describe('importLocalData id remapping', () => {
  it('remaps local deck and snapshot ids to the new server ids', async () => {
    // Local state: deck 1 with cards + snapshot 10; log referencing both.
    await db.decks.add({
      id: 1,
      archetype: 'dragapult',
      archetypeName: 'Dragapult',
      variant: 'Standard',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await db.deckCards.add({
      id: 5,
      deckId: 1,
      cardId: 0,
      name: 'Dragapult ex',
      count: 3,
      type: 'Pokemon',
      role: 'attacker',
    });
    await db.deckSnapshots.add({
      id: 10,
      deckId: 1,
      label: 'v1',
      cards: '[]',
      totalCards: 0,
      createdAt: '2026-01-02T00:00:00.000Z',
    });
    await db.opponentLogs.add({
      id: 20,
      deckId: 1,
      deckSnapshotId: 10,
      archetype: 'gholdengo',
      eventType: 'LC',
      eventDate: '2026-01-03',
      result: 'W',
      notes: 'gg',
    });

    // Server assigns completely different ids.
    mockedApi.createDeck.mockResolvedValue(wireDeck(101));
    mockedApi.replaceDeckCards.mockResolvedValue([]);
    mockedApi.createDeckSnapshot.mockResolvedValue(wireSnapshot(201, 101));
    mockedApi.createLog.mockResolvedValue(wireLog(301));

    const progress: { done: number; total: number }[] = [];
    await importLocalData((p) => progress.push({ ...p }));

    // Deck created from local fields only (no local id / createdAt sent).
    expect(mockedApi.createDeck).toHaveBeenCalledWith({
      archetype: 'dragapult',
      archetypeName: 'Dragapult',
      variant: 'Standard',
    });

    // Cards PUT under the NEW server deck id.
    expect(mockedApi.replaceDeckCards).toHaveBeenCalledTimes(1);
    expect(mockedApi.replaceDeckCards.mock.calls[0][0]).toBe(101);

    // Snapshot POSTed under the remapped deck id.
    expect(mockedApi.createDeckSnapshot).toHaveBeenCalledWith(101, {
      label: 'v1',
      cards: '[]',
    });

    // Log references translated through both id maps.
    expect(mockedApi.createLog).toHaveBeenCalledTimes(1);
    expect(mockedApi.createLog.mock.calls[0][0]).toMatchObject({
      deckId: 101,
      deckSnapshotId: 201,
      archetype: 'gholdengo',
      result: 'W',
    });

    // Progress reaches total: deck + cards + snapshot + log = 4 steps.
    expect(progress.at(-1)).toEqual({ done: 4, total: 4 });
  });

  it('drops a deckSnapshotId that points at a snapshot missing locally', async () => {
    await db.decks.add({
      id: 1,
      archetype: 'a',
      archetypeName: 'A',
      variant: 'V',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    // No snapshot 99 in Dexie — the log still references it.
    await db.opponentLogs.add({
      id: 20,
      deckId: 1,
      deckSnapshotId: 99,
      archetype: 'gholdengo',
      eventType: 'Online',
      eventDate: '2026-01-03',
      result: 'L',
      notes: '',
    });

    mockedApi.createDeck.mockResolvedValue(wireDeck(55));
    mockedApi.createLog.mockResolvedValue(wireLog(301));

    await importLocalData();

    const sent = mockedApi.createLog.mock.calls[0][0];
    expect(sent.deckId).toBe(55);
    expect(sent.deckSnapshotId).toBeUndefined();
  });

  it('does not delete any local data', async () => {
    await db.decks.add({
      id: 1,
      archetype: 'a',
      archetypeName: 'A',
      variant: 'V',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    mockedApi.createDeck.mockResolvedValue(wireDeck(101));

    await importLocalData();

    expect(await db.decks.count()).toBe(1);
  });
});

describe('shouldOfferLocalImport', () => {
  it('offers when the server is empty, local data exists and the flag is unset', async () => {
    await db.decks.add({
      id: 1,
      archetype: 'a',
      archetypeName: 'A',
      variant: 'V',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    mockedApi.listDecks.mockResolvedValue([]);
    mockedApi.listLogs.mockResolvedValue([]);

    expect(await shouldOfferLocalImport()).toBe(true);
  });

  it('does not offer when the flag is already set', async () => {
    localStorage.setItem(LOCAL_IMPORT_FLAG, '1');
    expect(await shouldOfferLocalImport()).toBe(false);
    expect(mockedApi.listDecks).not.toHaveBeenCalled();
  });

  it('does not offer when the server already has data', async () => {
    await db.opponentLogs.add({
      archetype: 'a',
      eventType: 'Online',
      eventDate: '2026-01-03',
      result: 'W',
      notes: '',
    });
    mockedApi.listDecks.mockResolvedValue([wireDeck(1)]);
    mockedApi.listLogs.mockResolvedValue([]);

    expect(await shouldOfferLocalImport()).toBe(false);
  });

  it('does not offer when there is no local data', async () => {
    expect(await shouldOfferLocalImport()).toBe(false);
  });
});
