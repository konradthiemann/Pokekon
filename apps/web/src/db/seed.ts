import { db } from './database';
import { SEED_META_SNAPSHOTS, SEED_DECK_CARDS, SEED_OPPONENT_LOGS } from '../data/seedMeta';

const SEED_KEY = 'tcg-dashboard-seeded-v1';

export async function seedIfEmpty(): Promise<void> {
  if (localStorage.getItem(SEED_KEY)) return;

  const [deckCount, cardCount, logCount, metaCount] = await Promise.all([
    db.decks.count(),
    db.deckCards.count(),
    db.opponentLogs.count(),
    db.metaSnapshots.count(),
  ]);

  // Ensure a default deck exists before seeding related data.
  let defaultDeckId: number;
  if (deckCount === 0) {
    defaultDeckId = await db.decks.add({
      archetype: 'my-deck',
      archetypeName: 'My Deck',
      variant: 'Default',
      createdAt: new Date().toISOString(),
    });
  } else {
    const firstDeck = await db.decks.toCollection().first();
    defaultDeckId = firstDeck!.id!;
  }

  if (cardCount === 0) {
    await db.deckCards.bulkAdd(SEED_DECK_CARDS.map((c) => ({ ...c, deckId: defaultDeckId })));
  }
  if (logCount === 0) {
    await db.opponentLogs.bulkAdd(SEED_OPPONENT_LOGS.map((l) => ({ ...l, deckId: defaultDeckId })));
  }
  if (metaCount === 0) await db.metaSnapshots.bulkAdd(SEED_META_SNAPSHOTS);

  localStorage.setItem(SEED_KEY, '1');
}
