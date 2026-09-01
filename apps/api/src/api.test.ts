// Encryption key for the AI-settings tests. crypto.ts reads ENCRYPTION_KEY lazily,
// so this is in effect before the first encrypt/decrypt call.
process.env.ENCRYPTION_KEY ??= '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { isoWeekLabel } from '@pokekon/shared';
import { createApp } from './app.js';
import type { Db } from './db/index.js';
import * as schema from './db/schema.js';
import { backfillMetaWinRates } from './jobs/backfillMetaWinRates.js';

// ─── Test harness ─────────────────────────────────────────────────────────────
// Runs the real routes against an in-memory Postgres (PGlite) created from the
// generated Drizzle migrations — the exact SQL that production will run.
// Sessions are injected via the `x-test-user` header through the app's
// GetSessionUser seam; no Better Auth instance or DATABASE_URL is needed.

const USER_A = 'user-a';
const USER_B = 'user-b';

let app: ReturnType<typeof createApp>;
let db: Db;

async function applyMigrations(client: PGlite): Promise<void> {
  const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle');
  const journal = JSON.parse(
    readFileSync(join(migrationsDir, 'meta', '_journal.json'), 'utf8'),
  ) as {
    entries: { tag: string }[];
  };
  for (const entry of journal.entries) {
    await client.exec(readFileSync(join(migrationsDir, `${entry.tag}.sql`), 'utf8'));
  }
}

beforeAll(async () => {
  const client = new PGlite();
  await applyMigrations(client);

  db = drizzle(client, { schema }) as unknown as Db;
  await db.insert(schema.user).values([
    { id: USER_A, name: 'User A', email: 'a@example.com' },
    { id: USER_B, name: 'User B', email: 'b@example.com' },
  ]);

  app = createApp({
    db,
    getSessionUser: async (headers) => {
      const id = headers.get('x-test-user');
      return id === null ? null : { id, isAnonymous: false };
    },
  });
});

async function request(
  path: string,
  options: { user?: string; method?: string; body?: unknown } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.user !== undefined) headers['x-test-user'] = options.user;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  return app.request(path, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
}

/** Inserts a throwaway user row — needed whenever a test wants an account
 *  isolated from USER_A/USER_B (e.g. per-user one-time-use flags, where
 *  reusing a shared constant across tests would cross-contaminate state). */
async function createUser(id: string): Promise<void> {
  await db.insert(schema.user).values({ id, name: id, email: `${id}@example.com` });
}

async function createDeck(user: string, overrides: Record<string, unknown> = {}): Promise<number> {
  const res = await request('/api/decks', {
    user,
    method: 'POST',
    body: {
      archetype: 'n-zoroark',
      archetypeName: "N's Zoroark",
      variant: 'Standard',
      ...overrides,
    },
  });
  expect(res.status).toBe(201);
  const deck = (await res.json()) as { id: number };
  return deck.id;
}

const sampleCards = [
  { name: "N's Zoroark ex", count: 3, type: 'Pokemon', role: 'attacker' },
  { name: 'Ultra Ball', count: 4, type: 'Trainer', role: 'item' },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('authentication', () => {
  it('returns 401 without a session on every /api domain route', async () => {
    for (const [path, method] of [
      ['/api/decks', 'GET'],
      ['/api/decks', 'POST'],
      ['/api/decks/1/cards', 'PUT'],
      ['/api/logs', 'GET'],
      ['/api/snapshots/1', 'DELETE'],
    ] as const) {
      const res = await request(path, { method });
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });
});

describe('deck CRUD', () => {
  it('creates, lists, updates and deletes a deck for the session user', async () => {
    const deckId = await createDeck(USER_A);

    const list = await request('/api/decks', { user: USER_A });
    expect(list.status).toBe(200);
    const decks = (await list.json()) as { id: number; userId: string; archetype: string }[];
    const created = decks.find((d) => d.id === deckId);
    expect(created).toMatchObject({ archetype: 'n-zoroark', userId: USER_A });

    const patch = await request(`/api/decks/${deckId}`, {
      user: USER_A,
      method: 'PATCH',
      body: { variant: 'Fezandipiti Build' },
    });
    expect(patch.status).toBe(200);
    expect(await patch.json()).toMatchObject({ id: deckId, variant: 'Fezandipiti Build' });

    const del = await request(`/api/decks/${deckId}`, { user: USER_A, method: 'DELETE' });
    expect(del.status).toBe(204);

    const patchAfterDelete = await request(`/api/decks/${deckId}`, {
      user: USER_A,
      method: 'PATCH',
      body: { variant: 'x' },
    });
    expect(patchAfterDelete.status).toBe(404);
  });

  it('ignores a client-supplied userId — decks always belong to the session user', async () => {
    const deckId = await createDeck(USER_A, { userId: USER_B });
    const list = await request('/api/decks', { user: USER_A });
    const decks = (await list.json()) as { id: number; userId: string }[];
    expect(decks.find((d) => d.id === deckId)?.userId).toBe(USER_A);
  });

  it('rejects a deck body missing required fields with 400', async () => {
    const res = await request('/api/decks', {
      user: USER_A,
      method: 'POST',
      body: { archetype: '' },
    });
    expect(res.status).toBe(400);
  });
});

describe('user scoping', () => {
  it("returns 404 when user B touches user A's deck (read, update, delete)", async () => {
    const deckId = await createDeck(USER_A);

    const read = await request(`/api/decks/${deckId}/cards`, { user: USER_B });
    expect(read.status).toBe(404);

    const patch = await request(`/api/decks/${deckId}`, {
      user: USER_B,
      method: 'PATCH',
      body: { variant: 'stolen' },
    });
    expect(patch.status).toBe(404);

    const del = await request(`/api/decks/${deckId}`, { user: USER_B, method: 'DELETE' });
    expect(del.status).toBe(404);

    // The deck is untouched for its owner.
    const cards = await request(`/api/decks/${deckId}/cards`, { user: USER_A });
    expect(cards.status).toBe(200);
  });

  it("does not leak user A's decks into user B's list", async () => {
    const deckId = await createDeck(USER_A);
    const list = await request('/api/decks', { user: USER_B });
    const decks = (await list.json()) as { id: number }[];
    expect(decks.find((d) => d.id === deckId)).toBeUndefined();
  });
});

describe('PUT /api/decks/:id/cards', () => {
  it('replaces the full card list atomically', async () => {
    const deckId = await createDeck(USER_A);

    const first = await request(`/api/decks/${deckId}/cards`, {
      user: USER_A,
      method: 'PUT',
      body: sampleCards,
    });
    expect(first.status).toBe(200);
    expect(((await first.json()) as unknown[]).length).toBe(2);

    const replacement = [{ name: 'Rare Candy', count: 4, type: 'Trainer', role: 'item' }];
    const second = await request(`/api/decks/${deckId}/cards`, {
      user: USER_A,
      method: 'PUT',
      body: replacement,
    });
    expect(second.status).toBe(200);

    const list = await request(`/api/decks/${deckId}/cards`, { user: USER_A });
    const cards = (await list.json()) as { name: string; deckId: number; userId: string }[];
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ name: 'Rare Candy', deckId, userId: USER_A });
  });

  it('rejects an invalid card enum with 400 and keeps the previous list intact', async () => {
    const deckId = await createDeck(USER_A);
    await request(`/api/decks/${deckId}/cards`, { user: USER_A, method: 'PUT', body: sampleCards });

    const res = await request(`/api/decks/${deckId}/cards`, {
      user: USER_A,
      method: 'PUT',
      body: [{ name: 'Bad Card', count: 1, type: 'Pokemon', role: 'not-a-role' }],
    });
    expect(res.status).toBe(400);

    const list = await request(`/api/decks/${deckId}/cards`, { user: USER_A });
    expect((await list.json()) as unknown[]).toHaveLength(2);
  });

  it('accepts an empty array to clear the deck', async () => {
    const deckId = await createDeck(USER_A);
    await request(`/api/decks/${deckId}/cards`, { user: USER_A, method: 'PUT', body: sampleCards });

    const res = await request(`/api/decks/${deckId}/cards`, {
      user: USER_A,
      method: 'PUT',
      body: [],
    });
    expect(res.status).toBe(200);

    const list = await request(`/api/decks/${deckId}/cards`, { user: USER_A });
    expect((await list.json()) as unknown[]).toHaveLength(0);
  });
});

describe('snapshots', () => {
  it('creates a snapshot (computing totalCards), lists it, and deletes it', async () => {
    const deckId = await createDeck(USER_A);

    const create = await request(`/api/decks/${deckId}/snapshots`, {
      user: USER_A,
      method: 'POST',
      body: { label: 'v1 — initial list', cards: sampleCards },
    });
    expect(create.status).toBe(201);
    const snapshot = (await create.json()) as { id: number; totalCards: number };
    expect(snapshot.totalCards).toBe(7); // 3 + 4

    const list = await request(`/api/decks/${deckId}/snapshots`, { user: USER_A });
    expect(((await list.json()) as { id: number }[]).map((s) => s.id)).toContain(snapshot.id);

    // Foreign user cannot delete it.
    const foreignDelete = await request(`/api/snapshots/${snapshot.id}`, {
      user: USER_B,
      method: 'DELETE',
    });
    expect(foreignDelete.status).toBe(404);

    const del = await request(`/api/snapshots/${snapshot.id}`, { user: USER_A, method: 'DELETE' });
    expect(del.status).toBe(204);
  });
});

describe('opponent logs', () => {
  const validLog = {
    archetype: 'gardevoir',
    eventType: 'Regional',
    eventDate: '2026-06-01',
    result: 'W',
    bestOf: 'BO3',
    notes: 'close game',
  };

  it('creates, filters by deckId, patches and deletes a log', async () => {
    const deckId = await createDeck(USER_A);

    const create = await request('/api/logs', {
      user: USER_A,
      method: 'POST',
      body: { ...validLog, deckId, round: 3 },
    });
    expect(create.status).toBe(201);
    const log = (await create.json()) as { id: number; userId: string; notes: string };
    expect(log).toMatchObject({ userId: USER_A, notes: 'close game' });

    const filtered = await request(`/api/logs?deckId=${deckId}&limit=10`, { user: USER_A });
    const logs = (await filtered.json()) as { id: number }[];
    expect(logs.map((l) => l.id)).toContain(log.id);

    const otherDeckId = await createDeck(USER_A);
    const empty = await request(`/api/logs?deckId=${otherDeckId}`, { user: USER_A });
    expect((await empty.json()) as unknown[]).toHaveLength(0);

    const patch = await request(`/api/logs/${log.id}`, {
      user: USER_A,
      method: 'PATCH',
      body: { result: 'L', deckId: null },
    });
    expect(patch.status).toBe(200);
    expect(await patch.json()).toMatchObject({ id: log.id, result: 'L', deckId: null });

    const del = await request(`/api/logs/${log.id}`, { user: USER_A, method: 'DELETE' });
    expect(del.status).toBe(204);
  });

  it('rejects an invalid result enum with 400', async () => {
    const res = await request('/api/logs', {
      user: USER_A,
      method: 'POST',
      body: { ...validLog, result: 'X' },
    });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid eventType enum with 400', async () => {
    const res = await request('/api/logs', {
      user: USER_A,
      method: 'POST',
      body: { ...validLog, eventType: 'Casual' },
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when a log references another user's deck", async () => {
    const foreignDeckId = await createDeck(USER_B);
    const res = await request('/api/logs', {
      user: USER_A,
      method: 'POST',
      body: { ...validLog, deckId: foreignDeckId },
    });
    expect(res.status).toBe(404);
  });

  it("does not expose user A's logs to user B", async () => {
    const create = await request('/api/logs', { user: USER_A, method: 'POST', body: validLog });
    const log = (await create.json()) as { id: number };

    const listB = await request('/api/logs', { user: USER_B });
    const logsB = (await listB.json()) as { id: number }[];
    expect(logsB.find((l) => l.id === log.id)).toBeUndefined();

    const patchB = await request(`/api/logs/${log.id}`, {
      user: USER_B,
      method: 'PATCH',
      body: { result: 'T' },
    });
    expect(patchB.status).toBe(404);
  });
});

// Plan §3.6 / step 11: `bestOf` becomes a hard-required field on POST. NOTE for
// @implementer: making it mandatory means the pre-existing `validLog` fixture
// above (used by the "opponent logs" describe, without `bestOf`) will need the
// field added too, or those tests start failing once this lands — that is
// expected fixture upkeep for a newly-required field, not a behavior change.
describe('opponent logs: best-of format (plan §3.6)', () => {
  const validLog = {
    archetype: 'gardevoir',
    eventType: 'Regional',
    eventDate: '2026-06-01',
    result: 'W' as const,
    notes: 'close game',
  };

  it('rejects POST /api/logs without bestOf with 400', async () => {
    const deckId = await createDeck(USER_A);
    const res = await request('/api/logs', {
      user: USER_A,
      method: 'POST',
      body: { ...validLog, deckId },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { issues?: { path: (string | number)[] }[] };
    expect(body.issues?.some((i) => i.path.includes('bestOf'))).toBe(true);
  });

  it('accepts a valid bestOf on create and echoes it on read', async () => {
    const deckId = await createDeck(USER_A);
    const created = await request('/api/logs', {
      user: USER_A,
      method: 'POST',
      body: { ...validLog, deckId, bestOf: 'BO3' },
    });
    expect(created.status).toBe(201);
    const log = (await created.json()) as { id: number; bestOf: string | null };
    expect(log.bestOf).toBe('BO3');

    const listed = await request(`/api/logs?deckId=${deckId}&limit=10`, { user: USER_A });
    const logs = (await listed.json()) as { id: number; bestOf: string | null }[];
    expect(logs.find((l) => l.id === log.id)?.bestOf).toBe('BO3');
  });

  it('exposes null bestOf for legacy rows and allows patching it in afterwards', async () => {
    // A row written before the column existed — bypasses the API on purpose.
    const [legacy] = await db
      .insert(schema.opponentLogs)
      .values({
        userId: USER_A,
        archetype: 'gardevoir',
        eventType: 'Regional',
        eventDate: '2026-05-01',
        result: 'W',
      })
      .returning({ id: schema.opponentLogs.id });

    const before = await request('/api/logs?limit=200', { user: USER_A });
    const beforeLogs = (await before.json()) as { id: number; bestOf: string | null }[];
    expect(beforeLogs.find((l) => l.id === legacy!.id)?.bestOf).toBeNull();

    const patched = await request(`/api/logs/${legacy!.id}`, {
      user: USER_A,
      method: 'PATCH',
      body: { bestOf: 'BO1' },
    });
    expect(patched.status).toBe(200);
    expect((await patched.json()) as { bestOf: string | null }).toMatchObject({ bestOf: 'BO1' });
  });

  it('rejects an explicit bestOf: null on the regular create endpoint (still hard-required)', async () => {
    const res = await request('/api/logs', {
      user: USER_A,
      method: 'POST',
      body: { ...validLog, bestOf: null },
    });
    expect(res.status).toBe(400);
  });

  // Migration-only path (coordinator decision, addendum to plan §3.6): legacy
  // Dexie logs genuinely have no bestOf and must import as "format unknown"
  // (null), not a guessed default — guessing would undermine the "no
  // inferring from eventType" rule the hard-required POST is built on. Since
  // POST /api/logs itself must stay hard-required for the interactive
  // AddLogModal flow, the one-time migration writes through a dedicated,
  // batched (one request for the whole export) import endpoint instead.
  //
  // Security-review addendum: this endpoint is the ONLY place a client may
  // write bestOf: null, so it must be genuinely single-use per account —
  // otherwise it would be a permanently open second path around the
  // hard-required guarantee (accidental re-calls, a stale bundle, or a
  // scripted client could otherwise create unlimited "format unknown" logs).
  // `legacy_import_state` (one row per account once used) enforces that: a
  // second attempt is rejected with 409 regardless of its body.
  describe('POST /api/logs/import (legacy Dexie migration only, one-time per account)', () => {
    it('accepts a batch with an explicit bestOf: null and stores it as "format unknown"', async () => {
      await createUser('user-import-null');
      const created = await request('/api/logs/import', {
        user: 'user-import-null',
        method: 'POST',
        body: [{ ...validLog, bestOf: null }],
      });
      expect(created.status).toBe(201);
      const logs = (await created.json()) as { id: number; bestOf: string | null }[];
      expect(logs).toHaveLength(1);
      expect(logs[0]?.bestOf).toBeNull();

      const listed = await request('/api/logs?limit=200', { user: 'user-import-null' });
      const listedLogs = (await listed.json()) as { id: number; bestOf: string | null }[];
      expect(listedLogs.find((l) => l.id === logs[0]?.id)?.bestOf).toBeNull();
    });

    it('accepts a mix of null and known bestOf values in one batch', async () => {
      await createUser('user-import-mixed');
      const created = await request('/api/logs/import', {
        user: 'user-import-mixed',
        method: 'POST',
        body: [
          { ...validLog, bestOf: null },
          { ...validLog, bestOf: 'BO1' },
        ],
      });
      expect(created.status).toBe(201);
      const logs = (await created.json()) as { id: number; bestOf: string | null }[];
      expect(logs.map((l) => l.bestOf).sort()).toEqual(['BO1', null].sort());
    });

    it('rejects a missing bestOf key on any entry (must be explicit null or a value)', async () => {
      await createUser('user-import-missing-bestof');
      const res = await request('/api/logs/import', {
        user: 'user-import-missing-bestof',
        method: 'POST',
        body: [{ ...validLog }],
      });
      expect(res.status).toBe(400);
    });

    it('rejects an empty batch', async () => {
      await createUser('user-import-empty');
      const res = await request('/api/logs/import', {
        user: 'user-import-empty',
        method: 'POST',
        body: [],
      });
      expect(res.status).toBe(400);
    });

    it('rejects a second import attempt for the same account with 409, without touching the first', async () => {
      await createUser('user-import-once');
      const first = await request('/api/logs/import', {
        user: 'user-import-once',
        method: 'POST',
        body: [{ ...validLog, bestOf: null }],
      });
      expect(first.status).toBe(201);
      const firstLogs = (await first.json()) as { id: number; bestOf: string | null }[];

      // Second attempt: different content, still rejected outright — this is
      // an account-level flag, not a content/idempotency check.
      const second = await request('/api/logs/import', {
        user: 'user-import-once',
        method: 'POST',
        body: [{ ...validLog, archetype: 'lugia', bestOf: 'BO3' }],
      });
      expect(second.status).toBe(409);

      // The first import's data is untouched — no new rows, no mutation.
      const listed = await request('/api/logs?limit=200', { user: 'user-import-once' });
      const logs = (await listed.json()) as { id: number; archetype: string }[];
      expect(logs).toHaveLength(1);
      expect(logs[0]?.id).toBe(firstLogs[0]?.id);
      expect(logs[0]?.archetype).toBe('gardevoir');
    });

    // The sequential test above (await first, then second) does not exercise
    // the actual race: a SELECT-then-insert-the-flag-at-the-end implementation
    // lets N concurrent requests all pass the pre-check before any of them
    // commits the flag, so every one of them writes its full batch before only
    // the LAST claim trips the unique constraint — a client can trigger this
    // deliberately. Only a real once-per-account CLAIM before any log insert
    // (atomically, in one transaction) closes that.
    it('rejects a genuinely concurrent second import attempt, with only one batch ever landing', async () => {
      await createUser('user-import-concurrent');

      const [resA, resB] = await Promise.all([
        request('/api/logs/import', {
          user: 'user-import-concurrent',
          method: 'POST',
          body: [{ ...validLog, archetype: 'concurrent-batch-a', bestOf: null }],
        }),
        request('/api/logs/import', {
          user: 'user-import-concurrent',
          method: 'POST',
          body: [{ ...validLog, archetype: 'concurrent-batch-b', bestOf: 'BO1' }],
        }),
      ]);

      // Exactly one request wins the claim (201), the other is rejected (409)
      // — never both succeeding, never both being rejected.
      expect([resA.status, resB.status].sort()).toEqual([201, 409]);

      const listed = await request('/api/logs?limit=200', { user: 'user-import-concurrent' });
      const logs = (await listed.json()) as { archetype: string }[];
      // Exactly one of the two batches is actually in the database — the
      // losing request must not have written anything at all.
      expect(logs).toHaveLength(1);
      expect(['concurrent-batch-a', 'concurrent-batch-b']).toContain(logs[0]?.archetype);
    });
  });
});

const SAMPLE_BATTLE_LOG = `Vorbereitung
Konrad hat den Münzwurf gewonnen.
Konrad hat für die Starthand 7 Karten gezogen.
GegnerX hat für die Starthand 7 Karten gezogen.

Zug von Konrad
Konrad hat Nest Ball gespielt.
Konrad hat Iono gespielt.
Konrad hat Psycho-Energie an Dreepy angelegt.

Zug von GegnerX
GegnerX hat Pokégear 3.0 gespielt.
Glurak-ex von GegnerX hat Brandwunde für 90 Schadenspunkte eingesetzt.

Zug von Konrad
Dragapult-ex von Konrad hat Phantombrise für 200 Schadenspunkte eingesetzt.
Glurak-ex von GegnerX wurde kampfunfähig gemacht!
Konrad hat 2 Preiskarten aufgenommen.

Konrad hat gewonnen!`;

describe('battle-log parse-on-write pipeline', () => {
  const baseLog = {
    archetype: 'charizard',
    eventType: 'Online',
    eventDate: '2026-06-10',
    result: 'W',
    bestOf: 'BO1',
    notes: '',
  };

  async function parsedRowFor(opponentLogId: number) {
    const rows = await db
      .select()
      .from(schema.matchLogParsed)
      .where(eq(schema.matchLogParsed.opponentLogId, opponentLogId));
    return rows[0];
  }

  it('parses and persists a match_log_parsed row when a log is created with a battle log', async () => {
    const create = await request('/api/logs', {
      user: USER_A,
      method: 'POST',
      body: { ...baseLog, battleLog: SAMPLE_BATTLE_LOG, playerName: 'Konrad' },
    });
    expect(create.status).toBe(201);
    const log = (await create.json()) as { id: number };

    const parsed = await parsedRowFor(log.id);
    expect(parsed).toBeDefined();
    expect(parsed).toMatchObject({
      userId: USER_A,
      totalTurns: 3,
      wentFirst: true,
      parserVersion: 2,
      setupCleanByTurn2: true,
      deadTurns: 0,
    });
    expect(Array.isArray(parsed?.turns)).toBe(true);
    expect(parsed?.turns).toHaveLength(3);
  });

  it('does not create a parsed row when no battle log is supplied', async () => {
    const create = await request('/api/logs', { user: USER_A, method: 'POST', body: baseLog });
    const log = (await create.json()) as { id: number };
    expect(await parsedRowFor(log.id)).toBeUndefined();
  });

  it('clears the parsed row when the battle log is removed, and re-parses when re-added', async () => {
    const create = await request('/api/logs', {
      user: USER_A,
      method: 'POST',
      body: { ...baseLog, battleLog: SAMPLE_BATTLE_LOG, playerName: 'Konrad' },
    });
    const log = (await create.json()) as { id: number };
    expect(await parsedRowFor(log.id)).toBeDefined();

    const clear = await request(`/api/logs/${log.id}`, {
      user: USER_A,
      method: 'PATCH',
      body: { battleLog: '' },
    });
    expect(clear.status).toBe(200);
    expect(await parsedRowFor(log.id)).toBeUndefined();

    const readd = await request(`/api/logs/${log.id}`, {
      user: USER_A,
      method: 'PATCH',
      body: { battleLog: SAMPLE_BATTLE_LOG, playerName: 'Konrad' },
    });
    expect(readd.status).toBe(200);
    expect(await parsedRowFor(log.id)).toBeDefined();
  });

  it('cascade-deletes the parsed row when the log is deleted', async () => {
    const create = await request('/api/logs', {
      user: USER_A,
      method: 'POST',
      body: { ...baseLog, battleLog: SAMPLE_BATTLE_LOG, playerName: 'Konrad' },
    });
    const log = (await create.json()) as { id: number };
    expect(await parsedRowFor(log.id)).toBeDefined();

    const del = await request(`/api/logs/${log.id}`, { user: USER_A, method: 'DELETE' });
    expect(del.status).toBe(204);
    expect(await parsedRowFor(log.id)).toBeUndefined();
  });
});

// A second log where the opponent takes the first turn → player1 (Konrad) went second.
const SECOND_TURN_LOG = `Vorbereitung
GegnerX hat den Münzwurf gewonnen.
Konrad hat für die Starthand 7 Karten gezogen.
GegnerX hat für die Starthand 7 Karten gezogen.

Zug von GegnerX
GegnerX hat Iono gespielt.
GegnerX hat Feuer-Energie an Glumanda angelegt.

Zug von Konrad
Konrad hat Nest Ball gespielt.

GegnerX hat gewonnen!`;

describe('GET /api/analytics/deck/:id', () => {
  const today = new Date().toISOString().slice(0, 10);

  type Analytics = {
    deckId: number;
    weeks: number;
    record: { games: number; wins: number; losses: number; winRatePct: number | null };
    goingFirst: { games: number; wins: number; winRatePct: number | null };
    goingSecond: { games: number; wins: number; winRatePct: number | null };
    setup: { parsedGames: number; cleanRatePct: number | null };
    deadTurns: { parsedGames: number; avgPerGame: number | null };
    prizeCurveWins: { turn: number; avgPrizesRemaining: number; games: number }[];
  };

  async function seedDeckWithLogs(): Promise<number> {
    const deckId = await createDeck(USER_A);
    const base = { archetype: 'charizard', eventType: 'Online', bestOf: 'BO1', notes: '' };
    // In-window: a went-first win, a went-second loss, and an unparsed win.
    await request('/api/logs', {
      user: USER_A,
      method: 'POST',
      body: {
        ...base,
        deckId,
        eventDate: today,
        result: 'W',
        battleLog: SAMPLE_BATTLE_LOG,
        playerName: 'Konrad',
      },
    });
    await request('/api/logs', {
      user: USER_A,
      method: 'POST',
      body: {
        ...base,
        deckId,
        eventDate: today,
        result: 'L',
        battleLog: SECOND_TURN_LOG,
        playerName: 'Konrad',
      },
    });
    await request('/api/logs', {
      user: USER_A,
      method: 'POST',
      body: { ...base, deckId, eventDate: today, result: 'W' },
    });
    // Out of the 4-week window: must be excluded.
    await request('/api/logs', {
      user: USER_A,
      method: 'POST',
      body: {
        ...base,
        deckId,
        eventDate: '2020-01-01',
        result: 'L',
        battleLog: SAMPLE_BATTLE_LOG,
        playerName: 'Konrad',
      },
    });
    return deckId;
  }

  it('aggregates record and going-first/second win rates within the window', async () => {
    const deckId = await seedDeckWithLogs();

    const res = await request(`/api/analytics/deck/${deckId}?weeks=4`, { user: USER_A });
    expect(res.status).toBe(200);
    const a = (await res.json()) as Analytics;

    // 3 in-window logs (the 2020 one is excluded).
    expect(a.record.games).toBe(3);
    expect(a.record.wins).toBe(2);
    expect(a.record.losses).toBe(1);
    expect(a.record.winRatePct).toBe(66.7);

    // Turn-quality metrics only cover the 2 parsed in-window games.
    expect(a.goingFirst).toMatchObject({ games: 1, wins: 1, winRatePct: 100 });
    expect(a.goingSecond).toMatchObject({ games: 1, wins: 0, winRatePct: 0 });
    expect(a.setup.parsedGames).toBe(2);
    expect(a.deadTurns.parsedGames).toBe(2);
    // The won, parsed game contributes a prize curve.
    expect(a.prizeCurveWins.length).toBeGreaterThan(0);
  });

  it('excludes older games when the window is narrowed', async () => {
    const deckId = await seedDeckWithLogs();
    const res = await request(`/api/analytics/deck/${deckId}?weeks=1`, { user: USER_A });
    const a = (await res.json()) as Analytics;
    expect(a.weeks).toBe(1);
    expect(a.record.games).toBe(3); // all in-window logs are "today"
  });

  it('rejects a weeks value outside 1–4 with 400', async () => {
    const deckId = await createDeck(USER_A);
    const res = await request(`/api/analytics/deck/${deckId}?weeks=9`, { user: USER_A });
    expect(res.status).toBe(400);
  });

  it("returns 404 for another user's deck", async () => {
    const deckId = await createDeck(USER_A);
    const res = await request(`/api/analytics/deck/${deckId}`, { user: USER_B });
    expect(res.status).toBe(404);
  });
});

describe('AI analysis (/api/analysis)', () => {
  // A model response with one grounded item (evidence in the log) and one fabricated
  // item (evidence absent) — the fabricated one must be filtered out server-side.
  const ANALYSIS_LOG = `Zug von Konrad
Konrad hat Iono gespielt.
Konrad hat gewonnen!`;

  function modelResponse(): Response {
    const content = JSON.stringify({
      playerName: 'Konrad',
      opponentName: 'GegnerX',
      summary: 'Konrad won.',
      keyMoments: [
        {
          turn: 1,
          observation: 'Played Iono',
          evidence: 'Konrad hat Iono gespielt.',
          impact: 'high',
        },
        {
          turn: 2,
          observation: 'Hallucinated',
          evidence: 'This line does not exist',
          impact: 'low',
        },
      ],
      playMistakes: [],
      cardNotes: [],
      deckSuggestions: [],
      analyzedAt: '2026-06-17T00:00:00.000Z',
    });
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  afterEach(() => vi.unstubAllGlobals());

  it('stores a key (encrypted) and reports hasApiKey without ever returning the key', async () => {
    const put = await request('/api/analysis/settings', {
      user: USER_A,
      method: 'PUT',
      body: { provider: 'github-models', apiKey: 'ghp_secret_token', model: 'openai/gpt-4.1' },
    });
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({
      provider: 'github-models',
      model: 'openai/gpt-4.1',
      hasApiKey: true,
    });

    const get = await request('/api/analysis/settings', { user: USER_A });
    const body = (await get.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ provider: 'github-models', hasApiKey: true });
    expect(JSON.stringify(body)).not.toContain('ghp_secret_token');

    // The key is encrypted at rest (not stored as plaintext).
    const [row] = await db
      .select()
      .from(schema.userAiSettings)
      .where(eq(schema.userAiSettings.userId, USER_A));
    expect(row?.encryptedApiKey).toMatch(/^v1:/);
    expect(row?.encryptedApiKey).not.toContain('ghp_secret_token');
  });

  it('analyzes a log via the configured provider and drops ungrounded items', async () => {
    await request('/api/analysis/settings', {
      user: USER_A,
      method: 'PUT',
      body: { apiKey: 'ghp_secret_token' },
    });

    const fetchMock = vi.fn().mockResolvedValue(modelResponse());
    vi.stubGlobal('fetch', fetchMock);

    const res = await request('/api/analysis/log', {
      user: USER_A,
      method: 'POST',
      body: { battleLog: ANALYSIS_LOG, playerName: 'Konrad' },
    });
    expect(res.status).toBe(200);
    const analysis = (await res.json()) as {
      playerName: string;
      keyMoments: { observation: string }[];
    };
    expect(analysis.playerName).toBe('Konrad');
    // Fabricated key moment filtered; only the grounded one survives.
    expect(analysis.keyMoments).toHaveLength(1);
    expect(analysis.keyMoments[0]?.observation).toBe('Played Iono');

    // Called the GitHub Models endpoint with the decrypted key as a Bearer token.
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://models.github.ai/inference/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer ghp_secret_token');
  });

  it('returns 400 when the user has no API key configured', async () => {
    const res = await request('/api/analysis/log', {
      user: USER_B,
      method: 'POST',
      body: { battleLog: ANALYSIS_LOG, playerName: 'Konrad' },
    });
    expect(res.status).toBe(400);
  });

  it('clears the stored key when an empty apiKey is sent', async () => {
    await request('/api/analysis/settings', {
      user: USER_A,
      method: 'PUT',
      body: { apiKey: 'ghp_secret_token' },
    });
    const cleared = await request('/api/analysis/settings', {
      user: USER_A,
      method: 'PUT',
      body: { apiKey: '' },
    });
    expect(await cleared.json()).toMatchObject({ hasApiKey: false });
  });
});

describe('meta (/api/meta)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns only in-season (post-rotation) snapshots', async () => {
    await db.insert(schema.metaSnapshots).values([
      {
        archetype: 'Charizard',
        frequencyPct: 20,
        winRatePct: 55,
        wins: 11,
        losses: 9,
        playerCount: 10,
        period: '2026-W20',
        sourceNote: 'test',
      },
      {
        archetype: 'OldDeck',
        frequencyPct: 30,
        winRatePct: 60,
        wins: 6,
        losses: 4,
        playerCount: 8,
        period: '2026-W05', // pre-rotation → excluded
        sourceNote: 'test',
      },
    ]);

    const res = await request('/api/meta', { user: USER_A });
    expect(res.status).toBe(200);
    const rows = (await res.json()) as { archetype: string; period: string }[];
    expect(rows.some((r) => r.archetype === 'Charizard')).toBe(true);
    expect(rows.some((r) => r.archetype === 'OldDeck')).toBe(false);
  });

  it('syncs meta from Limitless (mocked) and upserts snapshots', async () => {
    const today = new Date().toISOString();
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/api/tournaments/T1/standings')) {
        return jsonResponse([
          { deck: { id: 'char', name: 'Charizard' }, record: { wins: 6, losses: 1, ties: 0 } },
          { deck: { id: 'char', name: 'Charizard' }, record: { wins: 4, losses: 3, ties: 0 } },
          { deck: { id: 'gard', name: 'Gardevoir' }, record: { wins: 5, losses: 2, ties: 0 } },
          { deck: { id: 'gard', name: 'Gardevoir' }, record: { wins: 3, losses: 4, ties: 0 } },
        ]);
      }
      if (url.includes('/api/tournaments/T1/details')) {
        return jsonResponse({
          isOnline: true,
          platform: 'PTCGL',
          phases: [{ type: 'SWISS', mode: 'BO1' }],
        });
      }
      // tournament list
      return jsonResponse([{ id: 'T1', name: 'Online Weekly', players: 64, date: today }]);
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request('/api/meta/sync', { user: USER_A, method: 'POST' });
    expect(res.status).toBe(200);
    const summary = (await res.json()) as { archetypes: number; tournaments: number };
    expect(summary.tournaments).toBe(1);
    expect(summary.archetypes).toBe(2);

    // The snapshots are now readable via GET (current ISO week is in-season).
    const get = await request('/api/meta', { user: USER_A });
    const rows = (await get.json()) as { archetype: string }[];
    expect(rows.some((r) => r.archetype === 'Charizard')).toBe(true);
    expect(rows.some((r) => r.archetype === 'Gardevoir')).toBe(true);
  });

  it('propagates ties through the sync and reports the tie-weighted win rate', async () => {
    const today = new Date().toISOString();
    // Deliberate test fix (not a silent tweak, see tdd.md): the sibling test
    // above ("syncs meta from Limitless") already persists a `char`/Charizard
    // tournament dated "today", and `recomputeCurrentPeriodSnapshots` folds
    // ALL persisted standings for the current ISO week into one snapshot per
    // archetype by design — so reusing `char`/Charizard here would silently
    // combine with that sibling's 10W/4L/0T into 16W/8L/2T (winRatePct 64,
    // not the isolated AC value 56) and this test would assert against the
    // wrong number. A distinct archetype id/name sidesteps the collision
    // without touching the (intentional) full-period-recompute behavior.
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/api/tournaments/T-ties/standings')) {
        return jsonResponse([
          {
            deck: { id: 'char-ties', name: 'Charizard Ties' },
            record: { wins: 3, losses: 2, ties: 1 },
          },
          {
            deck: { id: 'char-ties', name: 'Charizard Ties' },
            record: { wins: 3, losses: 2, ties: 1 },
          },
        ]);
      }
      if (url.includes('/api/tournaments/T-ties/details')) {
        return jsonResponse({
          isOnline: true,
          platform: 'PTCGL',
          phases: [{ type: 'SWISS', mode: 'BO1' }],
        });
      }
      return jsonResponse([{ id: 'T-ties', name: 'Ties Weekly', players: 40, date: today }]);
    });
    vi.stubGlobal('fetch', fetchMock);

    // A dedicated user so this sync cannot bleed into (or be limited by) the
    // per-user sync rate limit used by the other sync tests.
    const sync = await request('/api/meta/sync', { user: 'user-ties-sync', method: 'POST' });
    expect(sync.status).toBe(200);

    const get = await request('/api/meta', { user: 'user-ties-sync' });
    const rows = (await get.json()) as {
      archetype: string;
      ties?: number;
      winRatePct: number | null;
    }[];
    const char = rows.find((r) => r.archetype === 'Charizard Ties');
    // 6W/4L/2T → (6 + 2/3) / 12 ≈ 55.6 % → rounds to 56, not the old
    // ties-excluded 60 (6/10).
    expect(char?.ties).toBe(2);
    expect(char?.winRatePct).toBe(56);
  });
});

describe('tournament drilldown (field-analysis, archetype lists, matchups)', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Clear the global (non-user-scoped) tournament reference tables. */
  async function clearTournamentData(): Promise<void> {
    await db.delete(schema.tournaments); // standings cascade
    await db.delete(schema.matchupMatrix);
    await db.delete(schema.metaSnapshots);
  }

  function daysAgo(days: number): Date {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - days);
    return d;
  }

  const sampleDecklist = {
    pokemon: [{ name: "N's Zoroark ex", count: 3 }],
    trainer: [{ name: 'Ultra Ball', count: 4 }],
    energy: [{ name: 'Basic Darkness Energy', count: 8 }],
  };

  async function seedTournament(
    id: string,
    date: Date,
    players: number,
    standings: (typeof schema.tournamentStandings.$inferInsert)[],
    scope: { isOnline?: boolean; swissMode?: 'BO1' | 'BO3' | 'OTHER' | null } = {},
  ): Promise<void> {
    // Seed as an online Bo1 event by default — that is what the meta reads
    // filter to; pass `scope` to seed an in-person / Bo3 event for filter tests.
    await db.insert(schema.tournaments).values({
      id,
      name: `Event ${id}`,
      date,
      players,
      isOnline: scope.isOnline ?? true,
      swissMode: scope.swissMode ?? 'BO1',
    });
    await db
      .insert(schema.tournamentStandings)
      .values(standings.map((s) => ({ ...s, tournamentId: id })));
  }

  const standing = (
    archetypeId: string,
    over: Partial<typeof schema.tournamentStandings.$inferInsert> = {},
  ): typeof schema.tournamentStandings.$inferInsert => ({
    tournamentId: '',
    archetypeId,
    archetypeName: archetypeId.toUpperCase(),
    wins: 3,
    losses: 2,
    ties: 0,
    ...over,
  });

  async function seedMatchups(rows: { deck1: string; deck2: string; winRate: number }[]) {
    const importedAt = new Date();
    await db
      .insert(schema.matchupMatrix)
      .values(rows.map((r) => ({ ...r, wins: 0, losses: 0, ties: 0, total: 50, importedAt })));
  }

  it('persists tournaments, standings and pruned decklists during sync', async () => {
    await clearTournamentData();
    const today = new Date().toISOString();
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/api/tournaments/T9/standings')) {
        return jsonResponse([
          {
            name: 'Alice',
            placing: 1,
            deck: { id: 'char', name: 'Charizard' },
            record: { wins: 6, losses: 1, ties: 0 },
            decklist: {
              pokemon: [{ name: 'Charizard ex', count: 3, junk: 'dropped' }],
              trainer: [{ name: 'Rare Candy', count: 4 }],
              energy: [{ name: 'Fire Energy', count: 10 }],
              extraField: 'dropped',
            },
          },
          {
            name: 'Bob',
            placing: 2,
            deck: { id: 'char', name: 'Charizard' },
            record: { wins: 5, losses: 2, ties: 0 },
            // no decklist submitted
          },
        ]);
      }
      if (url.includes('/api/tournaments/T9/details')) {
        return jsonResponse({
          isOnline: true,
          platform: 'PTCGL',
          phases: [{ type: 'SWISS', mode: 'BO1' }],
        });
      }
      return jsonResponse([{ id: 'T9', name: 'Weekly Online', players: 40, date: today }]);
    });
    vi.stubGlobal('fetch', fetchMock);

    const sync = await request('/api/meta/sync', { user: USER_A, method: 'POST' });
    expect(sync.status).toBe(200);

    // Snapshots now carry the slug (join key for the drilldown).
    const meta = await request('/api/meta', { user: USER_A });
    const rows = (await meta.json()) as { archetype: string; archetypeId: string | null }[];
    expect(rows.find((r) => r.archetype === 'Charizard')?.archetypeId).toBe('char');

    // Only the standing WITH a decklist is served, unknown fields are pruned.
    const lists = await request('/api/meta/archetypes/char/lists', { user: USER_A });
    expect(lists.status).toBe(200);
    const body = (await lists.json()) as {
      total: number;
      lists: {
        playerName: string;
        placing: number;
        decklist: { pokemon: { name: string; count: number }[] };
        tournament: { id: string; players: number };
      }[];
    };
    expect(body.total).toBe(1);
    expect(body.lists[0]).toMatchObject({
      playerName: 'Alice',
      placing: 1,
      tournament: { id: 'T9', players: 40 },
    });
    expect(body.lists[0]?.decklist.pokemon[0]).toEqual({ name: 'Charizard ex', count: 3 });
  });

  // makeFetch for the delta tests: standings + details + pairings for T9, list otherwise.
  const makeT9Fetch = (deckId: string, opts: { pairingsOk?: boolean } = {}) => {
    const today = new Date().toISOString();
    return vi.fn(async (url: string) => {
      if (url.includes('/api/tournaments/T9/standings')) {
        return jsonResponse([
          {
            placing: 1,
            player: 'alice',
            deck: { id: deckId, name: deckId.toUpperCase() },
            record: { wins: 6, losses: 1, ties: 0 },
          },
          {
            placing: 2,
            player: 'bob',
            deck: { id: deckId, name: deckId.toUpperCase() },
            record: { wins: 5, losses: 2, ties: 0 },
          },
        ]);
      }
      if (url.includes('/api/tournaments/T9/details')) {
        return jsonResponse({
          isOnline: true,
          platform: 'PTCGL',
          phases: [{ type: 'SWISS', mode: 'BO1' }],
        });
      }
      if (url.includes('/api/tournaments/T9/pairings')) {
        return opts.pairingsOk === false
          ? jsonResponse(null, 500)
          : jsonResponse([{ round: 1, player1: 'alice', player2: 'bob', winner: 'alice' }]);
      }
      return jsonResponse([{ id: 'T9', name: 'Weekly Online', players: 40, date: today }]);
    });
  };

  it('delta import skips a fully-imported tournament, keeping data (and never duplicating)', async () => {
    await clearTournamentData();
    vi.stubGlobal('fetch', makeT9Fetch('first-deck'));
    expect((await request('/api/meta/sync', { user: USER_A, method: 'POST' })).status).toBe(200);

    // Second sync serves DIFFERENT data, but the completed event is already fully
    // imported → the delta import skips it: the old standings are kept (immutable
    // event, re-fetching would just waste calls) and rows are never duplicated.
    vi.stubGlobal('fetch', makeT9Fetch('second-deck'));
    expect((await request('/api/meta/sync', { user: USER_A, method: 'POST' })).status).toBe(200);

    const rows = await db
      .select({ archetypeId: schema.tournamentStandings.archetypeId })
      .from(schema.tournamentStandings);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.archetypeId === 'first-deck')).toBe(true);
  });

  it('delta import retries a tournament whose pairings failed on a later sync', async () => {
    await clearTournamentData();
    // First sync: pairings fetch fails → standings persist but pairings_synced_at
    // stays null, so the event is NOT considered fully imported. (Sync writes
    // global data; the requesting user only matters for rate limiting, so these
    // two tests use USER_B to stay under the sync rate limit.)
    vi.stubGlobal('fetch', makeT9Fetch('first-deck', { pairingsOk: false }));
    expect((await request('/api/meta/sync', { user: USER_B, method: 'POST' })).status).toBe(200);

    // Second sync: because it was incomplete, it is retried and its standings are
    // replaced with the fresh data (and pairings now succeed).
    vi.stubGlobal('fetch', makeT9Fetch('second-deck', { pairingsOk: true }));
    expect((await request('/api/meta/sync', { user: USER_B, method: 'POST' })).status).toBe(200);

    const rows = await db
      .select({ archetypeId: schema.tournamentStandings.archetypeId })
      .from(schema.tournamentStandings);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.archetypeId === 'second-deck')).toBe(true);
  });

  it('remembers non-qualifying events so coverage grows without re-probing them', async () => {
    await clearTournamentData();
    // A reject classified on a PRIOR run: header only, no standings. It must never
    // be probed again — that is what frees each run's budget to reach older events.
    await db.insert(schema.tournaments).values({
      id: 'told-reject',
      name: 'Old Reject',
      date: daysAgo(3),
      players: 40,
      isOnline: false,
      swissMode: 'BO3',
    });

    const detailsCalls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/tournaments/tqual/details')) {
          detailsCalls.push('tqual');
          return jsonResponse({ isOnline: true, platform: 'PTCGL', phases: [{ mode: 'BO1' }] });
        }
        if (url.includes('/tournaments/tqual/standings'))
          return jsonResponse([
            {
              placing: 1,
              player: 'alice',
              deck: { id: 'char', name: 'Charizard' },
              record: { wins: 6, losses: 1 },
            },
            {
              placing: 2,
              player: 'bob',
              deck: { id: 'char', name: 'Charizard' },
              record: { wins: 5, losses: 2 },
            },
          ]);
        if (url.includes('/tournaments/tqual/pairings'))
          return jsonResponse([{ round: 1, player1: 'alice', player2: 'bob', winner: 'alice' }]);
        if (url.includes('/tournaments/treject/details')) {
          detailsCalls.push('treject');
          return jsonResponse({ isOnline: false, platform: null, phases: [{ mode: 'BO3' }] });
        }
        // A probe that keeps failing (Limitless 429/5xx) must NOT be recorded as a
        // verdict — it stays "unknown" and is retried on a later run, never buried.
        if (url.includes('/tournaments/tfail/details')) {
          detailsCalls.push('tfail');
          return jsonResponse(null, 500);
        }
        // Already-classified reject: probing it is the bug this test guards against.
        if (url.includes('/tournaments/told-reject/details')) detailsCalls.push('told-reject');
        return jsonResponse([
          { id: 'tqual', name: 'Weekly Online', players: 40, date: daysAgo(1).toISOString() },
          { id: 'tfail', name: 'Flaky Online', players: 40, date: daysAgo(1).toISOString() },
          { id: 'treject', name: 'Regional IRL', players: 40, date: daysAgo(2).toISOString() },
          { id: 'told-reject', name: 'Old Reject', players: 40, date: daysAgo(3).toISOString() },
        ]);
      }),
    );

    expect((await request('/api/meta/sync', { user: USER_B, method: 'POST' })).status).toBe(200);

    // The three NEW events were probed; the already-classified reject never was.
    expect(new Set(detailsCalls)).toEqual(new Set(['tqual', 'tfail', 'treject']));
    expect(detailsCalls).not.toContain('told-reject');

    const standings = await db
      .select({ tournamentId: schema.tournamentStandings.tournamentId })
      .from(schema.tournamentStandings);
    // Qualifying event ingested (2 standings); no reject / failed probe contributed.
    expect(standings.filter((s) => s.tournamentId === 'tqual')).toHaveLength(2);
    expect(standings.filter((s) => s.tournamentId === 'treject')).toHaveLength(0);

    const all = await db.select().from(schema.tournaments);
    // The NEW reject is REMEMBERED (header persisted with its verdict) so the next
    // run skips it too — a classification-only row, not meta data.
    const treject = all.find((t) => t.id === 'treject');
    expect(treject?.isOnline).toBe(false);
    expect(treject?.swissMode).toBe('BO3');
    expect(treject?.pairingsSyncedAt).toBeNull();
    // The failed probe is NOT recorded — a transient error must never bury an event
    // as a permanent reject; it simply gets retried next run.
    expect(all.find((t) => t.id === 'tfail')).toBeUndefined();
  });

  it('surfaces a Limitless rate-limit as a 429 with a calm message, not a 502', async () => {
    await clearTournamentData();
    // Every Limitless call 429s; after the client's retries the list fetch throws.
    // A fresh user id keeps this off the per-user sync rate-limit budget.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'rate limited' }, 429)),
    );
    const res = await request('/api/meta/sync', { user: 'user-c-ratelimit', method: 'POST' });
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/rate-limited|try again/i);
    // The raw upstream URL must not leak into the user-facing message.
    expect(body.error).not.toContain('Limitless /api');
  });

  it('computes and stores the own matchup matrix from round pairings', async () => {
    await clearTournamentData();
    const today = new Date().toISOString();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/tournaments/T9/standings')) {
          // 2 pilots per archetype so both clear the min-2 snapshot filter.
          return jsonResponse([
            {
              placing: 1,
              player: 'alice',
              deck: { id: 'dragapult-ex', name: 'Dragapult ex', icons: ['dragapult', 'dusknoir'] },
              record: { wins: 6, losses: 1, ties: 0 },
            },
            {
              placing: 2,
              player: 'carol',
              deck: { id: 'dragapult-ex', name: 'Dragapult ex', icons: ['dragapult', 'dusknoir'] },
              record: { wins: 5, losses: 2, ties: 0 },
            },
            {
              placing: 3,
              player: 'bob',
              deck: { id: 'n-zoroark', name: "N's Zoroark ex" },
              record: { wins: 5, losses: 2, ties: 0 },
            },
            {
              placing: 4,
              player: 'dave',
              deck: { id: 'n-zoroark', name: "N's Zoroark ex" },
              record: { wins: 4, losses: 3, ties: 0 },
            },
          ]);
        }
        if (url.includes('/api/tournaments/T9/details')) {
          return jsonResponse({
            isOnline: true,
            platform: 'PTCGL',
            phases: [{ type: 'SWISS', mode: 'BO1' }],
          });
        }
        if (url.includes('/api/tournaments/T9/pairings')) {
          // alice (dragapult-ex) beats bob (n-zoroark).
          return jsonResponse([{ round: 1, player1: 'alice', player2: 'bob', winner: 'alice' }]);
        }
        return jsonResponse([{ id: 'T9', name: 'Weekly Online', players: 40, date: today }]);
      }),
    );
    // USER_B here to keep USER_A under the per-user sync rate limit (sync is global).
    expect((await request('/api/meta/sync', { user: USER_B, method: 'POST' })).status).toBe(200);

    // A real head-to-head, canonicalised (dragapult-ex < n-zoroark), alice's win in aWins.
    const matchups = await db.select().from(schema.tournamentMatchups);
    expect(matchups).toHaveLength(1);
    expect(matchups[0]).toMatchObject({
      deckA: 'dragapult-ex',
      deckB: 'n-zoroark',
      aWins: 1,
      bWins: 0,
      ties: 0,
    });

    // Data-driven icons flowed through from Limitless deck.icons into the snapshot.
    const meta = (await (await request('/api/meta', { user: USER_A })).json()) as {
      archetype: string;
      icons: string[] | null;
    }[];
    expect(meta.find((r) => r.archetype === 'Dragapult ex')?.icons).toEqual([
      'dragapult',
      'dusknoir',
    ]);
  });

  it('orders lists by relative placing, respects the window, and paginates', async () => {
    await clearTournamentData();
    // Placing 2 of 64 (3.1 %) beats placing 1 of 8 (12.5 %).
    await seedTournament('big', daysAgo(2), 64, [
      standing('zoro', { placing: 2, playerName: 'Big2', decklist: sampleDecklist }),
      standing('zoro', { placing: 30, playerName: 'Big30', decklist: sampleDecklist }),
      standing('zoro', { placing: 5, playerName: 'NoList' }), // no decklist → excluded
    ]);
    await seedTournament('small', daysAgo(3), 8, [
      standing('zoro', { placing: 1, playerName: 'Small1', decklist: sampleDecklist }),
    ]);
    await seedTournament('stale', daysAgo(35), 64, [
      standing('zoro', { placing: 1, playerName: 'TooOld', decklist: sampleDecklist }),
    ]);

    const page1 = await request('/api/meta/archetypes/zoro/lists?days=30&limit=2&offset=0', {
      user: USER_A,
    });
    const body1 = (await page1.json()) as { total: number; lists: { playerName: string }[] };
    expect(body1.total).toBe(3); // TooOld outside window, NoList has no decklist
    expect(body1.lists.map((l) => l.playerName)).toEqual(['Big2', 'Small1']);

    const page2 = await request('/api/meta/archetypes/zoro/lists?days=30&limit=2&offset=2', {
      user: USER_A,
    });
    const body2 = (await page2.json()) as { lists: { playerName: string }[] };
    expect(body2.lists.map((l) => l.playerName)).toEqual(['Big30']);
  });

  it('computes meta-weighted field scores and ranks archetypes by them', async () => {
    await clearTournamentData();
    // 2 pilots each → 50 % share for both archetypes.
    await seedTournament('t-field', daysAgo(1), 4, [
      standing('aa', { placing: 1 }),
      standing('aa', { placing: 2 }),
      standing('bb', { placing: 3 }),
      standing('bb', { placing: 4 }),
    ]);
    await seedMatchups([
      { deck1: 'aa', deck2: 'bb', winRate: 60 },
      { deck1: 'bb', deck2: 'aa', winRate: 40 },
    ]);

    const res = await request('/api/meta/field-analysis?days=7', { user: USER_A });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      matchupImportedAt: string | null;
      archetypes: { archetypeId: string; fieldWinRatePct: number; coveragePct: number }[];
    };
    expect(body.matchupImportedAt).not.toBeNull();
    expect(body.archetypes.map((a) => a.archetypeId)).toEqual(['aa', 'bb']);
    // aa: (50 % mirror × 50 + 50 % vs bb × 60) / 100 % = 55
    expect(body.archetypes[0]?.fieldWinRatePct).toBe(55);
    expect(body.archetypes[1]?.fieldWinRatePct).toBe(45);
    expect(body.archetypes[0]?.coveragePct).toBe(100);
  });

  it('field score prefers real matchup data (own matrix) over TrainerHill and exposes the source + matrix', async () => {
    await clearTournamentData();
    await seedTournament('t-own', daysAgo(1), 4, [
      standing('aa', { placing: 1 }),
      standing('aa', { placing: 2 }),
      standing('bb', { placing: 3 }),
      standing('bb', { placing: 4 }),
    ]);
    // TrainerHill says aa beats bb 60 % → aa field score would be 55…
    await seedMatchups([
      { deck1: 'aa', deck2: 'bb', winRate: 60 },
      { deck1: 'bb', deck2: 'aa', winRate: 40 },
    ]);
    // …but the real online-Bo1 matches say 12–0 (100 %), enough games to override.
    await db.insert(schema.tournamentMatchups).values({
      tournamentId: 't-own',
      deckA: 'aa',
      deckB: 'bb',
      aWins: 12,
      bWins: 0,
      ties: 0,
    });

    const body = (await (
      await request('/api/meta/field-analysis?days=7', { user: USER_A })
    ).json()) as {
      matchupSource: { ownPairs: number; fallbackPairs: number; ownGames: number };
      archetypes: { archetypeId: string; fieldWinRatePct: number }[];
    };
    // aa: 50 % mirror × 50 + 50 % vs bb × 100 (OWN) = 75 — not 55 (TrainerHill).
    expect(body.archetypes.find((a) => a.archetypeId === 'aa')?.fieldWinRatePct).toBe(75);
    expect(body.matchupSource.ownGames).toBe(12);
    expect(body.matchupSource.ownPairs).toBeGreaterThanOrEqual(1);

    // The windowed matrix endpoint surfaces the real directed win rate.
    const matrix = (await (
      await request('/api/meta/matchups?days=7', { user: USER_A })
    ).json()) as { rows: { deck1: string; deck2: string; winRate: number }[] };
    expect(matrix.rows.find((r) => r.deck1 === 'aa' && r.deck2 === 'bb')?.winRate).toBe(100);
  });

  it('field analysis reports ties and the tie-weighted personal win rate for the window', async () => {
    await clearTournamentData();
    await seedTournament('t-ties-field', daysAgo(1), 4, [
      standing('aa', { placing: 1, wins: 3, losses: 2, ties: 1 }),
      standing('aa', { placing: 2, wins: 3, losses: 2, ties: 1 }),
      standing('bb', { placing: 3 }),
      standing('bb', { placing: 4 }),
    ]);

    const res = await request('/api/meta/field-analysis?days=7', { user: USER_A });
    const body = (await res.json()) as {
      archetypes: { archetypeId: string; ties?: number; winRatePct: number | null }[];
    };
    const aa = body.archetypes.find((a) => a.archetypeId === 'aa');
    // 6W/4L/2T → (6 + 2/3) / 12 ≈ 55.6 % → rounds to 56 (integer route), not
    // the old ties-excluded 60 (6/10).
    expect(aa?.ties).toBe(2);
    expect(aa?.winRatePct).toBe(56);
  });

  it('folds ties into the directed matchup win rate (AC 6W/4L/2T -> 55.6)', async () => {
    await clearTournamentData();
    await seedTournament('t-ties-matchup', daysAgo(1), 4, [
      standing('aa', { placing: 1 }),
      standing('aa', { placing: 2 }),
      standing('bb', { placing: 3 }),
      standing('bb', { placing: 4 }),
    ]);
    await db.insert(schema.tournamentMatchups).values({
      tournamentId: 't-ties-matchup',
      deckA: 'aa',
      deckB: 'bb',
      aWins: 6,
      bWins: 4,
      ties: 2,
    });

    const matrix = (await (
      await request('/api/meta/matchups?days=7', { user: USER_A })
    ).json()) as { rows: { deck1: string; deck2: string; winRate: number }[] };
    expect(matrix.rows.find((r) => r.deck1 === 'aa' && r.deck2 === 'bb')?.winRate).toBe(55.6);
  });

  it('flags matchup pairs where own data contradicts the TrainerHill fallback (plan §3.3/§3.6)', async () => {
    await clearTournamentData();
    await seedTournament('t-conflict', daysAgo(1), 4, [
      standing('aa', { placing: 1 }),
      standing('aa', { placing: 2 }),
      standing('bb', { placing: 3 }),
      standing('bb', { placing: 4 }),
    ]);
    // TrainerHill says aa beats bb 45 % (AC fallback side of the 70:30 vs 45:55 case).
    await seedMatchups([
      { deck1: 'aa', deck2: 'bb', winRate: 45 },
      { deck1: 'bb', deck2: 'aa', winRate: 55 },
    ]);
    // Our own data says aa beats bb 70 % on 100 games — enough to override, and
    // 25pp away from the fallback (> the 15pp conflict threshold).
    await db.insert(schema.tournamentMatchups).values({
      tournamentId: 't-conflict',
      deckA: 'aa',
      deckB: 'bb',
      aWins: 70,
      bWins: 30,
      ties: 0,
    });

    const body = (await (await request('/api/meta/matchups?days=7', { user: USER_A })).json()) as {
      matchupSource: {
        conflictCount: number;
        conflicts: {
          deck1: string;
          deck2: string;
          ownWinRate: number;
          fallbackWinRate: number;
          deltaPp: number;
        }[];
      };
      rows: { deck1: string; deck2: string; winRate: number }[];
    };

    expect(body.matchupSource.conflictCount).toBeGreaterThanOrEqual(1);
    const conflict = body.matchupSource.conflicts.find((c) => c.deck1 === 'aa' && c.deck2 === 'bb');
    expect(conflict).toMatchObject({ ownWinRate: 70, fallbackWinRate: 45, deltaPp: 25 });

    // The displayed number is always the own value — flagging a conflict must
    // never change what is shown.
    expect(body.rows.find((r) => r.deck1 === 'aa' && r.deck2 === 'bb')?.winRate).toBe(70);
  });

  it('restricts the field to online Bo1 events by default; includes all when asked', async () => {
    await clearTournamentData();
    await seedTournament('online-bo1', daysAgo(1), 20, [standing('aa'), standing('aa')]);
    await seedTournament('irl-bo3', daysAgo(1), 20, [standing('bb'), standing('bb')], {
      isOnline: false,
      swissMode: 'BO3',
    });

    // Default (online + bo1): only the online Bo1 event's players are counted.
    const def = await request('/api/meta/field-analysis?days=7', { user: USER_A });
    const defBody = (await def.json()) as {
      totalPlayers: number;
      tournamentCount: number;
      archetypes: { archetypeId: string }[];
    };
    expect(defBody.totalPlayers).toBe(2);
    expect(defBody.tournamentCount).toBe(1);
    expect(defBody.archetypes.map((a) => a.archetypeId)).toEqual(['aa']);

    // Scope widened: both the online Bo1 and the in-person Bo3 event are counted.
    const all = await request('/api/meta/field-analysis?days=7&online=false&bo1=false', {
      user: USER_A,
    });
    const allBody = (await all.json()) as {
      totalPlayers: number;
      archetypes: { archetypeId: string }[];
    };
    expect(allBody.totalPlayers).toBe(4);
    expect(allBody.archetypes.map((a) => a.archetypeId).sort()).toEqual(['aa', 'bb']);
  });

  it('days window genuinely drives the metashare (more days → more decks/players)', async () => {
    await clearTournamentData();
    // Two online-Bo1 events at different ages, 2 pilots each.
    await seedTournament('recent', daysAgo(2), 20, [standing('aa'), standing('aa')]);
    await seedTournament('older', daysAgo(20), 20, [standing('bb'), standing('bb')]);

    const w7 = (await (
      await request('/api/meta/field-analysis?days=7', { user: USER_A })
    ).json()) as {
      totalPlayers: number;
      tournamentCount: number;
      archetypes: { archetypeId: string }[];
    };
    expect(w7.tournamentCount).toBe(1);
    expect(w7.totalPlayers).toBe(2);
    expect(w7.archetypes.map((a) => a.archetypeId)).toEqual(['aa']);

    // Widening to 30 days brings in the older event — proof that the day control
    // changes the result. The reported "days does nothing" was a data-coverage
    // symptom (too few tournaments ingested, all recent), not a broken filter;
    // Phase 0's higher ingest cap + delta accumulation is the real fix.
    const w30 = (await (
      await request('/api/meta/field-analysis?days=30', { user: USER_A })
    ).json()) as {
      totalPlayers: number;
      tournamentCount: number;
      archetypes: { archetypeId: string }[];
    };
    expect(w30.tournamentCount).toBe(2);
    expect(w30.totalPlayers).toBe(4);
    expect(w30.archetypes.map((a) => a.archetypeId).sort()).toEqual(['aa', 'bb']);
  });

  it('serves one archetype analysis with threats, rank and trend', async () => {
    await clearTournamentData();
    await seedTournament('t-ana', daysAgo(1), 4, [
      standing('aa', { placing: 1, decklist: sampleDecklist }),
      standing('aa', { placing: 2 }),
      standing('bb', { placing: 3 }),
      standing('bb', { placing: 4 }),
    ]);
    await seedMatchups([
      { deck1: 'aa', deck2: 'bb', winRate: 40 },
      { deck1: 'bb', deck2: 'aa', winRate: 60 },
    ]);
    // One legacy snapshot row (no archetypeId → matched by name) + one current.
    await db.insert(schema.metaSnapshots).values([
      {
        archetype: 'AA',
        frequencyPct: 40,
        winRatePct: 52,
        wins: 21,
        losses: 19,
        playerCount: 12,
        period: '2026-W20',
        sourceNote: 'test',
      },
      {
        archetype: 'AA',
        archetypeId: 'aa',
        frequencyPct: 50,
        winRatePct: 55,
        wins: 22,
        losses: 18,
        playerCount: 14,
        period: '2026-W21',
        sourceNote: 'test',
      },
    ]);

    const res = await request('/api/meta/archetypes/aa/analysis?days=7', { user: USER_A });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      archetype: { sharePct: number; playerCount: number };
      fieldScore: {
        rank: number;
        fieldWinRatePct: number;
        threats: { archetypeId: string }[];
        freeWins: unknown[];
      };
      totalRanked: number;
      listsAvailable: number;
      trend: { period: string }[];
    };
    expect(body.archetype).toMatchObject({ sharePct: 50, playerCount: 2 });
    // aa loses to bb (40 %) → bb is the threat, and aa ranks below bb.
    expect(body.fieldScore.fieldWinRatePct).toBe(45);
    expect(body.fieldScore.rank).toBe(2);
    expect(body.fieldScore.threats.map((t) => t.archetypeId)).toEqual(['bb']);
    expect(body.fieldScore.freeWins).toEqual([]);
    expect(body.totalRanked).toBe(2);
    expect(body.listsAvailable).toBe(1);
    expect(body.trend.map((t) => t.period)).toEqual(['2026-W20', '2026-W21']);

    const missing = await request('/api/meta/archetypes/unknown-deck/analysis', { user: USER_A });
    expect(missing.status).toBe(404);

    const invalid = await request('/api/meta/archetypes/UPPER_case!/analysis', { user: USER_A });
    expect(invalid.status).toBe(400);
  });

  // Spec 3 (confidence-aware matchups, plan §3.5, Slice B step 7): a pairing
  // with fewer than the old MIN_MATCHUP_GAMES=10 threshold must now count in
  // full, and the wire response must carry the propagated Wilson band.
  it('exposes Wilson confidence bands on /field-analysis, counting a thin (sub-cutoff) pairing in full (plan §3.5)', async () => {
    await clearTournamentData();
    await seedTournament('t-field-ci', daysAgo(1), 4, [
      standing('aa', { placing: 1 }),
      standing('aa', { placing: 2 }),
      standing('bb', { placing: 3 }),
      standing('bb', { placing: 4 }),
    ]);
    // Only 6 games — well below the old cutoff, which would have dropped this
    // pair from coverage entirely (mirror-only coveragePct would be 50).
    const importedAt = new Date();
    await db.insert(schema.matchupMatrix).values([
      {
        deck1: 'aa',
        deck2: 'bb',
        wins: 5,
        losses: 1,
        ties: 0,
        total: 6,
        winRate: 83.3,
        importedAt,
      },
      {
        deck1: 'bb',
        deck2: 'aa',
        wins: 1,
        losses: 5,
        ties: 0,
        total: 6,
        winRate: 16.7,
        importedAt,
      },
    ]);

    const res = await request('/api/meta/field-analysis?days=7', { user: USER_A });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      archetypes: {
        archetypeId: string;
        coveragePct: number;
        fieldWinRatePct: number;
        fieldWinRateLowPct?: number;
        fieldWinRateHighPct?: number;
      }[];
    };
    const aa = body.archetypes.find((a) => a.archetypeId === 'aa')!;
    expect(aa.coveragePct).toBe(100); // NOT 50 — the thin pair is no longer dropped
    expect(typeof aa.fieldWinRateLowPct).toBe('number');
    expect(typeof aa.fieldWinRateHighPct).toBe('number');
    expect(aa.fieldWinRateLowPct!).toBeLessThan(aa.fieldWinRatePct);
    expect(aa.fieldWinRatePct).toBeLessThan(aa.fieldWinRateHighPct!);
  });

  it('exposes lowPct/highPct/significant on field-score threats and free wins (plan §3.5)', async () => {
    await clearTournamentData();
    await seedTournament('t-ana-ci', daysAgo(1), 4, [
      standing('aa', { placing: 1 }),
      standing('aa', { placing: 2 }),
      standing('bb', { placing: 3 }),
      standing('bb', { placing: 4 }),
    ]);
    const importedAt = new Date();
    await db.insert(schema.matchupMatrix).values([
      {
        deck1: 'aa',
        deck2: 'bb',
        wins: 2,
        losses: 4,
        ties: 0,
        total: 6,
        winRate: 33.3,
        importedAt,
      },
      {
        deck1: 'bb',
        deck2: 'aa',
        wins: 4,
        losses: 2,
        ties: 0,
        total: 6,
        winRate: 66.7,
        importedAt,
      },
    ]);

    const res = await request('/api/meta/archetypes/aa/analysis?days=7', { user: USER_A });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      fieldScore: {
        fieldWinRateLowPct?: number;
        fieldWinRateHighPct?: number;
        threats: {
          archetypeId: string;
          lowPct?: number;
          highPct?: number;
          significant?: boolean;
        }[];
      };
    };
    expect(typeof body.fieldScore.fieldWinRateLowPct).toBe('number');
    expect(typeof body.fieldScore.fieldWinRateHighPct).toBe('number');
    const bb = body.fieldScore.threats.find((t) => t.archetypeId === 'bb');
    expect(bb).toBeDefined();
    expect(typeof bb!.lowPct).toBe('number');
    expect(typeof bb!.highPct).toBe('number');
    expect(typeof bb!.significant).toBe('boolean');
  });

  it('lazily seeds the matchup matrix from the bundled CSV and accepts new imports', async () => {
    await clearTournamentData();

    const first = await request('/api/matchups', { user: USER_A });
    expect(first.status).toBe(200);
    const seeded = (await first.json()) as { importedAt: string | null; rows: unknown[] };
    expect(seeded.importedAt).not.toBeNull();
    expect(seeded.rows.length).toBeGreaterThan(100); // the bundled TrainerHill export

    const csv = 'deck1,deck2,wins,losses,ties,total,win_rate\naa,bb,30,20,0,50,60\nbad row\n';
    const imported = await app.request('/api/matchups/import', {
      method: 'POST',
      headers: { 'x-test-user': USER_A, 'Content-Type': 'text/csv' },
      body: csv,
    });
    expect(imported.status).toBe(200);
    expect((await imported.json()) as object).toMatchObject({ imported: 1, skipped: 1 });

    // Reads now serve the newest batch (the tiny import), not the seed.
    const second = await request('/api/matchups', { user: USER_A });
    const latest = (await second.json()) as { rows: { deck1: string }[] };
    expect(latest.rows).toHaveLength(1);
    expect(latest.rows[0]?.deck1).toBe('aa');

    const badImport = await app.request('/api/matchups/import', {
      method: 'POST',
      headers: { 'x-test-user': USER_A, 'Content-Type': 'text/csv' },
      body: 'not,a,matchup\n1,2,3',
    });
    expect(badImport.status).toBe(400);
  });

  it('requires a session on all drilldown routes', async () => {
    for (const path of [
      '/api/meta/field-analysis',
      '/api/meta/archetypes/zoro/lists',
      '/api/meta/archetypes/zoro/analysis',
      '/api/matchups',
    ]) {
      const res = await request(path);
      expect(res.status, path).toBe(401);
    }
  });

  it('rejects an oversized CSV body with 413 before parsing', async () => {
    const big = `deck1,deck2,wins,losses,ties,total,win_rate\n${'a'.repeat(600 * 1024)}`;
    const res = await app.request('/api/matchups/import', {
      method: 'POST',
      headers: { 'x-test-user': USER_B, 'Content-Type': 'text/csv' },
      body: big,
    });
    expect(res.status).toBe(413);
  });

  it('rate-limits repeated imports per user with 429', async () => {
    const csv = 'deck1,deck2,wins,losses,ties,total,win_rate\nr1,r2,30,20,0,50,60\n';
    // A dedicated user so the exhausted budget cannot bleed into other tests.
    let got429 = false;
    for (let i = 0; i < 7 && !got429; i++) {
      const res = await app.request('/api/matchups/import', {
        method: 'POST',
        headers: { 'x-test-user': 'rate-limit-user', 'Content-Type': 'text/csv' },
        body: csv,
      });
      if (res.status === 429) got429 = true;
      else expect(res.status).toBe(200);
    }
    expect(got429).toBe(true);
  });
});

describe('backfillMetaWinRates job (plan §3.8)', () => {
  it('recomputes tie-aware win rates from raw standings, without touching rows it cannot verify', async () => {
    await db.delete(schema.tournaments); // standings cascade
    await db.delete(schema.metaSnapshots);

    const goodDate = new Date('2026-06-03T00:00:00Z');
    const goodPeriod = isoWeekLabel(goodDate);

    await db.insert(schema.tournaments).values({
      id: 'bf-good',
      name: 'Backfill Good',
      date: goodDate,
      players: 4,
      isOnline: true,
      swissMode: 'BO1',
    });
    await db.insert(schema.tournamentStandings).values([
      // Charizard: raw totals 6W/4L/2T — matches the (stale) snapshot below.
      {
        tournamentId: 'bf-good',
        archetypeId: 'char',
        archetypeName: 'Charizard',
        wins: 3,
        losses: 2,
        ties: 1,
      },
      {
        tournamentId: 'bf-good',
        archetypeId: 'char',
        archetypeName: 'Charizard',
        wins: 3,
        losses: 2,
        ties: 1,
      },
      // Gardevoir: raw totals 10W/4L/0T — deliberately does NOT match the
      // snapshot's wins/losses below (simulates a different sync scope).
      {
        tournamentId: 'bf-good',
        archetypeId: 'gard',
        archetypeName: 'Gardevoir',
        wins: 5,
        losses: 2,
        ties: 0,
      },
      {
        tournamentId: 'bf-good',
        archetypeId: 'gard',
        archetypeName: 'Gardevoir',
        wins: 5,
        losses: 2,
        ties: 0,
      },
    ]);
    await db.insert(schema.metaSnapshots).values([
      {
        archetype: 'Charizard',
        archetypeId: 'char',
        frequencyPct: 100,
        winRatePct: 60, // stale: old ties-excluded formula (6/10)
        wins: 6,
        losses: 4,
        playerCount: 2,
        period: goodPeriod,
        sourceNote: 'test',
      },
      {
        archetype: 'Gardevoir',
        archetypeId: 'gard',
        frequencyPct: 100,
        winRatePct: 99, // never matches raw wins/losses -> must be skipped
        wins: 999,
        losses: 999,
        playerCount: 2,
        period: goodPeriod,
        sourceNote: 'test',
      },
      {
        // No tournaments/standings at all for this period -> must stay untouched.
        archetype: 'NoRawData',
        archetypeId: 'no-raw',
        frequencyPct: 100,
        winRatePct: 42,
        wins: 5,
        losses: 3,
        playerCount: 4,
        period: '2020-W01',
        sourceNote: 'test',
      },
    ]);

    const dryRun = await backfillMetaWinRates(db, { dryRun: true });
    expect(dryRun.rowsUpdated).toBe(1);
    expect(dryRun.rowsWithoutRawData).toBe(1);
    expect(dryRun.rowsSkippedMismatch).toBe(1);
    expect(dryRun.dryRun).toBe(true);

    // A dry run must not write anything.
    const stillStale = await db
      .select()
      .from(schema.metaSnapshots)
      .where(eq(schema.metaSnapshots.archetype, 'Charizard'));
    expect(stillStale[0]?.winRatePct).toBe(60);

    const real = await backfillMetaWinRates(db);
    expect(real.rowsUpdated).toBe(1);
    expect(real.rowsWithoutRawData).toBe(1);
    expect(real.rowsSkippedMismatch).toBe(1);
    expect(real.dryRun).toBe(false);

    const updated = await db
      .select()
      .from(schema.metaSnapshots)
      .where(eq(schema.metaSnapshots.archetype, 'Charizard'));
    // 6W/4L/2T → (6 + 2/3) / 12 ≈ 55.6 % → rounds to 56, plus ties recorded.
    expect(updated[0]).toMatchObject({ winRatePct: 56, ties: 2 });

    const untouchedMismatch = await db
      .select()
      .from(schema.metaSnapshots)
      .where(eq(schema.metaSnapshots.archetype, 'Gardevoir'));
    expect(untouchedMismatch[0]).toMatchObject({ winRatePct: 99 });

    const untouchedNoRaw = await db
      .select()
      .from(schema.metaSnapshots)
      .where(eq(schema.metaSnapshots.archetype, 'NoRawData'));
    expect(untouchedNoRaw[0]).toMatchObject({ winRatePct: 42 });
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
