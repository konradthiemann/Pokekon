import type { MetaSnapshot, RecentTournament } from '../types';
import { upsertMetaSnapshot } from '../db/queries';

// ─── Limitless API types ──────────────────────────────────────────────────────

interface LimitlessTournament {
  id: string;
  name: string;
  format: string;
  players: number;
  date: string; // ISO timestamp
  organizerId: number;
}

interface LimitlessStanding {
  deck?: { id: string; name: string };
  record: { wins: number; losses: number; ties: number };
  placing: number | null;
}

// ─── Fetch helper (direct → CORS proxy fallback) ──────────────────────────────

const BASE = 'https://play.limitlesstcg.com';
const CORS_PROXY = 'https://corsproxy.io/?';

async function limitlessFetch(path: string): Promise<Response> {
  const url = `${BASE}${path}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return res;
    throw new Error(`HTTP ${res.status}`);
  } catch {
    return fetch(`${CORS_PROXY}${encodeURIComponent(url)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns an ISO 8601 week label like "2026-W15" for the given date.
 * The algorithm shifts the date to the nearest Thursday (`+4 - weekday`) because
 * ISO 8601 defines week 1 as the week containing the year's first Thursday, and
 * uses `|| 7` to remap Sunday (0) to 7 so the arithmetic stays correct for every day.
 */
function isoWeekLabel(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${week.toString().padStart(2, '0')}`;
}

/**
 * Heuristic: determine if a tournament is likely online-only by inspecting its name.
 * The Limitless API has no platform field, so this checks for terms like "online",
 * "ptcgl", "weekly", and "webcam". It will mis-classify edge cases (e.g. "Online
 * Qualifier" for an in-person event), so treat results as approximate filtering only.
 */
export function isLikelyOnline(t: LimitlessTournament): boolean {
  const n = t.name.toLowerCase();
  return (
    n.includes('online') ||
    n.includes(' live') ||
    n.includes('ptcgl') ||
    n.includes('ptcgo') ||
    n.includes('code') || // prize codes = online
    n.includes('weekly') ||
    n.includes('webcam')
  );
}

// ─── Recent tournaments ───────────────────────────────────────────────────────

/**
 * Fetch recent completed tournaments and their top archetype breakdowns.
 * Defaults to `onlineOnly: true` because online events are more frequent and produce
 * faster meta signal; pass `onlineOnly: false` to include in-person events.
 * The `isLikelyOnline` filter is name-based heuristic — not derived from player counts.
 */
export async function fetchRecentTournaments(
  options: { days?: number; minPlayers?: number; onlineOnly?: boolean } = {},
): Promise<RecentTournament[]> {
  const { days = 7, minPlayers = 30, onlineOnly = true } = options;

  const res = await limitlessFetch(
    '/api/tournaments?game=PTCG&completed=true&limit=100&format=standard',
  );
  if (!res.ok) throw new Error(`Tournament list fetch failed: ${res.status}`);
  const all: LimitlessTournament[] = await res.json();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const eligible = all.filter((t) => {
    const date = new Date(t.date);
    if (date < cutoff) return false;
    if (t.players < minPlayers) return false;
    if (onlineOnly && !isLikelyOnline(t)) return false;
    return true;
  });

  // For each eligible tournament, fetch standings to get archetype breakdown
  const results: RecentTournament[] = [];

  for (const t of eligible.slice(0, 15)) {
    // cap at 15 to avoid too many requests
    try {
      const res = await limitlessFetch(`/api/tournaments/${t.id}/standings`);
      if (!res.ok) {
        results.push({
          id: t.id,
          name: t.name,
          date: t.date,
          players: t.players,
          topArchetypes: [],
        });
        continue;
      }

      const standings: LimitlessStanding[] = await res.json();
      if (!Array.isArray(standings)) continue;

      // Aggregate archetype win rates
      const archMap = new Map<
        string,
        { displayName: string; wins: number; losses: number; count: number }
      >();
      for (const p of standings) {
        const id = p.deck?.id ?? 'other';
        const name = p.deck?.name ?? 'Other';
        const cur = archMap.get(id) ?? { displayName: name, wins: 0, losses: 0, count: 0 };
        cur.wins += p.record?.wins ?? 0;
        cur.losses += p.record?.losses ?? 0;
        cur.count++;
        archMap.set(id, cur);
      }

      const topArchetypes = [...archMap.values()]
        .filter((a) => a.displayName !== 'Other')
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map((a) => ({
          name: a.displayName,
          count: a.count,
          winRate: a.wins + a.losses > 0 ? Math.round((a.wins / (a.wins + a.losses)) * 100) : 50,
        }));

      results.push({ id: t.id, name: t.name, date: t.date, players: t.players, topArchetypes });
    } catch {
      results.push({ id: t.id, name: t.name, date: t.date, players: t.players, topArchetypes: [] });
    }
  }

  return results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// ─── Meta sync ────────────────────────────────────────────────────────────────

export interface MetaSyncResult {
  archetypes: number;
  tournaments: number;
  totalPlayers: number;
  period: string;
}

/**
 * Fetches standings from recent tournaments and persists archetype frequency/win-rate
 * data as `MetaSnapshot` rows for the current ISO week period.
 * Snapshots are upserted — existing periods are updated, new periods are appended.
 * History is never cleared, so callers can query multiple periods for trend analysis.
 */
export async function syncLiveMeta(onProgress?: (msg: string) => void): Promise<MetaSyncResult> {
  onProgress?.('Fetching recent tournaments…');

  const res = await limitlessFetch(
    '/api/tournaments?game=PTCG&completed=true&limit=50&format=standard',
  );
  if (!res.ok) throw new Error(`Tournament list fetch failed: ${res.status}`);
  const allTourneys: LimitlessTournament[] = await res.json();

  // Only include tournaments from the last 7 days with 30+ players (Standard format, post-G rotation)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const eligible = allTourneys
    .filter((t) => t.players >= 30 && new Date(t.date) >= sevenDaysAgo)
    .sort((a, b) => b.players - a.players)
    .slice(0, 6);

  if (eligible.length === 0) throw new Error('No tournaments with 30+ players found.');

  onProgress?.(`Found ${eligible.length} tournaments. Fetching standings…`);

  type ArchStat = {
    displayName: string;
    wins: number;
    losses: number;
    ties: number;
    playerCount: number;
  };
  const archMap = new Map<string, ArchStat>();
  let totalPlayers = 0;
  let successCount = 0;

  for (const t of eligible) {
    try {
      onProgress?.(`Loading ${t.name} (${t.players} players)…`);
      const res = await limitlessFetch(`/api/tournaments/${t.id}/standings`);
      if (!res.ok) continue;

      const standings: LimitlessStanding[] = await res.json();
      if (!Array.isArray(standings) || standings.length === 0) continue;

      successCount++;
      totalPlayers += standings.length;

      for (const player of standings) {
        const id = player.deck?.id ?? 'other';
        const displayName = player.deck?.name ?? 'Other';
        const existing = archMap.get(id) ?? {
          displayName,
          wins: 0,
          losses: 0,
          ties: 0,
          playerCount: 0,
        };
        existing.wins += player.record?.wins ?? 0;
        existing.losses += player.record?.losses ?? 0;
        existing.ties += player.record?.ties ?? 0;
        existing.playerCount++;
        archMap.set(id, existing);
      }
    } catch (err) {
      console.warn(`[metaFetch] Skipped ${t.id}:`, err);
    }
  }

  if (successCount === 0) throw new Error('Could not load standings for any tournament.');

  onProgress?.('Saving meta data…');
  const period = isoWeekLabel(new Date());
  const sourceNote = `Limitless TCG · ${successCount} tournaments · ${totalPlayers} players`;

  const snapshots: Omit<MetaSnapshot, 'id'>[] = [];
  for (const [, s] of archMap) {
    if (s.playerCount < 2) continue;
    const frequencyPct = parseFloat(((s.playerCount / totalPlayers) * 100).toFixed(1));
    const decisive = s.wins + s.losses;
    const winRatePct = decisive > 0 ? Math.round((s.wins / decisive) * 100) : null;
    snapshots.push({
      archetype: s.displayName,
      frequencyPct,
      winRatePct,
      wins: s.wins,
      losses: s.losses,
      playerCount: s.playerCount,
      period,
      sourceNote,
    });
  }

  for (const snap of snapshots) await upsertMetaSnapshot(snap);

  return { archetypes: snapshots.length, tournaments: successCount, totalPlayers, period };
}
