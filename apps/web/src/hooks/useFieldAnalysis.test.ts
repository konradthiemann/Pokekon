import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FieldAnalysis, MetaWindow } from '../lib/api';
import { getFieldAnalysis } from '../lib/api';
import { useFieldAnalysis } from './useFieldAnalysis';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, getFieldAnalysis: vi.fn() };
});
vi.mock('../store/dashboardStore', () => ({
  useDashboardStore: () => ({ lastSynced: null }),
}));

const mocked = vi.mocked(getFieldAnalysis);
const W7: MetaWindow = { days: 7, online: true, bo1: true };
const W30: MetaWindow = { days: 30, online: true, bo1: true };
const analysis = (days: number) =>
  ({ days, online: true, bo1: true, archetypes: [] }) as unknown as FieldAnalysis;

beforeEach(() => {
  mocked.mockReset();
});

describe('useFieldAnalysis', () => {
  it('loads the analysis for the window', async () => {
    mocked.mockResolvedValue(analysis(7));
    const { result } = renderHook(() => useFieldAnalysis(W7));
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual(analysis(7)));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(false);
    expect(mocked).toHaveBeenCalledWith(W7);
  });

  it('reports an error without data', async () => {
    mocked.mockImplementation(() => Promise.reject(new Error('offline')));
    const { result } = renderHook(() => useFieldAnalysis(W7));
    await vi.waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('discards the answer of a superseded window', async () => {
    let resolveOld: (v: FieldAnalysis) => void = () => {};
    mocked
      .mockReturnValueOnce(new Promise((r) => (resolveOld = r)))
      .mockResolvedValueOnce(analysis(30));
    const { result, rerender } = renderHook(({ w }) => useFieldAnalysis(w), {
      initialProps: { w: W7 },
    });
    rerender({ w: W30 });
    await waitFor(() => expect(result.current.data).toEqual(analysis(30)));
    resolveOld(analysis(7));
    await Promise.resolve();
    expect(result.current.data).toEqual(analysis(30));
  });
});
