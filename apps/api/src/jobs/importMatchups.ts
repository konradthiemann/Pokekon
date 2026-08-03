import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseMatchupCsv, type MatchupRow } from '@pokekon/shared';
import { closeDb, getDb, type Db } from '../db/index.js';
import { matchupMatrix } from '../db/schema.js';

// Matchup-matrix import (plan §5.2/§6.1): turns a TrainerHill CSV export into
// a matchup_matrix batch (rows sharing one importedAt). Reads always use the
// latest batch, so older imports remain as history.
// Runnable as a one-off: `node dist/jobs/importMatchups.js [csv-path]`.

/** The CSV bundled with the API — the seed used when the table is empty.
 *  Resolves from both src/ (dev) and dist/ (build): each is one level deep. */
const BUNDLED_CSV_URL = new URL('../../data/matchup-matrix.csv', import.meta.url);

export function readBundledMatchupCsv(): string {
  return readFileSync(BUNDLED_CSV_URL, 'utf8');
}

export interface MatchupImportResult {
  imported: number;
  skipped: number;
  importedAt: Date;
}

/** Insert already-validated rows as a new batch (rows sharing one importedAt). */
export async function insertMatchupBatch(db: Db, rows: MatchupRow[]): Promise<Date> {
  const importedAt = new Date();
  // Chunked to stay below the per-statement parameter cap (8 columns per row).
  for (let i = 0; i < rows.length; i += 200) {
    await db
      .insert(matchupMatrix)
      .values(rows.slice(i, i + 200).map((r) => ({ ...r, importedAt })));
  }
  return importedAt;
}

/** Parse `csv` and insert it as a new batch. Throws when no valid rows remain. */
export async function importMatchups(db: Db, csv: string): Promise<MatchupImportResult> {
  const { rows, skipped } = parseMatchupCsv(csv);
  if (rows.length === 0) {
    throw new Error('No valid matchup rows found in CSV');
  }
  const importedAt = await insertMatchupBatch(db, rows);
  return { imported: rows.length, skipped, importedAt };
}

// CLI entry point: `node dist/jobs/importMatchups.js [csv-path]`.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const csvPath = process.argv[2];
  const csv = csvPath ? readFileSync(csvPath, 'utf8') : readBundledMatchupCsv();
  importMatchups(getDb(), csv)
    .then((r) => console.log('[importMatchups] done:', r))
    .catch((err) => {
      console.error('[importMatchups] failed:', err);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
