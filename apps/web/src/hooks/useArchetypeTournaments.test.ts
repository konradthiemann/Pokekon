import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getArchetypeTournaments, type MetaWindow } from '../lib/api';
import { useArchetypeTournaments } from './useArchetypeTournaments';

vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  getArchetypeTournaments: vi.fn(),
}));
const mocked = vi.mocked(getArchetypeTournaments);
const W: MetaWindow = { days: 30, online: true, bo1: true };
const T = { id: 't1', name: 'Cup', date: '2026-09-01', players: 40 };

beforeEach(() => {
  mocked.mockReset();
});

describe('useArchetypeTournaments', () => {
  it('loads the tournaments of the archetype', async () => {
    mocked.mockResolvedValue({ tournaments: [T] });
    const { result } = renderHook(() => useArchetypeTournaments('dragapult-ex', W));
    await waitFor(() => expect(result.current).toEqual([T]));
    expect(mocked).toHaveBeenCalledWith('dragapult-ex', W);
  });

  it('returns [] on failure without throwing (own failure domain)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocked.mockImplementation(() => Promise.reject(new Error('down')));
    const { result } = renderHook(() => useArchetypeTournaments('dragapult-ex', W));
    await waitFor(() => expect(mocked).toHaveBeenCalled());
    expect(result.current).toEqual([]);
    warn.mockRestore();
  });

  it('does not fetch without an archetype', () => {
    const { result } = renderHook(() => useArchetypeTournaments(null, W));
    expect(mocked).not.toHaveBeenCalled();
    expect(result.current).toEqual([]);
  });
});
