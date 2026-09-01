import { describe, it, expect } from 'vitest';
import {
  classifyTournamentDetails,
  computeMetaSnapshots,
  isLikelyOnlineName,
  normalizeArchetypeId,
  pruneDecklist,
  pruneIcons,
} from './meta.js';
import { isPostRotationPeriod, isoWeekBounds, isoWeekLabel } from './season.js';

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

  // Deliberate rewrite (plan §0/§4 step 3, tester note): the tournament formula
  // (plan §3.1) counts a tie as a third of a win, so "0W/0L/5T" is no longer
  // "no data" (null) — it is a real, if modest, win rate. The old expectation
  // (null for this exact input) directly contradicts the new AC and cannot
  // coexist with it; this is a conscious, documented semantic change, not a
  // silent test-adjustment (see plan §0 meta.test.ts:56-68 and §6 risk 3).
  it('counts ties as a third of a win, so pure ties are no longer "no data" (33%, not null)', () => {
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
    expect(snapshots[0]?.winRatePct).toBe(33);
  });

  it('reports a null win rate only when there are no games at all', () => {
    const { snapshots } = computeMetaSnapshots(
      [
        [
          { deck: { id: 'a', name: 'A' }, record: { wins: 0, losses: 0, ties: 0 } },
          { deck: { id: 'a', name: 'A' }, record: { wins: 0, losses: 0, ties: 0 } },
        ],
      ],
      '2026-W20',
      'test',
    );
    expect(snapshots[0]?.winRatePct).toBeNull();
  });

  it('counts ties as a third of a win when aggregating meta snapshots (AC 6W/4L/2T -> 56)', () => {
    const { snapshots } = computeMetaSnapshots(
      [
        [
          { deck: { id: 'a', name: 'A' }, record: { wins: 3, losses: 2, ties: 1 } },
          { deck: { id: 'a', name: 'A' }, record: { wins: 3, losses: 2, ties: 1 } },
        ],
      ],
      '2026-W20',
      'test',
    );
    expect(snapshots[0]).toMatchObject({ wins: 6, losses: 4, ties: 2 });
    // (6 + 2/3) / 12 ≈ 55.6 % → rounds to 56 (integer route), not the old
    // ties-excluded 60 (6/10).
    expect(snapshots[0]?.winRatePct).toBe(56);
  });

  it('skips empty tournaments without inflating counts', () => {
    const { totalPlayers, tournamentCount } = computeMetaSnapshots([[], []], '2026-W20', 'test');
    expect(totalPlayers).toBe(0);
    expect(tournamentCount).toBe(0);
  });

  it('captures the archetype icons from the first pilot that carries them', () => {
    const { snapshots } = computeMetaSnapshots(
      [
        [
          { deck: { id: 'gf', name: 'Grimmsnarl Froslass' }, record: rec(2, 2) }, // no icons
          {
            deck: { id: 'gf', name: 'Grimmsnarl Froslass', icons: ['Grimmsnarl', 'froslass'] },
            record: rec(3, 1),
          },
        ],
      ],
      '2026-W20',
      'test',
    );
    expect(snapshots[0]?.icons).toEqual(['grimmsnarl', 'froslass']);
  });
});

describe('pruneIcons', () => {
  it('lowercases valid sprite slugs and caps the count', () => {
    expect(pruneIcons(['Dragapult', 'dusknoir'])).toEqual(['dragapult', 'dusknoir']);
    expect(pruneIcons(['ogerpon-teal-mask'])).toEqual(['ogerpon-teal-mask']);
    expect(pruneIcons(['a', 'b', 'c', 'd', 'e', 'f'])).toEqual(['a', 'b', 'c', 'd']); // MAX_ICONS
  });

  it('drops non-strings, empties and non-slug values', () => {
    expect(pruneIcons(['ok', 42, null, '', '  ', '<script>'])).toEqual(['ok']);
    expect(pruneIcons('not-an-array')).toEqual([]);
    expect(pruneIcons(undefined)).toEqual([]);
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

describe('classifyTournamentDetails', () => {
  it('reads the real isOnline, platform and Swiss-phase mode', () => {
    expect(
      classifyTournamentDetails({
        isOnline: true,
        platform: 'PTCGL',
        phases: [
          { phase: 1, type: 'SWISS', rounds: 8, mode: 'BO1' },
          { phase: 2, type: 'SINGLE_BRACKET', rounds: null, mode: 'BO3' },
        ],
      }),
    ).toEqual({ isOnline: true, platform: 'PTCGL', swissMode: 'BO1' });
  });

  it('marks in-person Bo3 events (isOnline false, swiss BO3)', () => {
    expect(
      classifyTournamentDetails({
        isOnline: false,
        platform: null,
        phases: [{ type: 'SWISS', mode: 'BO3' }],
      }),
    ).toEqual({ isOnline: false, platform: null, swissMode: 'BO3' });
  });

  it('prefers the SWISS phase even when it is not first, and normalises case', () => {
    expect(
      classifyTournamentDetails({
        isOnline: true,
        phases: [
          { type: 'single_bracket', mode: 'bo3' },
          { type: 'swiss', mode: 'bo1' },
        ],
      }),
    ).toMatchObject({ swissMode: 'BO1' });
  });

  it('maps unknown modes to OTHER and missing phases to null', () => {
    expect(classifyTournamentDetails({ isOnline: true, phases: [{ mode: 'BO5' }] }).swissMode).toBe(
      'OTHER',
    );
    expect(classifyTournamentDetails({ isOnline: true }).swissMode).toBeNull();
    expect(classifyTournamentDetails({ isOnline: true, phases: [] }).swissMode).toBeNull();
  });

  it('is defensive: non-objects, wrong types and hostile payloads collapse safely', () => {
    const empty = { isOnline: false, platform: null, swissMode: null };
    expect(classifyTournamentDetails(null)).toEqual(empty);
    expect(classifyTournamentDetails('online')).toEqual(empty);
    expect(classifyTournamentDetails({ isOnline: 'true', phases: 'nope' })).toEqual(empty);
    // platform is length-capped; isOnline only true for a real boolean true.
    expect(classifyTournamentDetails({ isOnline: 1, platform: 'x'.repeat(100) })).toMatchObject({
      isOnline: false,
      platform: 'x'.repeat(40),
    });
    // A pathological phases array is bounded and long type strings are guarded,
    // but the first phase's mode still classifies.
    expect(
      classifyTournamentDetails({
        isOnline: true,
        phases: Array.from({ length: 1000 }, () => ({ type: 'x'.repeat(1000), mode: 'BO1' })),
      }).swissMode,
    ).toBe('BO1');
  });
});

describe('season helpers', () => {
  it('labels ISO weeks and recognises in-season periods', () => {
    expect(isoWeekLabel(new Date('2026-04-09T12:00:00Z'))).toMatch(/^2026-W\d{2}$/);
    expect(isPostRotationPeriod('2026-W20')).toBe(true);
    expect(isPostRotationPeriod('2026-W10')).toBe(false);
  });

  it('bounds an ISO week from Monday 00:00 UTC to the next Monday', () => {
    // 2026-08-05 is a Wednesday; its ISO week runs Mon 2026-08-03 .. Mon 2026-08-10.
    const { start, end } = isoWeekBounds(new Date('2026-08-05T14:30:00Z'));
    expect(start.toISOString()).toBe('2026-08-03T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-10T00:00:00.000Z');
    // A Sunday still maps to the same week (Sunday = ISO day 7, not a new week).
    expect(isoWeekBounds(new Date('2026-08-09T23:00:00Z')).start.toISOString()).toBe(
      '2026-08-03T00:00:00.000Z',
    );
  });
});
