import { useEffect, useState } from 'react';
import { getFieldAnalysis, type FieldAnalysis, type MetaWindow } from '../lib/api';
import { useDashboardStore } from '../store/dashboardStore';

/**
 * Field analysis for one meta window (share, win rate, field score per
 * archetype). Each result is tagged with the request key it answers (window +
 * last sync), so a window switch shows a loading state instead of stale data
 * and late answers for an old window are dropped. Same pattern MetaPage uses.
 */
export function useFieldAnalysis(window: MetaWindow): {
  data: FieldAnalysis | null;
  isLoading: boolean;
  error: boolean;
} {
  const { lastSynced } = useDashboardStore();
  const { days, online, bo1 } = window;
  const requestKey = `${days}|${online}|${bo1}|${lastSynced?.getTime() ?? 0}`;

  const [loaded, setLoaded] = useState<{ key: string; data: FieldAnalysis } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getFieldAnalysis({ days, online, bo1 })
      .then((data) => {
        if (!cancelled) setLoaded({ key: requestKey, data });
      })
      .catch(() => {
        if (!cancelled) setFailedKey(requestKey);
      });
    return () => {
      cancelled = true;
    };
  }, [requestKey, days, online, bo1]);

  const data = loaded?.key === requestKey ? loaded.data : null;
  const error = failedKey === requestKey;
  return { data, isLoading: data === null && !error, error };
}
