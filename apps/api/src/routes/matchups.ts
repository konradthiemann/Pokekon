import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { parseMatchupCsv } from '@pokekon/shared';
import { insertMatchupBatch } from '../jobs/importMatchups.js';
import { ensureMatchups } from '../lib/matchupData.js';
import { rateLimit } from '../lib/rateLimit.js';
import type { ApiEnv } from '../middleware/session.js';

/** TrainerHill exports are ~200 rows / a few KB — anything near this cap is not a matrix. */
const MAX_CSV_BYTES = 512 * 1024;

/**
 * /api/matchups — the head-to-head matchup matrix (plan §6.1). Reads serve the
 * latest imported batch (lazily seeded from the bundled CSV); the POST accepts
 * a fresh TrainerHill CSV export as a new batch.
 */
export function createMatchupsRoutes(): Hono<ApiEnv> {
  const routes = new Hono<ApiEnv>();

  // GET /api/matchups — latest batch, seeded from the bundled CSV when empty.
  routes.get('/', async (c) => {
    const { importedAt, rows } = await ensureMatchups(c.get('db'));
    return c.json({ importedAt: importedAt?.toISOString() ?? null, rows });
  });

  // POST /api/matchups/import — raw CSV body (text/csv), stored as a new batch.
  // bodyLimit aborts the stream at the cap instead of buffering an arbitrarily
  // large body first (security review H1); the rate limit keeps a scripted
  // guest account from spamming imports (M1).
  routes.post(
    '/import',
    bodyLimit({ maxSize: MAX_CSV_BYTES }),
    rateLimit({ windowMs: 10 * 60_000, max: 5 }),
    async (c) => {
      const csv = await c.req.text();
      if (csv.length === 0) return c.json({ error: 'Empty CSV body' }, 400);

      // Validation errors (wrong header, no valid rows) are the caller's to fix
      // and safe to echo; database errors are logged server-side only (L2).
      let parsed: ReturnType<typeof parseMatchupCsv>;
      try {
        parsed = parseMatchupCsv(csv);
      } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : 'Invalid CSV' }, 400);
      }
      if (parsed.rows.length === 0) {
        return c.json({ error: 'No valid matchup rows found in CSV' }, 400);
      }

      try {
        const importedAt = await insertMatchupBatch(c.get('db'), parsed.rows);
        return c.json({
          imported: parsed.rows.length,
          skipped: parsed.skipped,
          importedAt: importedAt.toISOString(),
        });
      } catch (err) {
        console.error('[matchups] import failed:', err);
        return c.json({ error: 'Import failed' }, 500);
      }
    },
  );

  return routes;
}
