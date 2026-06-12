import { db } from './database';
import { SEED_META_SNAPSHOTS, LEGACY_SEED_SOURCE_NOTE } from '../data/seedMeta';

const SEED_KEY = 'tcg-dashboard-seeded-v2';

/**
 * Seeds DEMO META SNAPSHOTS only, so the meta charts are not empty on first
 * launch before the first live sync. Domain data (decks, cards, logs) is no
 * longer seeded — it lives server-side in Postgres and starts empty for a new
 * account.
 *
 * The legacy demo seed (pre-rotation archetypes under a post-rotation period
 * label) is removed unconditionally: the period-based season cutoff cannot
 * catch it, so browsers that seeded the old baseline would keep showing
 * rotated decks in every meta view.
 */
export async function seedIfEmpty(): Promise<void> {
  // Single transaction: React StrictMode mounts effects twice in dev, so two
  // seedIfEmpty calls can race — the transaction serializes them and the
  // second run sees the already-seeded table instead of double-inserting.
  await db.transaction('rw', db.metaSnapshots, async () => {
    // .filter() instead of .where(): sourceNote is not an indexed column.
    await db.metaSnapshots.filter((s) => s.sourceNote === LEGACY_SEED_SOURCE_NOTE).delete();

    if (localStorage.getItem(SEED_KEY)) return;

    const metaCount = await db.metaSnapshots.count();
    if (metaCount === 0) await db.metaSnapshots.bulkAdd(SEED_META_SNAPSHOTS);

    localStorage.setItem(SEED_KEY, '1');
  });
}
