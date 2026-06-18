import { describe, it, expect } from 'vitest';
import { computeMetaSnapshots } from './meta.js';
import { isPostRotationPeriod, isoWeekLabel } from './season.js';

const rec = (wins: number, losses: number) => ({ wins, losses, ties: 0 });

describe('computeMetaSnapshots', () => {
  it('aggregates archetypes across tournaments with frequency and win rate', () => {
    const { snapshots, totalPlayers, tournamentCount } = computeMetaSnapshots(
      [
        [
          { deck: { id: 'char', name: 'Charizard' }, record: rec(6, 1) },
          { deck: { id: 'char', name: 'Charizard' }, record: rec(4, 3) },
          { deck: { id: 'gard', name: 'Gardevoir' }, record: rec(5, 2) },
          { deck: { id: 'gard', name: 'Gardevoir' }, record: rec(3, 4) },
        ],
      ],
      '2026-W20',
      'test',
    );
    expect(totalPlayers).toBe(4);
    expect(tournamentCount).toBe(1);
    const char = snapshots.find((s) => s.archetype === 'Charizard');
    expect(char).toMatchObject({ playerCount: 2, wins: 10, losses: 4, period: '2026-W20' });
    expect(char?.frequencyPct).toBe(50); // 2 of 4
    expect(char?.winRatePct).toBe(71); // 10/14 → 71
  });

  it('drops archetypes below the minimum pilot count (noise)', () => {
    const { snapshots } = computeMetaSnapshots(
      [
        [
          { deck: { id: 'a', name: 'Popular' }, record: rec(2, 2) },
          { deck: { id: 'a', name: 'Popular' }, record: rec(3, 1) },
          { deck: { id: 'b', name: 'Fringe' }, record: rec(1, 1) }, // single pilot
        ],
      ],
      '2026-W20',
      'test',
    );
    expect(snapshots.map((s) => s.archetype)).toEqual(['Popular']);
  });

  it('reports a null win rate when there are no decisive games', () => {
    const { snapshots } = computeMetaSnapshots(
      [
        [
          { deck: { id: 'a', name: 'A' }, record: { wins: 0, losses: 0, ties: 3 } },
          { deck: { id: 'a', name: 'A' }, record: { wins: 0, losses: 0, ties: 2 } },
        ],
      ],
      '2026-W20',
      'test',
    );
    expect(snapshots[0]?.winRatePct).toBeNull();
  });

  it('skips empty tournaments without inflating counts', () => {
    const { totalPlayers, tournamentCount } = computeMetaSnapshots([[], []], '2026-W20', 'test');
    expect(totalPlayers).toBe(0);
    expect(tournamentCount).toBe(0);
  });
});

describe('season helpers', () => {
  it('labels ISO weeks and recognises in-season periods', () => {
    expect(isoWeekLabel(new Date('2026-04-09T12:00:00Z'))).toMatch(/^2026-W\d{2}$/);
    expect(isPostRotationPeriod('2026-W20')).toBe(true);
    expect(isPostRotationPeriod('2026-W10')).toBe(false);
  });
});
