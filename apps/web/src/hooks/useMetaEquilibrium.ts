import { useEffect, useState } from 'react';
import { getMetaEquilibrium, type MetaEquilibriumResponse } from '../lib/api';

/**
 * Precomputed game-theoretic equilibrium for a window (plan
 * meta-game-theory-layer.md §3.8). Same request-key pattern as
 * useFieldAnalysis: a days change shows loading instead of a stale window's
 * data, and a failed key retries once the days differ. Shared by MetaPage and
 * the coach Tools page.
 */
export function useMetaEquilibrium(days: number): {
  data: MetaEquilibriumResponse | null;
  error: boolean;
} {
  const requestKey = String(days);
  const [loaded, setLoaded] = useState<{ key: string; data: MetaEquilibriumResponse } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMetaEquilibrium(days)
      .then((data) => {
        if (!cancelled) setLoaded({ key: requestKey, data });
      })
      .catch(() => {
        if (!cancelled) setFailedKey(requestKey);
      });
    return () => {
      cancelled = true;
    };
  }, [days, requestKey]);

  return {
    data: loaded?.key === requestKey ? loaded.data : null,
    error: failedKey === requestKey,
  };
}
