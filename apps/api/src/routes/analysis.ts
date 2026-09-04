import { and, eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { assembleSynthesis, SYNTHESIS_PROMPT_VERSION } from '@pokekon/shared';
import { AnalysisError, getAnalysisProvider } from '../ai/index.js';
import { decks, deckCards, userAiSettings, type AiProvider } from '../db/schema.js';
import { decryptSecret, encryptSecret } from '../lib/crypto.js';
import { loadDeckSynthesis, saveDeckSynthesis } from '../lib/deckSynthesisStore.js';
import { rateLimit } from '../lib/rateLimit.js';
import { buildSynthesisFactSet, synthesisInputHash } from '../lib/synthesisFacts.js';
import type { ApiEnv } from '../middleware/session.js';
import {
  aiSettingsPutSchema,
  analyzeLogSchema,
  deckSynthesisPostSchema,
  deckSynthesisQuerySchema,
  META_WINDOW_DEFAULT_DAYS,
  snapCardStatsWindow,
} from '../validation.js';
import { parseId, readJson } from './shared.js';

/**
 * Resolves which API key/provider/model to use for an LLM call: an ephemeral
 * `body.apiKey` when present (used once for this request only, NEVER written
 * to `user_ai_settings` — powers the demo/BYOK-without-signup flow), otherwise
 * the caller's stored, encrypted key. Shared verbatim by POST /log and
 * POST /deck/:deckId (plan §3.8 step 7) so the two routes cannot drift.
 */
async function resolveApiKey(
  c: Context<ApiEnv>,
  userId: string,
  body: {
    apiKey?: string | undefined;
    provider?: AiProvider | undefined;
    model?: string | null | undefined;
  },
): Promise<
  | { ok: true; apiKey: string; providerName: AiProvider; model: string | null }
  | { ok: false; response: Response }
> {
  const ephemeralKey = body.apiKey?.trim();
  if (ephemeralKey) {
    return {
      ok: true,
      apiKey: ephemeralKey,
      providerName: body.provider ?? 'github-models',
      model: body.model ?? null,
    };
  }

  const [settings] = await c
    .get('db')
    .select()
    .from(userAiSettings)
    .where(eq(userAiSettings.userId, userId))
    .limit(1);

  if (!settings?.encryptedApiKey) {
    return {
      ok: false,
      response: c.json({ error: 'No API key configured. Add one in AI analysis settings.' }, 400),
    };
  }
  try {
    return {
      ok: true,
      apiKey: decryptSecret(settings.encryptedApiKey),
      providerName: settings.provider,
      model: settings.model,
    };
  } catch {
    return {
      ok: false,
      response: c.json({ error: 'Stored API key could not be decrypted.' }, 500),
    };
  }
}

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

    const resolved = await resolveApiKey(c, userId, body);
    if (!resolved.ok) return resolved.response;
    const { apiKey, providerName, model } = resolved;

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

  // POST /api/analysis/deck/:deckId — generate (or serve a cached) synthesis
  // over the currently computable facts (plan §3.8, Scheibe I). Rate-limited:
  // unlike GET, this route can trigger a real LLM call and runs the same
  // aggregate queries as GET before that call.
  routes.post('/deck/:deckId', rateLimit({ windowMs: 60 * 60_000, max: 20 }), async (c) => {
    const deckId = parseId(c.req.param('deckId'));
    if (deckId === null) return c.json({ error: 'Not found' }, 404);

    const parsed = deckSynthesisPostSchema.safeParse(await readJson(c));
    if (!parsed.success) {
      return c.json({ error: 'Invalid request body', issues: parsed.error.issues }, 400);
    }
    const body = parsed.data;

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

    const windowDays = snapCardStatsWindow(body.days ?? META_WINDOW_DEFAULT_DAYS);
    const language = body.language;

    const deckCardRows = await db
      .select({ name: deckCards.name, count: deckCards.count })
      .from(deckCards)
      .where(eq(deckCards.deckId, deckId));

    const factSet = await buildSynthesisFactSet(db, {
      deck: {
        id: deck.id,
        archetype: deck.archetype,
        archetypeName: deck.archetypeName,
        variant: deck.variant,
      },
      deckCards: deckCardRows,
      windowDays,
      language,
    });

    // Never spend a token on a deck with nothing to synthesise from (plan
    // §3.8 step 4) — checked before any key resolution or LLM call.
    if (factSet.facts.length === 0) {
      return c.json({ error: 'Not enough meta data to synthesise yet.' }, 409);
    }

    const currentHash = synthesisInputHash(factSet.facts, {
      archetypeId: deck.archetype,
      windowDays,
      language,
      promptVersion: SYNTHESIS_PROMPT_VERSION,
    });

    if (!body.force) {
      const cached = await loadDeckSynthesis(db, deckId, windowDays, language);
      if (cached && cached.inputHash === currentHash) {
        return c.json({ synthesis: cached, stale: false, cached: true });
      }
    }

    const resolved = await resolveApiKey(c, userId, body);
    if (!resolved.ok) return resolved.response;
    const { apiKey, providerName, model } = resolved;

    const provider = getAnalysisProvider(providerName, { apiKey, model });
    try {
      const validated = await provider.synthesize({
        facts: factSet.facts,
        context: factSet.context,
      });
      const synthesis = assembleSynthesis(validated, factSet.facts, factSet.context, {
        inputHash: currentHash,
        source: 'llm',
        provider: providerName,
        model,
        generatedAt: new Date().toISOString(),
      });
      await saveDeckSynthesis(db, userId, synthesis);
      return c.json({ synthesis, stale: false, cached: false });
    } catch (err) {
      if (err instanceof AnalysisError) {
        return c.json({ error: err.message }, err.status as 401 | 403 | 429 | 500 | 502);
      }
      return c.json({ error: 'Synthesis failed.' }, 500);
    }
  });

  return routes;
}
