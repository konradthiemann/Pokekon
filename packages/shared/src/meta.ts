// Pure tournament-meta aggregation, shared by the server sync job (producer) and
// the web meta views (consumer contract). No I/O here — callers fetch standings.

/** A tournament standing row, as far as meta aggregation cares. */
export interface StandingLite {
  deck?: { id: string; name: string };
  record?: { wins: number; losses: number; ties?: number };
}

/** One aggregated archetype row for a period (the insert/wire shape, sans id). */
export interface MetaSnapshotData {
  archetype: string;
  frequencyPct: number; // 0–100, one decimal
  winRatePct: number | null; // 0–100, null when no decisive games
  wins: number;
  losses: number;
  playerCount: number;
  period: string; // ISO week, e.g. "2026-W15"
  sourceNote: string;
}

/** Summary of a meta sync run. */
export interface MetaSyncResult {
  archetypes: number;
  tournaments: number;
  totalPlayers: number;
  period: string;
}

/**
 * Aggregate per-tournament standings into archetype meta snapshots for one period.
 * Archetypes with fewer than `minPlayerCount` pilots are dropped as noise. Win rate
 * is wins/(wins+losses) (ties excluded), null when no decisive games. Frequency is
 * the archetype's share of all counted players.
 */
export function computeMetaSnapshots(
  tournaments: StandingLite[][],
  period: string,
  sourceNote: string,
  minPlayerCount = 2,
): { snapshots: MetaSnapshotData[]; totalPlayers: number; tournamentCount: number } {
  const archMap = new Map<
    string,
    { displayName: string; wins: number; losses: number; playerCount: number }
  >();
  let totalPlayers = 0;
  let tournamentCount = 0;

  for (const standings of tournaments) {
    if (!Array.isArray(standings) || standings.length === 0) continue;
    tournamentCount += 1;
    totalPlayers += standings.length;
    for (const p of standings) {
      const id = p.deck?.id ?? 'other';
      const displayName = p.deck?.name ?? 'Other';
      const e = archMap.get(id) ?? { displayName, wins: 0, losses: 0, playerCount: 0 };
      e.wins += p.record?.wins ?? 0;
      e.losses += p.record?.losses ?? 0;
      e.playerCount += 1;
      archMap.set(id, e);
    }
  }

  const snapshots: MetaSnapshotData[] = [];
  for (const s of archMap.values()) {
    if (s.playerCount < minPlayerCount) continue;
    const frequencyPct =
      totalPlayers > 0 ? parseFloat(((s.playerCount / totalPlayers) * 100).toFixed(1)) : 0;
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
  return { snapshots, totalPlayers, tournamentCount };
}
