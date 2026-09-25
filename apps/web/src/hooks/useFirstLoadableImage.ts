import { useEffect, useState } from 'react';

/**
 * Probes `urls` in order and returns the first one that loads, or null while
 * probing / when none loads. Used where an image cannot cascade itself via
 * <img onError> — e.g. a CSS background (DeckSpriteBackground). A new list
 * restarts the probe; answers for a superseded list are ignored.
 */
export function useFirstLoadableImage(urls: readonly string[]): string | null {
  const key = urls.join('\n');
  const [result, setResult] = useState<{ key: string; url: string | null }>({
    key: '',
    url: null,
  });

  useEffect(() => {
    let cancelled = false;
    const candidates = key === '' ? [] : key.split('\n');

    function probe(index: number): void {
      if (index >= candidates.length) {
        if (!cancelled) setResult({ key, url: null });
        return;
      }
      const url = candidates[index]!;
      const img = new Image();
      img.onload = () => {
        if (!cancelled) setResult({ key, url });
      };
      img.onerror = () => {
        if (!cancelled) probe(index + 1);
      };
      img.src = url;
    }

    probe(0);
    return () => {
      cancelled = true;
    };
  }, [key]);

  return result.key === key ? result.url : null;
}
