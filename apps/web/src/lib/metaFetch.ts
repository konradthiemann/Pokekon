import type { RecentTournament } from '../types';
import { isPostRotation } from '../constants/season';
import i18n from '../i18n';

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

// ─── Standings summary ─────────────────────────────────────────────────────────

export interface TopArchetype {
  name: string;
  count: number;
  winRate: number;
}

/**
 * Summarises a tournament's standings into the top archetypes (by player count)
 * and the winning archetype (1st place).
 *
 * The winner is the deck of the standing with `placing === 1` (falling back to
 * the first standing, since Limitless returns them in finishing order). If that
 * winner is **not** among the top-5-by-count, it replaces the 5th entry — so the
 * trophy deck is always visible. Names use the Limitless display name; "Other"
 * (unknown deck) is excluded from the list and never treated as a winner.
 */
export function summarizeStandings(standings: LimitlessStanding[]): {
  topArchetypes: TopArchetype[];
  winnerArchetype: string | null;
} {
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

  const ranked: TopArchetype[] = [...archMap.values()]
    .filter((a) => a.displayName !== 'Other')
    .sort((a, b) => b.count - a.count)
    .map((a) => ({
      name: a.displayName,
      count: a.count,
      winRate: a.wins + a.losses > 0 ? Math.round((a.wins / (a.wins + a.losses)) * 100) : 50,
    }));

  const winnerStanding = standings.find((s) => s.placing === 1) ?? standings[0];
  const winnerName = winnerStanding?.deck?.name;
  const winnerArchetype = winnerName && winnerName !== 'Other' ? winnerName : null;

  let topArchetypes = ranked.slice(0, 5);
  if (winnerArchetype && !topArchetypes.some((a) => a.name === winnerArchetype)) {
    const winnerEntry = ranked.find((a) => a.name === winnerArchetype);
    // Replace the 5th slot with the winner, keeping the four most-played decks.
    if (winnerEntry) topArchetypes = [...topArchetypes.slice(0, 4), winnerEntry];
  }

  return { topArchetypes, winnerArchetype };
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
  if (!res.ok)
    throw new Error(i18n.t('layout:sync.errors.tournamentListFailed', { status: res.status }));
  const all: LimitlessTournament[] = await res.json();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const eligible = all.filter((t) => {
    const date = new Date(t.date);
    if (!isPostRotation(date)) return false;
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
          winnerArchetype: null,
        });
        continue;
      }

      const standings: LimitlessStanding[] = await res.json();
      if (!Array.isArray(standings)) continue;

      const { topArchetypes, winnerArchetype } = summarizeStandings(standings);

      results.push({
        id: t.id,
        name: t.name,
        date: t.date,
        players: t.players,
        topArchetypes,
        winnerArchetype,
      });
    } catch {
      results.push({
        id: t.id,
        name: t.name,
        date: t.date,
        players: t.players,
        topArchetypes: [],
        winnerArchetype: null,
      });
    }
  }

  return results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
