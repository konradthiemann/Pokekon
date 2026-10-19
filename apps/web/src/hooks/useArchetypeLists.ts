import { useCallback, useEffect, useState } from 'react';
import { getArchetypeLists, type ArchetypeListEntry, type MetaWindow } from '../lib/api';

const DEFAULT_PAGE_SIZE = 4;

interface Loaded {
  key: string;
  lists: ArchetypeListEntry[];
  total: number;
}

/**
 * Published tournament lists of an archetype, paged ("load more"). A window or
 * archetype change starts over; a failed "load more" keeps what is loaded.
 */
export function useArchetypeLists(
  archetypeId: string | null,
  window: MetaWindow,
  pageSize = DEFAULT_PAGE_SIZE,
): {
  lists: ArchetypeListEntry[];
  total: number;
  isLoading: boolean;
  loadMore: () => void;
  isLoadingMore: boolean;
  loadMoreFailed: boolean;
} {
  const { days, online, bo1 } = window;
  const requestKey = `${archetypeId}|${days}|${online}|${bo1}|${pageSize}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);

  useEffect(() => {
    if (archetypeId === null) return;
    let cancelled = false;
    getArchetypeLists(archetypeId, { days, online, bo1, limit: pageSize, offset: 0 })
      .then((res) => {
        if (!cancelled) setLoaded({ key: requestKey, lists: res.lists, total: res.total });
      })
      .catch(() => {
        if (!cancelled) setFailedKey(requestKey);
      });
    return () => {
      cancelled = true;
    };
  }, [archetypeId, days, online, bo1, pageSize, requestKey]);

  const current = loaded?.key === requestKey ? loaded : null;

  const loadMore = useCallback(() => {
    if (archetypeId === null || current === null) return;
    setIsLoadingMore(true);
    setLoadMoreFailed(false);
    getArchetypeLists(archetypeId, {
      days,
      online,
      bo1,
      limit: pageSize,
      offset: current.lists.length,
    })
      .then((res) => {
        setLoaded((prev) =>
          prev !== null && prev.key === requestKey
            ? { ...prev, lists: [...prev.lists, ...res.lists], total: res.total }
            : prev,
        );
      })
      .catch(() => setLoadMoreFailed(true))
      .finally(() => setIsLoadingMore(false));
  }, [archetypeId, current, days, online, bo1, pageSize, requestKey]);

  return {
    lists: current?.lists ?? [],
    total: current?.total ?? 0,
    isLoading: archetypeId !== null && current === null && failedKey !== requestKey,
    loadMore,
    isLoadingMore,
    loadMoreFailed,
  };
}
