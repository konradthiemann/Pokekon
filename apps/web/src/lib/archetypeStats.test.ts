import { describe, expect, it } from 'vitest';
import type { MetaSnapshot, OpponentLog } from '../types';
import { computeArchetypeStats } from './archetypeStats';

function log(archetype: string, result: 'W' | 'L' | 'T', bestOf?: 'BO1' | 'BO3'): OpponentLog {
  return { archetype, result, bestOf, eventType: 'Online', eventDate: '2026-09-01', notes: '' };
}

describe('computeArchetypeStats (pure, extracted from getArchetypeStats)', () => {
  it('counts ties as a third of a win (6W/4L/2T → 56)', () => {
    const logs = [
      ...Array.from({ length: 6 }, () => log('Charizard', 'W', 'BO1')),
      ...Array.from({ length: 4 }, () => log('Charizard', 'L', 'BO1')),
      ...Array.from({ length: 2 }, () => log('Charizard', 'T', 'BO1')),
    ];
    const char = computeArchetypeStats(logs, []).find((s) => s.archetype === 'Charizard');
    expect(char?.winRate).toBe(56);
    expect(char?.encounters).toBe(12);
  });

  it('lists meta archetypes without logs with encounters 0 and their meta share', () => {
    const snaps = [{ archetype: 'Gardevoir', frequencyPct: 12, winRatePct: 51 }] as MetaSnapshot[];
    const gard = computeArchetypeStats([], snaps).find((s) => s.archetype === 'Gardevoir');
    expect(gard).toMatchObject({ encounters: 0, frequencyPct: 12, metaWinRate: 51 });
  });

  it('computes the Bo1-equivalent rate without unknown-format logs', () => {
    const logs = [log('G', 'W', 'BO1'), log('G', 'L', 'BO1'), log('G', 'W', 'BO3'), log('G', 'W')];
    const g = computeArchetypeStats(logs, []).find((s) => s.archetype === 'G')!;
    expect([g.bo1Games, g.bo3Games, g.unknownFormatGames]).toEqual([2, 1, 1]);
    expect(g.bo1EquivalentWinRate).not.toBeNull();
    expect(g.bo1EquivalentWinRate).not.toBe(75);
  });
});
