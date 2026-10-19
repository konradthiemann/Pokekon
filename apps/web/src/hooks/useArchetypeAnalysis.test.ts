import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  getArchetypeAnalysis,
  type ArchetypeAnalysis,
  type MetaWindow,
} from '../lib/api';
import { useArchetypeAnalysis } from './useArchetypeAnalysis';

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  getArchetypeAnalysis: vi.fn(),
}));
const mocked = vi.mocked(getArchetypeAnalysis);
const W: MetaWindow = { days: 30, online: true, bo1: true };
const res = (id: string) => ({ archetypeId: id }) as unknown as ArchetypeAnalysis;

beforeEach(() => {
  mocked.mockReset();
});

describe('useArchetypeAnalysis', () => {
  it('loads the analysis for archetype + window', async () => {
    mocked.mockResolvedValue(res('dragapult-ex'));
    const { result } = renderHook(() => useArchetypeAnalysis('dragapult-ex', W));
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual(res('dragapult-ex')));
    expect(mocked).toHaveBeenCalledWith('dragapult-ex', W);
    expect(result.current.isLoading).toBe(false);
  });

  it('reports notInWindow on a 404, not a generic error', async () => {
    mocked.mockImplementation(() => Promise.reject(new ApiError(404, { error: 'Not found' })));
    const { result } = renderHook(() => useArchetypeAnalysis('dragapult-ex', W));
    await waitFor(() => expect(result.current.notInWindow).toBe(true));
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('reports a generic error message for other failures', async () => {
    mocked.mockImplementation(() => Promise.reject(new Error('boom')));
    const { result } = renderHook(() => useArchetypeAnalysis('dragapult-ex', W));
    await waitFor(() => expect(result.current.error).toBe('boom'));
    expect(result.current.notInWindow).toBe(false);
  });

  it('drops the answer of a superseded archetype or window', async () => {
    let resolveOld: (v: ArchetypeAnalysis) => void = () => {};
    mocked
      .mockReturnValueOnce(new Promise((r) => (resolveOld = r)))
      .mockResolvedValueOnce(res('n-zoroark'));
    const { result, rerender } = renderHook(({ id }) => useArchetypeAnalysis(id, W), {
      initialProps: { id: 'dragapult-ex' },
    });
    rerender({ id: 'n-zoroark' });
    await waitFor(() => expect(result.current.data).toEqual(res('n-zoroark')));
    resolveOld(res('dragapult-ex'));
    await Promise.resolve();
    expect(result.current.data).toEqual(res('n-zoroark'));
  });

  it('does not fetch without an archetype', () => {
    const { result } = renderHook(() => useArchetypeAnalysis(null, W));
    expect(mocked).not.toHaveBeenCalled();
    expect(result.current).toEqual({
      data: null,
      isLoading: false,
      notInWindow: false,
      error: null,
    });
  });
});
