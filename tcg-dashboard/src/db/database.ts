import Dexie, { type Table } from 'dexie';
import type { Card, Deck, DeckCard, DeckSnapshot, OpponentLog, MetaSnapshot } from '../types';

/**
 * Persistent IndexedDB database powered by Dexie (a thin IDB wrapper).
 * `++id` in a store definition means Dexie auto-increments the primary key.
 * Multiple `version()` calls are the migration history — each version is kept
 * so Dexie can replay upgrades for users still on older schema versions.
 */
export class TCGDatabase extends Dexie {
  cards!: Table<Card, number>;
  decks!: Table<Deck, number>;
  deckCards!: Table<DeckCard, number>;
  deckSnapshots!: Table<DeckSnapshot, number>;
  opponentLogs!: Table<OpponentLog, number>;
  metaSnapshots!: Table<MetaSnapshot, number>;

  constructor() {
    super('TCGMetaDashboard');

    this.version(1).stores({
      cards:         '++id, name, set, type',
      deckCards:     '++id, cardId, name, type, role',
      opponentLogs:  '++id, archetype, eventType, eventDate, result',
      metaSnapshots: '++id, archetype, period',
    });

    this.version(2).stores({
      cards:         '++id, name, set, type',
      deckCards:     '++id, cardId, name, type, role',
      deckSnapshots: '++id, createdAt',
      opponentLogs:  '++id, archetype, eventType, eventDate, result, deckSnapshotId',
      metaSnapshots: '++id, archetype, period',
    });

    // v3 — multi-deck support
    /**
     * WARNING: the `.upgrade()` callback MUST use Promise chaining, NOT async/await.
     * IndexedDB auto-commits the transaction when control returns to the microtask
     * queue via `await`, making any subsequent IDB calls fail silently or throw.
     */
    this.version(3).stores({
      cards:         '++id, name, set, type',
      decks:         '++id, archetype',
      deckCards:     '++id, deckId, cardId, name, type, role',
      deckSnapshots: '++id, deckId, createdAt',
      opponentLogs:  '++id, deckId, archetype, eventType, eventDate, result, deckSnapshotId',
      // The composite index `[archetype+period]` lets Dexie resolve a
      // WHERE archetype=X AND period=Y lookup in a single IDB index scan,
      // which is what the upsert-by-period query needs to stay fast.
      metaSnapshots: '++id, [archetype+period], archetype, period',
    }).upgrade((trans) => {
      // Use explicit id=1 so we don't need to capture the auto-increment return value.
      return trans.table('decks').add({
        id: 1,
        archetype: 'my-deck',
        archetypeName: 'My Deck',
        variant: 'Default',
        createdAt: new Date().toISOString(),
      }).then(() =>
        trans.table('deckCards').toCollection().modify({ deckId: 1 })
      ).then(() =>
        trans.table('deckSnapshots').toCollection().modify({ deckId: 1 })
      ).then(() =>
        trans.table('opponentLogs').toCollection().modify({ deckId: 1 })
      );
    });
  }
}

export const db = new TCGDatabase();
