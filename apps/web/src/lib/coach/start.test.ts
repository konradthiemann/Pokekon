import { describe, expect, it } from 'vitest';
import { tournamentWinRatePct, wilsonInterval } from '@pokekon/shared';
import type { ArchetypeStats, Deck, OpponentLog } from '../../types';
import type { FieldAnalysisArchetype } from '../api';
import { fieldThisWeek, logsOfArchetype, nextStep, recentForm } from './start';

function deck(id: number, archetype: string): Deck {
  return { id, archetype, archetypeName: archetype, variant: '', createdAt: '2026-01-01' };
}
function log(over: Partial<OpponentLog>): OpponentLog {
  return {
    archetype: 'Gardevoir ex',
    eventType: 'Online',
    eventDate: '2026-09-24',
    result: 'W',
    notes: '',
    ...over,
  };
}

describe('logsOfArchetype', () => {
  it('keeps only logs of decks of the archetype', () => {
    const decks = [deck(1, 'dragapult-ex'), deck(2, 'n-zoroark'), deck(3, 'dragapult-ex')];
    const logs = [log({ deckId: 1 }), log({ deckId: 2 }), log({ deckId: 3 }), log({})];
    expect(logsOfArchetype(logs, decks, 'dragapult-ex').map((l) => l.deckId)).toEqual([1, 3]);
  });
});

describe('recentForm', () => {
  const now = new Date('2026-09-25T12:00:00Z');

  it('counts the last 7 days including today and excluding day 8', () => {
    const form = recentForm(
      [
        log({ eventDate: '2026-09-25', result: 'W' }),
        log({ eventDate: '2026-09-19', result: 'L' }),
        log({ eventDate: '2026-09-18', result: 'W' }),
      ],
      now,
    );
    expect([form.wins, form.losses, form.ties]).toEqual([1, 1, 0]);
  });

  it('uses the tie-weighted win rate and a Wilson band', () => {
    const logs = [
      log({ result: 'W' }),
      log({ result: 'W' }),
      log({ result: 'L' }),
      log({ result: 'T' }),
    ];
    const form = recentForm(logs, now);
    expect(form.winRatePct).toBe(tournamentWinRatePct(2, 1, 1));
    const band = wilsonInterval(2, 1, 1)!;
    expect(form.band).toEqual({ lowPct: band.lowPct, highPct: band.highPct });
  });

  it('has no rate and no band without games', () => {
    expect(recentForm([], now)).toEqual({
      wins: 0,
      losses: 0,
      ties: 0,
      winRatePct: null,
      band: null,
    });
  });
});

describe('nextStep (Scheibe 1)', () => {
  it('asks to adopt a list without an active deck', () => {
    expect(nextStep({ hasActiveDeck: false, hasLogs: false })).toEqual({ kind: 'adoptList' });
  });
  it('asks to paste a log with a deck but no logs', () => {
    expect(nextStep({ hasActiveDeck: true, hasLogs: false })).toEqual({ kind: 'pasteLog' });
  });
  it('keeps asking for logs once there are some (more steps come with Specs 5/6/8)', () => {
    expect(nextStep({ hasActiveDeck: true, hasLogs: true })).toEqual({ kind: 'pasteLog' });
  });
});

describe('fieldThisWeek', () => {
  const field = [
    { archetypeId: 'a', archetypeName: 'Gardevoir ex', sharePct: 10 },
    { archetypeId: 'b', archetypeName: 'Raging Bolt ex', sharePct: 20 },
    { archetypeId: 'c', archetypeName: 'C', sharePct: 5 },
    { archetypeId: 'd', archetypeName: 'D', sharePct: 4 },
    { archetypeId: 'e', archetypeName: 'E', sharePct: 3 },
    { archetypeId: 'f', archetypeName: 'F', sharePct: 2 },
  ] as FieldAnalysisArchetype[];
  const own = [{ archetype: 'Gardevoir ex', encounters: 4, winRate: 75 }] as ArchetypeStats[];

  it('returns the top 5 by share with the own win rate matched by name', () => {
    const rows = fieldThisWeek(field, own);
    expect(rows.map((r) => r.archetypeId)).toEqual(['b', 'a', 'c', 'd', 'e']);
    expect(rows[1]).toEqual({
      archetypeId: 'a',
      name: 'Gardevoir ex',
      sharePct: 10,
      ownWinRatePct: 75,
    });
    expect(rows[0]!.ownWinRatePct).toBeNull();
  });

  it('matches names case- and apostrophe-insensitively', () => {
    const rows = fieldThisWeek(
      [
        { archetypeId: 'z', archetypeName: 'N’s Zoroark ex', sharePct: 9 },
      ] as FieldAnalysisArchetype[],
      [{ archetype: "n's zoroark ex", encounters: 2, winRate: 50 }] as ArchetypeStats[],
    );
    expect(rows[0]!.ownWinRatePct).toBe(50);
  });
});
