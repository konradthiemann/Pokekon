import { and, asc, count, desc, eq, gte, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  computeFieldScores,
  computeMetaSnapshots,
  OTHER_ARCHETYPE_ID,
  ROTATION_PERIOD,
  type ArchetypeShare,
  type FieldScore,
  type StandingLite,
} from '@pokekon/shared';
import type { Db } from '../db/index.js';
import { metaSnapshots, tournamentStandings, tournaments } from '../db/schema.js';
import { runMetaSync } from '../jobs/syncMeta.js';
import { ensureMatchups } from '../lib/matchupData.js';
import { rateLimit } from '../lib/rateLimit.js';
import { windowStartDays } from '../lib/timeWindow.js';
import type { ApiEnv } from '../middleware/session.js';
import {
  archetypeIdParamSchema,
  archetypeListsQuerySchema,
  metaWindowQuerySchema,
} from '../validation.js';

interface WindowAggregates {
  tournamentCount: number;
  totalPlayers: number;
  /** Per-archetype window stats (share, record, pilots), noise filtered. */
  archetypes: {
    archetypeId: string;
    archetypeName: string;
    sharePct: number;
    winRatePct: number | null;
    wins: number;
    losses: number;
    playerCount: number;
  }[];
}

/** Window + scope shared by every meta read: a day range plus the online /
 *  Bo1-Swiss filters that make the sample a local-Bo1 proxy. */
export interface MetaWindow {
  days: number;
  online: boolean;
  bo1: boolean;
}

/** Conditions for the tournaments join: date range + optional online/Bo1 scope.
 *  With online+bo1 on (the default), only ground-truth online Bo1-Swiss events
 *  count — the metashare and win rate then mirror local Challenge/Cup play. */
function windowConditions({ days, online, bo1 }: MetaWindow) {
  const conds = [gte(tournaments.date, windowStartDays(days))];
  if (online) conds.push(eq(tournaments.isOnline, true));
  if (bo1) conds.push(eq(tournaments.swissMode, 'BO1'));
  return conds;
}

/**
 * Aggregate the persisted standings within the window into per-archetype shares
 * and records. Reuses the shared meta engine: the share of an archetype is its
 * pilot count over all counted players, regardless of which tournament the
 * pilots sat in — so no per-tournament grouping is needed here.
 */
async function loadWindowAggregates(db: Db, window: MetaWindow): Promise<WindowAggregates> {
  const rows = await db
    .select({
      tournamentId: tournamentStandings.tournamentId,
      archetypeId: tournamentStandings.archetypeId,
      archetypeName: tournamentStandings.archetypeName,
      wins: tournamentStandings.wins,
      losses: tournamentStandings.losses,
    })
    .from(tournamentStandings)
    .innerJoin(tournaments, eq(tournamentStandings.tournamentId, tournaments.id))
    .where(and(...windowConditions(window)));

  const standings: StandingLite[] = rows.map((r) => ({
    deck: { id: r.archetypeId, name: r.archetypeName },
    record: { wins: r.wins, losses: r.losses },
  }));
  // One flat group instead of per-tournament arrays is fine here: shares and
  // records don't depend on the grouping, and the only field that does
  // (tournamentCount) is computed separately from the distinct ids below.
  const agg = computeMetaSnapshots([standings], 'window', '');
  const idToName = new Map(rows.map((r) => [r.archetypeId, r.archetypeName]));

  return {
    tournamentCount: new Set(rows.map((r) => r.tournamentId)).size,
    totalPlayers: agg.totalPlayers,
    archetypes: agg.snapshots.map((s) => ({
      archetypeId: s.archetypeId,
      archetypeName: idToName.get(s.archetypeId) ?? s.archetype,
      sharePct: s.frequencyPct,
      winRatePct: s.winRatePct,
      wins: s.wins,
      losses: s.losses,
      playerCount: s.playerCount,
    })),
  };
}

/** Field scores for every archetype in the window ('other' participates as an
 *  opponent but is never ranked as a subject — it is not a playable deck). */
async function loadFieldScores(
  db: Db,
  window: MetaWindow,
): Promise<{ window: WindowAggregates; scores: FieldScore[]; matchupImportedAt: Date | null }> {
  const [aggregates, matchups] = await Promise.all([
    loadWindowAggregates(db, window),
    ensureMatchups(db),
  ]);
  const shares: ArchetypeShare[] = aggregates.archetypes.map((a) => ({
    archetypeId: a.archetypeId,
    archetypeName: a.archetypeName,
    sharePct: a.sharePct,
  }));
  const scores = computeFieldScores(shares, matchups.rows).filter(
    (s) => s.archetypeId !== OTHER_ARCHETYPE_ID,
  );
  // Re-rank after dropping 'other' so ranks stay dense (1..n).
  scores.forEach((s, i) => {
    s.rank = i + 1;
  });
  return { window: aggregates, scores, matchupImportedAt: matchups.importedAt };
}

/**
 * /api/meta — global tournament-meta snapshots plus the archetype drilldown
 * (field analysis, tournament decklists). Reads serve only in-season
 * (post-rotation) data; the sync is a server-side job (no browser CORS proxy).
 */
export function createMetaRoutes(): Hono<ApiEnv> {
  const routes = new Hono<ApiEnv>();

  // GET /api/meta — all in-season snapshots (every post-rotation period), oldest first.
  routes.get('/', async (c) => {
    const rows = await c
      .get('db')
      .select()
      .from(metaSnapshots)
      .where(gte(metaSnapshots.period, ROTATION_PERIOD))
      .orderBy(asc(metaSnapshots.period));
    return c.json(rows);
  });

  // POST /api/meta/sync — run the server-side meta sync (fetches Limitless
  // directly). Rate-limited: the sync now persists tournaments/standings, so a
  // scripted guest account hammering it would load both Postgres and the
  // Limitless API from our server IP (security review M1).
  routes.post('/sync', rateLimit({ windowMs: 10 * 60_000, max: 5 }), async (c) => {
    try {
      const result = await runMetaSync(c.get('db'));
      return c.json(result);
    } catch (err) {
      // Upstream fetch errors ("Limitless … → HTTP 503") are actionable for the
      // user; anything else (e.g. database driver errors) stays server-side (L2).
      console.error('[meta] sync failed:', err);
      const message =
        err instanceof Error && err.message.startsWith('Limitless')
          ? err.message
          : 'Meta sync failed';
      return c.json({ error: message }, 502);
    }
  });

  // GET /api/meta/field-analysis?days&online&bo1 — every archetype's meta-weighted
  // field win rate (plan §3.4) over the window, rank 1 = best positioned.
  routes.get('/field-analysis', async (c) => {
    const parsedQuery = metaWindowQuerySchema.safeParse(c.req.query());
    if (!parsedQuery.success) {
      return c.json({ error: 'Invalid query parameters', issues: parsedQuery.error.issues }, 400);
    }
    const { days, online, bo1 } = parsedQuery.data;

    const { window, scores, matchupImportedAt } = await loadFieldScores(c.get('db'), {
      days,
      online,
      bo1,
    });
    const statsById = new Map(window.archetypes.map((a) => [a.archetypeId, a]));

    return c.json({
      days,
      online,
      bo1,
      tournamentCount: window.tournamentCount,
      totalPlayers: window.totalPlayers,
      matchupImportedAt: matchupImportedAt?.toISOString() ?? null,
      archetypes: scores.map((s) => {
        const stats = statsById.get(s.archetypeId);
        return {
          archetypeId: s.archetypeId,
          archetypeName: s.archetypeName,
          sharePct: s.sharePct,
          winRatePct: stats?.winRatePct ?? null,
          wins: stats?.wins ?? 0,
          losses: stats?.losses ?? 0,
          playerCount: stats?.playerCount ?? 0,
          fieldWinRatePct: s.fieldWinRatePct,
          coveragePct: s.coveragePct,
          rank: s.rank,
        };
      }),
    });
  });

  // GET /api/meta/archetypes/:archetypeId/lists?days&online&bo1&limit&offset — the
  // most successful published decklists of one archetype within the window.
  routes.get('/archetypes/:archetypeId/lists', async (c) => {
    const archetypeId = archetypeIdParamSchema.safeParse(c.req.param('archetypeId'));
    if (!archetypeId.success) return c.json({ error: 'Invalid archetype id' }, 400);
    const parsedQuery = archetypeListsQuerySchema.safeParse(c.req.query());
    if (!parsedQuery.success) {
      return c.json({ error: 'Invalid query parameters', issues: parsedQuery.error.issues }, 400);
    }
    const { days, online, bo1, limit, offset } = parsedQuery.data;
    const db = c.get('db');

    const filter = and(
      eq(tournamentStandings.archetypeId, archetypeId.data),
      isNotNull(tournamentStandings.decklist),
      ...windowConditions({ days, online, bo1 }),
    );

    const [totalRow, rows] = await Promise.all([
      db
        .select({ total: count() })
        .from(tournamentStandings)
        .innerJoin(tournaments, eq(tournamentStandings.tournamentId, tournaments.id))
        .where(filter),
      db
        .select({
          id: tournamentStandings.id,
          playerName: tournamentStandings.playerName,
          placing: tournamentStandings.placing,
          wins: tournamentStandings.wins,
          losses: tournamentStandings.losses,
          ties: tournamentStandings.ties,
          decklist: tournamentStandings.decklist,
          tournamentId: tournaments.id,
          tournamentName: tournaments.name,
          tournamentDate: tournaments.date,
          tournamentPlayers: tournaments.players,
        })
        .from(tournamentStandings)
        .innerJoin(tournaments, eq(tournamentStandings.tournamentId, tournaments.id))
        .where(filter)
        // "Most successful" = best finish relative to field size; ties go to the
        // bigger event, then to the more recent one.
        .orderBy(
          sql`${tournamentStandings.placing}::real / GREATEST(${tournaments.players}, 1) ASC NULLS LAST`,
          desc(tournaments.players),
          desc(tournaments.date),
        )
        .limit(limit)
        .offset(offset),
    ]);

    return c.json({
      total: totalRow[0]?.total ?? 0,
      lists: rows.map((r) => ({
        id: r.id,
        playerName: r.playerName,
        placing: r.placing,
        wins: r.wins,
        losses: r.losses,
        ties: r.ties,
        decklist: r.decklist,
        tournament: {
          id: r.tournamentId,
          name: r.tournamentName,
          date: r.tournamentDate.toISOString(),
          players: r.tournamentPlayers,
        },
      })),
    });
  });

  // GET /api/meta/archetypes/:archetypeId/analysis?days&online&bo1 — one
  // archetype's field position: score, rank, weighted threats/free wins, trend.
  routes.get('/archetypes/:archetypeId/analysis', async (c) => {
    const archetypeId = archetypeIdParamSchema.safeParse(c.req.param('archetypeId'));
    if (!archetypeId.success) return c.json({ error: 'Invalid archetype id' }, 400);
    const parsedQuery = metaWindowQuerySchema.safeParse(c.req.query());
    if (!parsedQuery.success) {
      return c.json({ error: 'Invalid query parameters', issues: parsedQuery.error.issues }, 400);
    }
    const { days, online, bo1 } = parsedQuery.data;
    const db = c.get('db');

    const { window, scores, matchupImportedAt } = await loadFieldScores(db, { days, online, bo1 });
    const score = scores.find((s) => s.archetypeId === archetypeId.data);
    const stats = window.archetypes.find((a) => a.archetypeId === archetypeId.data);
    if (!score || !stats) {
      return c.json({ error: 'Archetype not found in the selected window' }, 404);
    }

    const [listsRow, trend] = await Promise.all([
      db
        .select({ total: count() })
        .from(tournamentStandings)
        .innerJoin(tournaments, eq(tournamentStandings.tournamentId, tournaments.id))
        .where(
          and(
            eq(tournamentStandings.archetypeId, archetypeId.data),
            isNotNull(tournamentStandings.decklist),
            ...windowConditions({ days, online, bo1 }),
          ),
        ),
      // Weekly share/WR trend from the snapshots. Legacy rows (synced before the
      // archetype_id column existed) are matched by display name as a fallback.
      db
        .select({
          period: metaSnapshots.period,
          frequencyPct: metaSnapshots.frequencyPct,
          winRatePct: metaSnapshots.winRatePct,
        })
        .from(metaSnapshots)
        .where(
          and(
            gte(metaSnapshots.period, ROTATION_PERIOD),
            or(
              eq(metaSnapshots.archetypeId, archetypeId.data),
              and(
                isNull(metaSnapshots.archetypeId),
                eq(metaSnapshots.archetype, stats.archetypeName),
              ),
            ),
          ),
        )
        .orderBy(asc(metaSnapshots.period)),
    ]);

    return c.json({
      days,
      online,
      bo1,
      tournamentCount: window.tournamentCount,
      totalPlayers: window.totalPlayers,
      matchupImportedAt: matchupImportedAt?.toISOString() ?? null,
      archetype: stats,
      fieldScore: score,
      totalRanked: scores.length,
      listsAvailable: listsRow[0]?.total ?? 0,
      trend,
    });
  });

  return routes;
}
