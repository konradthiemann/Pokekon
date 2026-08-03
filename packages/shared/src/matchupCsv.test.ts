import { describe, it, expect } from 'vitest';
import { parseMatchupCsv } from './matchupCsv.js';

const HEADER = 'deck1,deck2,wins,losses,ties,total,win_rate';

describe('parseMatchupCsv', () => {
  it('parses valid rows and lowercases slugs', () => {
    const { rows, skipped } = parseMatchupCsv(
      `${HEADER}\nN-Zoroark,dragapult-dusknoir,10,20,2,32,33.3\n`,
    );
    expect(skipped).toBe(0);
    expect(rows).toEqual([
      {
        deck1: 'n-zoroark',
        deck2: 'dragapult-dusknoir',
        wins: 10,
        losses: 20,
        ties: 2,
        total: 32,
        winRate: 33.3,
      },
    ]);
  });

  it('skips malformed rows instead of aborting', () => {
    const { rows, skipped } = parseMatchupCsv(
      [
        HEADER,
        'a-deck,b-deck,1,2,0,3,33.3', // ok
        'missing,columns,1,2', // wrong column count
        '<script>,b-deck,1,2,0,3,10', // non-slug deck name
        'a-deck,b-deck,x,2,0,3,10', // non-numeric count
        'a-deck,b-deck,1,2,0,3,140', // win rate out of range
        '', // blank line — ignored, not counted
      ].join('\n'),
    );
    expect(rows).toHaveLength(1);
    expect(skipped).toBe(4);
  });

  it('rejects files without the expected header', () => {
    expect(() => parseMatchupCsv('foo,bar\n1,2')).toThrow(/header/i);
  });

  it('deduplicates repeated pairs within a batch (last occurrence wins)', () => {
    const { rows, skipped } = parseMatchupCsv(
      [HEADER, 'a-deck,b-deck,10,10,0,20,50', 'a-deck,b-deck,30,10,0,40,75'].join('\n'),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.winRate).toBe(75);
    expect(skipped).toBe(1);
  });
});
