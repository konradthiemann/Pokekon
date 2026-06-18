import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { closeDb, getDb } from './db/index.js';

// Production migration runner (used as Railway's preDeployCommand). Uses the
// drizzle-orm migrator — a runtime dependency — so it works even when devDeps
// (drizzle-kit) are pruned from the deployed image. Applies the SQL files in
// apps/api/drizzle in order, tracked in a __drizzle_migrations table.

// dist/migrate.js lives one level below the package root; drizzle/ sits beside dist.
const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle');

async function main(): Promise<void> {
  console.log(`[migrate] applying migrations from ${migrationsFolder}`);
  await migrate(getDb(), { migrationsFolder });
  console.log('[migrate] done');
}

main()
  .catch((err) => {
    console.error('[migrate] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
