import { describe, it, expect } from 'vitest';
import {
  computeMetaSnapshots,
  isLikelyOnlineName,
  normalizeArchetypeId,
  pruneDecklist,
} from './meta.js';
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
    expect(char).toMatchObject({
      archetypeId: 'char',
      playerCount: 2,
      wins: 10,
      losses: 4,
      period: '2026-W20',
    });
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

describe('normalizeArchetypeId', () => {
  it('keeps clean slugs, lowercases, and caps the length', () => {
    expect(normalizeArchetypeId('n-zoroark')).toBe('n-zoroark');
    expect(normalizeArchetypeId('Dragapult-Dusknoir')).toBe('dragapult-dusknoir');
    expect(normalizeArchetypeId('a'.repeat(200))).toBe('a'.repeat(80));
  });

  it('collapses missing or hostile ids to "other"', () => {
    expect(normalizeArchetypeId(undefined)).toBe('other');
    expect(normalizeArchetypeId('')).toBe('other');
    expect(normalizeArchetypeId('-leading-dash')).toBe('other');
    expect(normalizeArchetypeId('<script>alert(1)</script>')).toBe('other');
    expect(normalizeArchetypeId('a b c')).toBe('other');
  });
});

describe('pruneDecklist', () => {
  it('keeps only known fields and clamps counts', () => {
    const pruned = pruneDecklist({
      pokemon: [{ name: 'Zoroark ex', count: 3.9, set: 'SVI', number: 42, junk: 'x' }],
      trainer: [{ name: 'Ultra Ball', count: 400 }],
      energy: [{ name: 'Dark Energy', count: 8 }],
      evil: 'dropped',
    });
    expect(pruned).toEqual({
      pokemon: [{ name: 'Zoroark ex', count: 3, set: 'SVI', number: '42' }],
      trainer: [{ name: 'Ultra Ball', count: 60 }],
      energy: [{ name: 'Dark Energy', count: 8 }],
    });
  });

  it('drops malformed entries (bad types, empty names, non-positive counts)', () => {
    const pruned = pruneDecklist({
      pokemon: [
        { name: '', count: 2 },
        { name: 'Ok', count: 0 },
        { name: 'Ok', count: Number.NaN },
        'not-an-object',
        null,
        { name: 'Kept', count: 1 },
      ],
      trainer: 'not-an-array',
      energy: [],
    });
    expect(pruned).toEqual({ pokemon: [{ name: 'Kept', count: 1 }], trainer: [], energy: [] });
  });

  it('caps entry counts and string lengths against bloated payloads', () => {
    const pruned = pruneDecklist({
      pokemon: Array.from({ length: 500 }, (_, i) => ({
        name: `Card ${i} ${'x'.repeat(500)}`,
        count: 1,
        set: 'y'.repeat(500),
      })),
      trainer: [],
      energy: [],
    });
    expect(pruned?.pokemon).toHaveLength(60);
    expect(pruned?.pokemon[0]?.name.length).toBe(200);
    expect(pruned?.pokemon[0]?.set?.length).toBe(40);
  });

  it('returns null for non-object roots and empty lists', () => {
    expect(pruneDecklist(null)).toBeNull();
    expect(pruneDecklist('a string')).toBeNull();
    expect(pruneDecklist(42)).toBeNull();
    expect(pruneDecklist({ pokemon: [], trainer: [], energy: [] })).toBeNull();
    expect(pruneDecklist({})).toBeNull();
  });
});

describe('isLikelyOnlineName', () => {
  it('flags typical online-event names and passes in-person ones', () => {
    expect(isLikelyOnlineName('Late Night Weekly #58')).toBe(true);
    expect(isLikelyOnlineName('PTCGL Grand Open')).toBe(true);
    expect(isLikelyOnlineName('Regional Championship Stuttgart')).toBe(false);
  });
});

describe('season helpers', () => {
  it('labels ISO weeks and recognises in-season periods', () => {
    expect(isoWeekLabel(new Date('2026-04-09T12:00:00Z'))).toMatch(/^2026-W\d{2}$/);
    expect(isPostRotationPeriod('2026-W20')).toBe(true);
    expect(isPostRotationPeriod('2026-W10')).toBe(false);
  });
});
