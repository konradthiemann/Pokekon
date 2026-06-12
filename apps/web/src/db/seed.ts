import { db } from './database';
import { SEED_META_SNAPSHOTS } from '../data/seedMeta';

const SEED_KEY = 'tcg-dashboard-seeded-v1';

/**
 * Seeds DEMO META SNAPSHOTS only, so the meta charts are not empty on first
 * launch before the first live sync. Domain data (decks, cards, logs) is no
 * longer seeded — it lives server-side in Postgres and starts empty for a new
 * account.
 */
export async function seedIfEmpty(): Promise<void> {
  if (localStorage.getItem(SEED_KEY)) return;

  const metaCount = await db.metaSnapshots.count();
  if (metaCount === 0) await db.metaSnapshots.bulkAdd(SEED_META_SNAPSHOTS);

  localStorage.setItem(SEED_KEY, '1');
}
