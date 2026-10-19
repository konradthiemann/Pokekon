import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getArchetypeLists, type ArchetypeListEntry, type MetaWindow } from '../lib/api';
import { useArchetypeLists } from './useArchetypeLists';

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  getArchetypeLists: vi.fn(),
}));
const mocked = vi.mocked(getArchetypeLists);
const W: MetaWindow = { days: 30, online: true, bo1: true };
const entry = (id: number) => ({ id }) as unknown as ArchetypeListEntry;
const page = (ids: number[], total: number) =>
  ({ lists: ids.map(entry), total }) as unknown as Awaited<ReturnType<typeof getArchetypeLists>>;

beforeEach(() => {
  mocked.mockReset();
});

describe('useArchetypeLists', () => {
  it('loads the first page with limit 4, offset 0', async () => {
    mocked.mockResolvedValue(page([1, 2, 3, 4], 9));
    const { result } = renderHook(() => useArchetypeLists('dragapult-ex', W));
    await waitFor(() => expect(result.current.lists).toHaveLength(4));
    expect(mocked).toHaveBeenCalledWith('dragapult-ex', { ...W, limit: 4, offset: 0 });
    expect(result.current.total).toBe(9);
    expect(result.current.isLoading).toBe(false);
  });

  it('loadMore appends the next page at offset = lists.length', async () => {
    mocked.mockResolvedValueOnce(page([1, 2, 3, 4], 6)).mockResolvedValueOnce(page([5, 6], 6));
    const { result } = renderHook(() => useArchetypeLists('dragapult-ex', W));
    await waitFor(() => expect(result.current.lists).toHaveLength(4));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.lists.map((l) => l.id)).toEqual([1, 2, 3, 4, 5, 6]));
    expect(mocked).toHaveBeenLastCalledWith('dragapult-ex', { ...W, limit: 4, offset: 4 });
  });

  it('keeps the loaded lists and flags loadMoreFailed when loading more fails', async () => {
    mocked
      .mockResolvedValueOnce(page([1, 2, 3, 4], 6))
      .mockImplementationOnce(() => Promise.reject(new Error('down')));
    const { result } = renderHook(() => useArchetypeLists('dragapult-ex', W));
    await waitFor(() => expect(result.current.lists).toHaveLength(4));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.loadMoreFailed).toBe(true));
    expect(result.current.lists).toHaveLength(4);
  });

  it('starts over for a new window', async () => {
    mocked.mockResolvedValueOnce(page([1, 2, 3, 4], 6)).mockResolvedValueOnce(page([9], 1));
    const { result, rerender } = renderHook(({ w }) => useArchetypeLists('dragapult-ex', w), {
      initialProps: { w: W },
    });
    await waitFor(() => expect(result.current.lists).toHaveLength(4));
    rerender({ w: { ...W, days: 7 } });
    await waitFor(() => expect(result.current.lists.map((l) => l.id)).toEqual([9]));
  });
});
