import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchArchetypeCardStats, type ArchetypeCardStatsResponse } from '../lib/api';
import { useArchetypeCardStats } from './useArchetypeCardStats';

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  fetchArchetypeCardStats: vi.fn(),
}));
const mocked = vi.mocked(fetchArchetypeCardStats);
const res = (days: number) =>
  ({ windowDays: days, cards: [] }) as unknown as ArchetypeCardStatsResponse;

beforeEach(() => {
  mocked.mockReset();
});

describe('useArchetypeCardStats', () => {
  it('loads the card stats for archetype and days', async () => {
    mocked.mockResolvedValue(res(28));
    const { result } = renderHook(() => useArchetypeCardStats('dragapult-ex', 30));
    await waitFor(() => expect(result.current.data).toEqual(res(28)));
    expect(mocked).toHaveBeenCalledWith('dragapult-ex', 30);
    expect(result.current.isLoading).toBe(false);
  });

  it('reports an error', async () => {
    mocked.mockImplementation(() => Promise.reject(new Error('down')));
    const { result } = renderHook(() => useArchetypeCardStats('dragapult-ex', 30));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('drops the answer of a superseded request', async () => {
    let resolveOld: (v: ArchetypeCardStatsResponse) => void = () => {};
    mocked.mockReturnValueOnce(new Promise((r) => (resolveOld = r))).mockResolvedValueOnce(res(7));
    const { result, rerender } = renderHook(({ d }) => useArchetypeCardStats('dragapult-ex', d), {
      initialProps: { d: 30 },
    });
    rerender({ d: 7 });
    await waitFor(() => expect(result.current.data).toEqual(res(7)));
    resolveOld(res(28));
    await Promise.resolve();
    expect(result.current.data).toEqual(res(7));
  });

  it('does not fetch without an archetype', () => {
    const { result } = renderHook(() => useArchetypeCardStats(null, 30));
    expect(mocked).not.toHaveBeenCalled();
    expect(result.current).toEqual({ data: null, isLoading: false, error: false });
  });
});
