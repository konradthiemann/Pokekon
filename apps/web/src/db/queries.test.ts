import { describe, it, expect, vi } from 'vitest';
import * as api from '../lib/api';
import { getArchetypeStats, getDeckVariantStats } from './queries';
import type { ArchetypeStats, Deck, OpponentLog } from '../types';

// getArchetypeStats only touches the API layer (listAllLogs, getMeta) — the
// whole module is auto-mocked so no network/IndexedDB is ever hit.
vi.mock('../lib/api');

/** Plan §3.7: ArchetypeStats gains these fields; declared here (not yet on the
 *  real interface) so the test can assert against the target contract. */
interface ArchetypeStatsWithBo1 extends ArchetypeStats {
  bo1EquivalentWinRate: number | null;
  bo1Games: number;
  bo3Games: number;
  unknownFormatGames: number;
}

function logsFor(
  archetype: string,
  entries: { result: 'W' | 'L' | 'T'; bestOf?: 'BO1' | 'BO3' }[],
): OpponentLog[] {
  return entries.map((e, i) => ({
    id: i + 1,
    archetype,
    eventType: 'Online',
    eventDate: '2026-06-01',
    result: e.result,
    notes: '',
    // `bestOf` is plan §3.7 — not yet on OpponentLog, added here for the test.
    ...({ bestOf: e.bestOf } as Record<string, unknown>),
  })) as OpponentLog[];
}

describe('getArchetypeStats', () => {
  it('counts ties as a third of a win in the personal win rate (AC 6W/4L/2T -> 55.6 -> 56)', async () => {
    const entries: { result: 'W' | 'L' | 'T'; bestOf: 'BO1' }[] = [
      ...Array.from({ length: 6 }, () => ({ result: 'W' as const, bestOf: 'BO1' as const })),
      ...Array.from({ length: 4 }, () => ({ result: 'L' as const, bestOf: 'BO1' as const })),
      ...Array.from({ length: 2 }, () => ({ result: 'T' as const, bestOf: 'BO1' as const })),
    ];
    vi.mocked(api.listAllLogs).mockResolvedValue(logsFor('Charizard', entries));
    vi.mocked(api.getMeta).mockResolvedValue([]);

    const stats = (await getArchetypeStats()) as ArchetypeStatsWithBo1[];
    const char = stats.find((s) => s.archetype === 'Charizard');
    // Old formula: wins/(wins+losses) = 6/10 = 60. New tie-weighted formula:
    // (6 + 2/3) / 12 ≈ 55.6 % → rounds to 56.
    expect(char?.winRate).toBe(56);
  });

  it('computes a Bo1-equivalent win rate, converting Bo3 results and excluding unknown-format logs', async () => {
    const entries: { result: 'W' | 'L' | 'T'; bestOf?: 'BO1' | 'BO3' }[] = [
      { result: 'W', bestOf: 'BO1' },
      { result: 'L', bestOf: 'BO1' },
      { result: 'W', bestOf: 'BO3' },
      { result: 'W' }, // no bestOf -> unknown format, excluded from bo1Equivalent
    ];
    vi.mocked(api.listAllLogs).mockResolvedValue(logsFor('Gardevoir', entries));
    vi.mocked(api.getMeta).mockResolvedValue([]);

    const stats = (await getArchetypeStats()) as ArchetypeStatsWithBo1[];
    const gard = stats.find((s) => s.archetype === 'Gardevoir');
    expect(gard?.unknownFormatGames).toBe(1);
    expect(gard?.bo1Games).toBe(2);
    expect(gard?.bo3Games).toBe(1);
    expect(gard?.bo1EquivalentWinRate).not.toBeNull();
    // Must never equal the naive wins/(wins+losses) over ALL 4 logs incl. the
    // unknown-format one (75 %) — unknown games must not enter this number.
    expect(gard?.bo1EquivalentWinRate).not.toBe(75);
  });
});

describe('getDeckVariantStats', () => {
  const deck: Deck = {
    id: 1,
    archetype: 'char',
    archetypeName: 'Charizard',
    variant: 'Standard',
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  it('counts ties as a third of a win, matching getArchetypeStats (AC 6W/4L/2T -> 55.6 -> 56)', async () => {
    const entries: { result: 'W' | 'L' | 'T' }[] = [
      ...Array.from({ length: 6 }, () => ({ result: 'W' as const })),
      ...Array.from({ length: 4 }, () => ({ result: 'L' as const })),
      ...Array.from({ length: 2 }, () => ({ result: 'T' as const })),
    ];
    const logs = entries.map((e, i) => ({
      id: i + 1,
      deckId: deck.id,
      archetype: 'Gardevoir',
      eventType: 'Online' as const,
      eventDate: '2026-06-01',
      result: e.result,
      notes: '',
    }));
    vi.mocked(api.listAllLogs).mockResolvedValue(logs as OpponentLog[]);
    vi.mocked(api.getMeta).mockResolvedValue([]);

    const [stats] = await getDeckVariantStats([deck]);
    // Old formula: wins/(wins+losses) = 6/10 = 60. New tie-weighted formula:
    // (6 + 2/3) / 12 ≈ 55.6 % → rounds to 56 — same formula as ArchetypeStats.
    expect(stats?.winRate).toBe(56);
    expect(stats?.matchupBreakdown[0]?.winRate).toBe(56);
  });
});
