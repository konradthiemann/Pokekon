import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFirstLoadableImage } from './useFirstLoadableImage';

// Controllable Image stub: each created image registers itself; the test
// decides which URLs load and which fail.
let created: FakeImage[] = [];
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  constructor() {
    created.push(this);
  }
}
function settle(url: string, ok: boolean) {
  const img = created.find((i) => i.src === url);
  if (!img) throw new Error(`no probe for ${url}`);
  act(() => (ok ? img.onload?.() : img.onerror?.()));
}

beforeEach(() => {
  created = [];
  vi.stubGlobal('Image', FakeImage);
});
afterEach(() => vi.unstubAllGlobals());

describe('useFirstLoadableImage', () => {
  it('returns the first URL once it loads', () => {
    const { result } = renderHook(() => useFirstLoadableImage(['a.png', 'b.png']));
    expect(result.current).toBeNull();
    settle('a.png', true);
    expect(result.current).toBe('a.png');
  });

  it('falls through to the second URL when the first fails', () => {
    const { result } = renderHook(() => useFirstLoadableImage(['a.png', 'b.png']));
    settle('a.png', false);
    settle('b.png', true);
    expect(result.current).toBe('b.png');
  });

  it('returns null when every candidate fails', () => {
    const { result } = renderHook(() => useFirstLoadableImage(['a.png', 'b.png']));
    settle('a.png', false);
    settle('b.png', false);
    expect(result.current).toBeNull();
  });

  it('restarts for a new URL list and ignores late answers of the old one', () => {
    const { result, rerender } = renderHook(({ urls }) => useFirstLoadableImage(urls), {
      initialProps: { urls: ['old.png'] },
    });
    rerender({ urls: ['new.png'] });
    settle('old.png', true);
    expect(result.current).toBeNull();
    settle('new.png', true);
    expect(result.current).toBe('new.png');
  });

  it('returns null for an empty list', () => {
    const { result } = renderHook(() => useFirstLoadableImage([]));
    expect(result.current).toBeNull();
  });
});
