import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import type { Db } from './db/index.js';
import * as schema from './db/schema.js';

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
      return id === null ? null : { id };
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
