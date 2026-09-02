import { and, asc, count, desc, eq, gte, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import {
  computeFieldScores,
  computeMetaSnapshots,
  detectMatchupConflicts,
  MATCHUP_CONFLICT_THRESHOLD_PP,
  MIN_MATCHUP_GAMES,
  OTHER_ARCHETYPE_ID,
  ROTATION_PERIOD,
  tournamentWinRatePct,
  type ArchetypeShare,
  type FieldScore,
  type MatchupCell,
  type MatchupConflict,
  type MatchupRow,
  type StandingLite,
} from '@pokekon/shared';
import type { Db } from '../db/index.js';
import {
  metaSnapshots,
  tournamentMatchups,
  tournamentStandings,
  tournaments,
} from '../db/schema.js';
import { runMetaSync } from '../jobs/syncMeta.js';
import { loadCardStats } from '../lib/cardStatsData.js';
import { ensureMatchups } from '../lib/matchupData.js';
import { rateLimit } from '../lib/rateLimit.js';
import { windowStartDays } from '../lib/timeWindow.js';
import type { ApiEnv } from '../middleware/session.js';
import {
  archetypeIdParamSchema,
  archetypeListsQuerySchema,
  cardStatsQuerySchema,
  metaWindowQuerySchema,
  snapCardStatsWindow,
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
    ties: number;
    playerCount: number;
    /** Pokémon sprite slugs (Limitless deck.icons), data-driven; [] if none. */
    icons: string[];
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
 *  count — the metashare and win rate then mirror local Challenge/Cup play.
 *  The date condition is unconditional, so the array is never empty and
 *  `and(...windowConditions(w))` can never collapse to an unfiltered query. */
export function windowConditions({ days, online, bo1 }: MetaWindow) {
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
      icons: tournamentStandings.icons,
      wins: tournamentStandings.wins,
      losses: tournamentStandings.losses,
      ties: tournamentStandings.ties,
    })
    .from(tournamentStandings)
    .innerJoin(tournaments, eq(tournamentStandings.tournamentId, tournaments.id))
    .where(and(...windowConditions(window)));

  const standings: StandingLite[] = rows.map((r) => ({
    deck: r.icons
      ? { id: r.archetypeId, name: r.archetypeName, icons: r.icons }
      : { id: r.archetypeId, name: r.archetypeName },
    record: { wins: r.wins, losses: r.losses, ties: r.ties },
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
      ties: s.ties,
      playerCount: s.playerCount,
      icons: s.icons,
    })),
  };
}

/** Own matchup data for the window (real online-Bo1 head-to-heads from
 *  tournament_matchups) blended with the external TrainerHill matrix as a
 *  fallback for pairs the own data doesn't cover with enough games. */
interface MatchupData {
  cells: MatchupCell[]; // fed to computeFieldScores
  rows: MatchupRow[]; // full directed rows for the matrix UI
  /** How the blend broke down, so the UI can flag real vs approximate coverage. */
  ownPairs: number;
  fallbackPairs: number;
  ownGames: number;
  trainerHillImportedAt: Date | null;
  /** Pairs where our own data (which overrode the fallback) and TrainerHill
   *  disagree by more than the conflict threshold — a hint, not an auto-fix
   *  (plan §3.3). The displayed `rows[]` win rate is unaffected either way. */
  conflicts: MatchupConflict[];
  conflictCount: number;
}

/** A directed matchup row from a head-to-head count. Win rate uses the shared
 *  tournament formula (a tie counts as a third of a win); `total` counts all
 *  games incl. ties. Falls back to 50 when there is no game at all. */
function directedRow(
  deck1: string,
  deck2: string,
  wins: number,
  losses: number,
  ties: number,
): MatchupRow {
  return {
    deck1,
    deck2,
    wins,
    losses,
    ties,
    total: wins + losses + ties,
    winRate: tournamentWinRatePct(wins, losses, ties, 1) ?? 50,
  };
}

async function loadMatchupData(db: Db, window: MetaWindow): Promise<MatchupData> {
  const [ownRows, trainerHill] = await Promise.all([
    db
      .select({
        deckA: tournamentMatchups.deckA,
        deckB: tournamentMatchups.deckB,
        aWins: tournamentMatchups.aWins,
        bWins: tournamentMatchups.bWins,
        ties: tournamentMatchups.ties,
      })
      .from(tournamentMatchups)
      .innerJoin(tournaments, eq(tournamentMatchups.tournamentId, tournaments.id))
      .where(and(...windowConditions(window))),
    ensureMatchups(db),
  ]);

  // Sum the per-tournament rows into one aggregate per canonical pair.
  const agg = new Map<
    string,
    { deckA: string; deckB: string; aWins: number; bWins: number; ties: number }
  >();
  for (const r of ownRows) {
    const key = `${r.deckA}|${r.deckB}`;
    const e = agg.get(key) ?? { deckA: r.deckA, deckB: r.deckB, aWins: 0, bWins: 0, ties: 0 };
    e.aWins += r.aWins;
    e.bWins += r.bWins;
    e.ties += r.ties;
    agg.set(key, e);
  }

  // Start from TrainerHill (fallback), then overlay own directed pairs that have
  // enough games — so a thin own sample never shadows a rich external one.
  const byKey = new Map<string, { row: MatchupRow; own: boolean }>();
  for (const r of trainerHill.rows) {
    byKey.set(`${r.deck1}|${r.deck2}`, { row: { ...r }, own: false });
  }
  let ownGames = 0;
  const ownDirectedRows: MatchupRow[] = [];
  for (const e of agg.values()) {
    ownGames += e.aWins + e.bWins + e.ties;
    const ab = directedRow(e.deckA, e.deckB, e.aWins, e.bWins, e.ties);
    const ba = directedRow(e.deckB, e.deckA, e.bWins, e.aWins, e.ties);
    ownDirectedRows.push(ab, ba);
    if (ab.total >= MIN_MATCHUP_GAMES) byKey.set(`${e.deckA}|${e.deckB}`, { row: ab, own: true });
    if (ba.total >= MIN_MATCHUP_GAMES) byKey.set(`${e.deckB}|${e.deckA}`, { row: ba, own: true });
  }

  const rows: MatchupRow[] = [];
  const cells: MatchupCell[] = [];
  let ownPairs = 0;
  let fallbackPairs = 0;
  for (const { row, own } of byKey.values()) {
    rows.push(row);
    cells.push({
      deck1: row.deck1,
      deck2: row.deck2,
      total: row.total,
      winRate: row.winRate,
      wins: row.wins,
      losses: row.losses,
      ties: row.ties,
    });
    if (own) ownPairs += 1;
    else fallbackPairs += 1;
  }

  // Compared against the untouched TrainerHill rows (before the overlay above
  // could shadow a pair) — a conflict never changes what `rows[]` displays.
  const allConflicts = detectMatchupConflicts(ownDirectedRows, trainerHill.rows);
  if (allConflicts.length > 0) {
    console.warn(
      `[meta] ${allConflicts.length} matchup conflicts > ${MATCHUP_CONFLICT_THRESHOLD_PP}pp between own data and TrainerHill`,
    );
  }

  return {
    cells,
    rows,
    ownPairs,
    fallbackPairs,
    ownGames,
    trainerHillImportedAt: trainerHill.importedAt,
    conflicts: allConflicts.slice(0, 25),
    conflictCount: allConflicts.length,
  };
}

/** Field scores for every archetype in the window ('other' participates as an
 *  opponent but is never ranked as a subject — it is not a playable deck). */
async function loadFieldScores(
  db: Db,
  window: MetaWindow,
): Promise<{ window: WindowAggregates; scores: FieldScore[]; matchup: MatchupData }> {
  const [aggregates, matchup] = await Promise.all([
    loadWindowAggregates(db, window),
    loadMatchupData(db, window),
  ]);
  const shares: ArchetypeShare[] = aggregates.archetypes.map((a) => ({
    archetypeId: a.archetypeId,
    archetypeName: a.archetypeName,
    sharePct: a.sharePct,
  }));
  // Real online-Bo1 head-to-heads (own matrix) drive the field score, with
  // TrainerHill only filling coverage gaps (see loadMatchupData).
  const scores = computeFieldScores(shares, matchup.cells).filter(
    (s) => s.archetypeId !== OTHER_ARCHETYPE_ID,
  );
  // Re-rank after dropping 'other' so ranks stay dense (1..n).
  scores.forEach((s, i) => {
    s.rank = i + 1;
  });
  return { window: aggregates, scores, matchup };
}

/** The matchup-source breakdown shape returned to clients so they can flag how
 *  much of a field score rests on real match data vs the external approximation. */
function matchupSourceJson(m: MatchupData) {
  return {
    ownPairs: m.ownPairs,
    fallbackPairs: m.fallbackPairs,
    ownGames: m.ownGames,
    trainerHillImportedAt: m.trainerHillImportedAt?.toISOString() ?? null,
    conflictCount: m.conflictCount,
    conflicts: m.conflicts,
  };
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
      console.error('[meta] sync failed:', err);
      // A Limitless rate-limit (429) is transient and self-resolving: report it as
      // a 429 with a calm retry hint (the client localises status 429) instead of
      // a scary 502 carrying a raw upstream URL. Other upstream fetch errors stay
      // actionable; anything else (e.g. a DB driver error) stays server-side (L2).
      if (err instanceof Error && err.message.includes('429')) {
        return c.json({ error: 'Meta sync is rate-limited right now — try again shortly.' }, 429);
      }
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

    const { window, scores, matchup } = await loadFieldScores(c.get('db'), {
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
      // Kept for the "data date" footer; matchupSource carries the real-vs-approx blend.
      matchupImportedAt: matchup.trainerHillImportedAt?.toISOString() ?? null,
      matchupSource: matchupSourceJson(matchup),
      archetypes: scores.map((s) => {
        const stats = statsById.get(s.archetypeId);
        return {
          archetypeId: s.archetypeId,
          archetypeName: s.archetypeName,
          sharePct: s.sharePct,
          winRatePct: stats?.winRatePct ?? null,
          wins: stats?.wins ?? 0,
          losses: stats?.losses ?? 0,
          ties: stats?.ties ?? 0,
          playerCount: stats?.playerCount ?? 0,
          icons: stats?.icons ?? [],
          fieldWinRatePct: s.fieldWinRatePct,
          fieldWinRateLowPct: s.fieldWinRateLowPct,
          fieldWinRateHighPct: s.fieldWinRateHighPct,
          coveragePct: s.coveragePct,
          rank: s.rank,
        };
      }),
    });
  });

  // GET /api/meta/matchups?days&online&bo1 — the windowed head-to-head matrix:
  // real online-Bo1 results (own data) with TrainerHill filling coverage gaps.
  // Unlike the legacy /api/matchups (external TrainerHill batch, no window), this
  // respects the same day/scope window as the metashare, so the matrix and the
  // shares always describe the same field.
  routes.get('/matchups', async (c) => {
    const parsedQuery = metaWindowQuerySchema.safeParse(c.req.query());
    if (!parsedQuery.success) {
      return c.json({ error: 'Invalid query parameters', issues: parsedQuery.error.issues }, 400);
    }
    const { days, online, bo1 } = parsedQuery.data;
    const matchup = await loadMatchupData(c.get('db'), { days, online, bo1 });
    return c.json({
      days,
      online,
      bo1,
      matchupSource: matchupSourceJson(matchup),
      rows: matchup.rows,
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
          matchResults: tournamentStandings.matchResults,
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
        matchResults: r.matchResults ?? [],
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

    const { window, scores, matchup } = await loadFieldScores(db, { days, online, bo1 });
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
      // Weekly share/WR trend from the snapshots — always all-history since
      // rotation, deliberately NOT filtered by the day window (it is a time
      // series). Legacy rows (synced before archetype_id existed) match by name.
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
      matchupImportedAt: matchup.trainerHillImportedAt?.toISOString() ?? null,
      matchupSource: matchupSourceJson(matchup),
      archetype: stats,
      fieldScore: score,
      // Data-driven icons for every field archetype, so the drilldown's matchup
      // table can render opponent icons from the source (not just a static map).
      iconsById: Object.fromEntries(
        window.archetypes.filter((a) => a.icons.length > 0).map((a) => [a.archetypeId, a.icons]),
      ),
      totalRanked: scores.length,
      listsAvailable: listsRow[0]?.total ?? 0,
      trend,
    });
  });

  // GET /api/meta/archetypes/:archetypeId/card-stats?days — precomputed
  // per-card performance deltas for one archetype (plan §3.6, step 9). Reads
  // ONLY (jobs/computeCardStats.ts writes archetype_card_stats); `days` is
  // snapped to the nearest precomputed window, and an archetype that was
  // never computed serves 200 with `cards: []`/`computedAt: null` (cold
  // start, no 404 — same reasoning as every other /api/meta/* reader).
  // Scope is always the default online-Bo1 scope (plan section 5), so unlike
  // the sibling routes above there is no online/bo1 query param here.
  routes.get('/archetypes/:archetypeId/card-stats', async (c) => {
    const archetypeId = archetypeIdParamSchema.safeParse(c.req.param('archetypeId'));
    if (!archetypeId.success) return c.json({ error: 'Invalid archetype id' }, 400);
    const parsedQuery = cardStatsQuerySchema.safeParse(c.req.query());
    if (!parsedQuery.success) {
      return c.json({ error: 'Invalid query parameters', issues: parsedQuery.error.issues }, 400);
    }
    const windowDays = snapCardStatsWindow(parsedQuery.data.days);

    const batch = await loadCardStats(c.get('db'), archetypeId.data, windowDays);

    return c.json({
      archetypeId: archetypeId.data,
      windowDays: batch.windowDays,
      online: true,
      bo1: true,
      computedAt: batch.computedAt?.toISOString() ?? null,
      listsAnalyzed: batch.listsAnalyzed,
      cards: batch.cards,
    });
  });

  return routes;
}
