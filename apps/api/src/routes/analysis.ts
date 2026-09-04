import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { SYNTHESIS_PROMPT_VERSION } from '@pokekon/shared';
import { AnalysisError, getAnalysisProvider } from '../ai/index.js';
import { decks, deckCards, userAiSettings, type AiProvider } from '../db/schema.js';
import { decryptSecret, encryptSecret } from '../lib/crypto.js';
import { loadDeckSynthesis } from '../lib/deckSynthesisStore.js';
import { buildSynthesisFactSet, synthesisInputHash } from '../lib/synthesisFacts.js';
import type { ApiEnv } from '../middleware/session.js';
import {
  aiSettingsPutSchema,
  analyzeLogSchema,
  deckSynthesisQuerySchema,
  snapCardStatsWindow,
} from '../validation.js';
import { parseId, readJson } from './shared.js';

/**
 * /api/analysis — provider-agnostic LLM analysis of battle logs (plan §6.3 Phase A).
 * The per-user API key is stored encrypted and only decrypted server-side here; it is
 * never returned to the client.
 */
export function createAnalysisRoutes(): Hono<ApiEnv> {
  const routes = new Hono<ApiEnv>();

  // GET /api/analysis/settings — exposes whether a key is set, never the key itself.
  routes.get('/settings', async (c) => {
    const userId = c.get('user').id;
    const [row] = await c
      .get('db')
      .select()
      .from(userAiSettings)
      .where(eq(userAiSettings.userId, userId))
      .limit(1);
    return c.json({
      provider: row?.provider ?? 'github-models',
      model: row?.model ?? null,
      hasApiKey: row?.encryptedApiKey != null,
    });
  });

  // PUT /api/analysis/settings — upsert provider/model/key (key encrypted at rest).
  routes.put('/settings', async (c) => {
    const parsed = aiSettingsPutSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', issues: parsed.error.issues }, 400);
    }
    const db = c.get('db');
    const userId = c.get('user').id;
    const body = parsed.data;

    const [existing] = await db
      .select()
      .from(userAiSettings)
      .where(eq(userAiSettings.userId, userId))
      .limit(1);

    // Key: omitted → keep existing; null/"" → clear; value → encrypt.
    const key =
      body.apiKey === undefined
        ? (existing?.encryptedApiKey ?? null)
        : body.apiKey === null || body.apiKey.trim() === ''
          ? null
          : encryptSecret(body.apiKey.trim());

    const provider = body.provider ?? existing?.provider ?? 'github-models';
    const model =
      body.model === undefined
        ? (existing?.model ?? null)
        : body.model && body.model.trim() !== ''
          ? body.model.trim()
          : null;

    await db
      .insert(userAiSettings)
      .values({ userId, provider, model, encryptedApiKey: key })
      .onConflictDoUpdate({
        target: userAiSettings.userId,
        set: { provider, model, encryptedApiKey: key, updatedAt: new Date() },
      });

    return c.json({ provider, model, hasApiKey: key != null });
  });

  // POST /api/analysis/log — run the configured provider on a battle log.
  routes.post('/log', async (c) => {
    const parsed = analyzeLogSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', issues: parsed.error.issues }, 400);
    }
    const userId = c.get('user').id;
    const body = parsed.data;

    // Ephemeral BYOK: a key in the request body is used once and never stored
    // (demo flow). Otherwise fall back to the caller's stored, encrypted key.
    let apiKey: string;
    let providerName: AiProvider;
    let model: string | null;

    const ephemeralKey = body.apiKey?.trim();
    if (ephemeralKey) {
      apiKey = ephemeralKey;
      providerName = body.provider ?? 'github-models';
      model = body.model ?? null;
    } else {
      const [settings] = await c
        .get('db')
        .select()
        .from(userAiSettings)
        .where(eq(userAiSettings.userId, userId))
        .limit(1);

      if (!settings?.encryptedApiKey) {
        return c.json({ error: 'No API key configured. Add one in AI analysis settings.' }, 400);
      }
      try {
        apiKey = decryptSecret(settings.encryptedApiKey);
      } catch {
        return c.json({ error: 'Stored API key could not be decrypted.' }, 500);
      }
      providerName = settings.provider;
      model = settings.model;
    }

    const provider = getAnalysisProvider(providerName, { apiKey, model });
    try {
      const analysis = await provider.analyze({
        log: parsed.data.battleLog,
        playerName: parsed.data.playerName,
      });
      return c.json(analysis);
    } catch (err) {
      if (err instanceof AnalysisError) {
        return c.json({ error: err.message }, err.status as 401 | 403 | 429 | 500 | 502);
      }
      return c.json({ error: 'Analysis failed.' }, 500);
    }
  });

  // GET /api/analysis/deck/:deckId — read-only: current facts + the cached
  // synthesis (if any), never an LLM call (plan §3.7/§3.8, Scheibe H).
  routes.get('/deck/:deckId', async (c) => {
    const deckId = parseId(c.req.param('deckId'));
    if (deckId === null) return c.json({ error: 'Not found' }, 404);

    const db = c.get('db');
    const userId = c.get('user').id;

    // Ownership first, before anything else — a foreign or unknown deck is a
    // 404, never a 403 (no existence oracle, plan §3.8).
    const [deck] = await db
      .select()
      .from(decks)
      .where(and(eq(decks.id, deckId), eq(decks.userId, userId)))
      .limit(1);
    if (!deck) return c.json({ error: 'Not found' }, 404);

    const parsed = deckSynthesisQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: 'Invalid query', issues: parsed.error.issues }, 400);
    }
    const windowDays = snapCardStatsWindow(parsed.data.days);
    const language = parsed.data.language;

    const deckCardRows = await db
      .select({ name: deckCards.name, count: deckCards.count })
      .from(deckCards)
      .where(eq(deckCards.deckId, deckId));

    const [factSet, row, settings] = await Promise.all([
      buildSynthesisFactSet(db, {
        deck: {
          id: deck.id,
          archetype: deck.archetype,
          archetypeName: deck.archetypeName,
          variant: deck.variant,
        },
        deckCards: deckCardRows,
        windowDays,
        language,
      }),
      loadDeckSynthesis(db, deckId, windowDays, language),
      db.select().from(userAiSettings).where(eq(userAiSettings.userId, userId)).limit(1),
    ]);

    const currentInputHash = synthesisInputHash(factSet.facts, {
      archetypeId: deck.archetype,
      windowDays,
      language,
      promptVersion: SYNTHESIS_PROMPT_VERSION,
    });

    // Serve rule (plan §3.7): no row -> not stale; matching hash -> not
    // stale; mismatched hash on an 'llm' row -> stale; mismatched hash on a
    // 'demo-seed' row -> never stale (a curated example, not a live figure).
    const stale = row !== null && row.inputHash !== currentInputHash && row.source === 'llm';

    return c.json({
      deckId: deck.id,
      archetypeId: deck.archetype,
      windowDays,
      language,
      synthesis: row,
      stale,
      currentInputHash,
      availableFactCount: factSet.facts.length,
      hasApiKey: settings[0]?.encryptedApiKey != null,
    });
  });

  return routes;
}
