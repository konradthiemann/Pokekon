import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMetaEquilibrium, type MetaEquilibriumResponse } from '../lib/api';
import { useMetaEquilibrium } from './useMetaEquilibrium';

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  getMetaEquilibrium: vi.fn(),
}));
const mocked = vi.mocked(getMetaEquilibrium);
const res = (days: number) => ({ windowDays: days }) as unknown as MetaEquilibriumResponse;

beforeEach(() => {
  mocked.mockReset();
});

describe('useMetaEquilibrium', () => {
  it('loads the equilibrium for the window days', async () => {
    mocked.mockResolvedValue(res(30));
    const { result } = renderHook(() => useMetaEquilibrium(30));
    await waitFor(() => expect(result.current.data).toEqual(res(30)));
    expect(mocked).toHaveBeenCalledWith(30);
    expect(result.current.error).toBe(false);
  });

  it('reports an error instead of loading forever', async () => {
    mocked.mockImplementation(() => Promise.reject(new Error('down')));
    const { result } = renderHook(() => useMetaEquilibrium(30));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('drops the answer of a superseded window', async () => {
    let resolveOld: (v: MetaEquilibriumResponse) => void = () => {};
    mocked.mockReturnValueOnce(new Promise((r) => (resolveOld = r))).mockResolvedValueOnce(res(14));
    const { result, rerender } = renderHook(({ d }) => useMetaEquilibrium(d), {
      initialProps: { d: 30 },
    });
    rerender({ d: 14 });
    await waitFor(() => expect(result.current.data).toEqual(res(14)));
    resolveOld(res(30));
    await Promise.resolve();
    expect(result.current.data).toEqual(res(14));
  });
});
