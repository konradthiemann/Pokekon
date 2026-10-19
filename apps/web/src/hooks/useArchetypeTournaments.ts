import { useEffect, useState } from 'react';
import {
  getArchetypeTournaments,
  type ArchetypeTournamentsResponse,
  type MetaWindow,
} from '../lib/api';

type Tournament = ArchetypeTournamentsResponse['tournaments'][number];

/**
 * Tournaments the archetype was played at in the window (the per-tournament
 * best-list picker). Its own failure domain: a failed load yields [] and never
 * breaks the page (same as ArchetypeDetail's separate effect).
 */
export function useArchetypeTournaments(
  archetypeId: string | null,
  window: MetaWindow,
): Tournament[] {
  const { days, online, bo1 } = window;
  const requestKey = `${archetypeId}|${days}|${online}|${bo1}`;
  const [loaded, setLoaded] = useState<{ key: string; tournaments: Tournament[] } | null>(null);

  useEffect(() => {
    if (archetypeId === null) return;
    let cancelled = false;
    getArchetypeTournaments(archetypeId, { days, online, bo1 })
      .then((res) => {
        if (!cancelled) setLoaded({ key: requestKey, tournaments: res.tournaments });
      })
      .catch((err: unknown) => {
        if (!cancelled) console.warn('[useArchetypeTournaments] load failed:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [archetypeId, days, online, bo1, requestKey]);

  return loaded?.key === requestKey ? loaded.tournaments : [];
}
