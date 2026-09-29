import { useEffect, useState } from 'react';
import {
  ApiError,
  getArchetypeAnalysis,
  type ArchetypeAnalysis,
  type MetaWindow,
} from '../lib/api';

type Loaded =
  | { key: string; data: ArchetypeAnalysis }
  | { key: string; notInWindow: boolean; error: string | null };

/**
 * Per-archetype analysis for a meta window (share, win rate, field score,
 * matchups, trend). A 404 means "not played in this window" and is reported
 * as `notInWindow`, not as an error. Request-key pattern like
 * useFieldAnalysis: a switch never shows the previous archetype's data.
 */
export function useArchetypeAnalysis(
  archetypeId: string | null,
  window: MetaWindow,
): {
  data: ArchetypeAnalysis | null;
  isLoading: boolean;
  notInWindow: boolean;
  error: string | null;
} {
  const { days, online, bo1 } = window;
  const requestKey = `${archetypeId}|${days}|${online}|${bo1}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (archetypeId === null) return;
    let cancelled = false;
    getArchetypeAnalysis(archetypeId, { days, online, bo1 })
      .then((data) => {
        if (!cancelled) setLoaded({ key: requestKey, data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const notInWindow = err instanceof ApiError && err.status === 404;
        setLoaded({
          key: requestKey,
          notInWindow,
          error: notInWindow ? null : err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [archetypeId, days, online, bo1, requestKey]);

  if (archetypeId === null)
    return { data: null, isLoading: false, notInWindow: false, error: null };
  const current = loaded?.key === requestKey ? loaded : null;
  if (current === null) return { data: null, isLoading: true, notInWindow: false, error: null };
  if ('data' in current)
    return { data: current.data, isLoading: false, notInWindow: false, error: null };
  return { data: null, isLoading: false, notInWindow: current.notInWindow, error: current.error };
}
