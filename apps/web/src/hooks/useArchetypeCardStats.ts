import { useEffect, useState } from 'react';
import { fetchArchetypeCardStats, type ArchetypeCardStatsResponse } from '../lib/api';

/**
 * Precomputed per-card statistics of an archetype (archetype_card_stats).
 * The server snaps `days` to its precomputed windows (7/14/21/28) and always
 * uses online Bo1 — the response's `windowDays` says which window it is.
 */
export function useArchetypeCardStats(
  archetypeId: string | null,
  days: number,
): { data: ArchetypeCardStatsResponse | null; isLoading: boolean; error: boolean } {
  const requestKey = `${archetypeId}|${days}`;
  const [loaded, setLoaded] = useState<{ key: string; data: ArchetypeCardStatsResponse } | null>(
    null,
  );
  const [failedKey, setFailedKey] = useState<string | null>(null);

  useEffect(() => {
    if (archetypeId === null) return;
    let cancelled = false;
    fetchArchetypeCardStats(archetypeId, days)
      .then((data) => {
        if (!cancelled) setLoaded({ key: requestKey, data });
      })
      .catch(() => {
        if (!cancelled) setFailedKey(requestKey);
      });
    return () => {
      cancelled = true;
    };
  }, [archetypeId, days, requestKey]);

  if (archetypeId === null) return { data: null, isLoading: false, error: false };
  const data = loaded?.key === requestKey ? loaded.data : null;
  const error = failedKey === requestKey;
  return { data, isLoading: data === null && !error, error };
}
