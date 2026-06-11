import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { getEnv } from '../env.js';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;

let pool: pg.Pool | undefined;
let db: Db | undefined;

/**
 * Lazily created pg Pool. Nothing connects until the first query, and the
 * pool itself is only constructed (and DATABASE_URL validated) on first use —
 * so the server can boot and serve /health without a database.
 */
export function getPool(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: getEnv().databaseUrl });
  return pool;
}

export function getDb(): Db {
  db ??= drizzle(getPool(), { schema });
  return db;
}

export async function closeDb(): Promise<void> {
  if (pool !== undefined) {
    await pool.end();
    pool = undefined;
    db = undefined;
  }
}
