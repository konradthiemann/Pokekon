import { describe, it, expect } from 'vitest';
import { detectMatchupConflicts, MATCHUP_CONFLICT_THRESHOLD_PP } from './matchupConflict.js';
import type { MatchupRow } from './matchupCsv.js';

const row = (over: Partial<MatchupRow> = {}): MatchupRow => ({
  deck1: 'aa',
  deck2: 'bb',
  wins: 0,
  losses: 0,
  ties: 0,
  total: 100,
  winRate: 50,
  ...over,
});

describe('MATCHUP_CONFLICT_THRESHOLD_PP', () => {
  it('is 15 percentage points', () => {
    expect(MATCHUP_CONFLICT_THRESHOLD_PP).toBe(15);
  });
});

describe('detectMatchupConflicts', () => {
  it('flags the AC case (own 70:30 vs TrainerHill 45:55) exactly once, not the mirror', () => {
    const own: MatchupRow[] = [row({ winRate: 70, total: 100 })];
    const fallback: MatchupRow[] = [
      row({ winRate: 45, total: 200 }),
      row({ deck1: 'bb', deck2: 'aa', winRate: 55, total: 200 }),
    ];
    const conflicts = detectMatchupConflicts(own, fallback);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      deck1: 'aa',
      deck2: 'bb',
      ownWinRate: 70,
      fallbackWinRate: 45,
      deltaPp: 25,
    });
  });

  it('does not flag a pair exactly at the threshold (> 15pp, not >= 15pp)', () => {
    const own: MatchupRow[] = [row({ winRate: 65, total: 100 })];
    const fallback: MatchupRow[] = [row({ winRate: 50, total: 200 })];
    expect(detectMatchupConflicts(own, fallback)).toEqual([]);
  });

  it('ignores own data below minOwnGames (default MIN_MATCHUP_GAMES)', () => {
    const own: MatchupRow[] = [row({ winRate: 90, total: 5 })];
    const fallback: MatchupRow[] = [row({ winRate: 50, total: 200 })];
    expect(detectMatchupConflicts(own, fallback)).toEqual([]);
  });

  it('ignores pairs that appear in only one source', () => {
    const own: MatchupRow[] = [row({ deck1: 'cc', deck2: 'dd', winRate: 90, total: 100 })];
    const fallback: MatchupRow[] = [row({ winRate: 10, total: 200 })];
    expect(detectMatchupConflicts(own, fallback)).toEqual([]);
  });

  it('sorts by deltaPp descending, then deck1, then deck2', () => {
    const own: MatchupRow[] = [
      row({ deck1: 'aa', deck2: 'bb', winRate: 70, total: 100 }),
      row({ deck1: 'cc', deck2: 'dd', winRate: 90, total: 100 }),
    ];
    const fallback: MatchupRow[] = [
      row({ deck1: 'aa', deck2: 'bb', winRate: 45, total: 200 }), // delta 25
      row({ deck1: 'cc', deck2: 'dd', winRate: 40, total: 200 }), // delta 50
    ];
    const conflicts = detectMatchupConflicts(own, fallback);
    expect(conflicts.map((c) => `${c.deck1}-${c.deck2}`)).toEqual(['cc-dd', 'aa-bb']);
  });
});
