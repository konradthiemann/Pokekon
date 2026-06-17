import { describe, it, expect } from 'vitest';
import {
  extractRevealedCards,
  evidenceExistsInLog,
  validateAnalysis,
  stripJsonFences,
  type BattleAnalysis,
} from './battleAnalysis.js';

const LOG = `Zug von Konrad
Konrad hat Iono gespielt.
   • Nest Ball, Ultra Ball, Boss's Orders
Konrad hat gewonnen!`;

describe('extractRevealedCards', () => {
  it('pulls comma-separated cards out of bullet-point listings', () => {
    expect(extractRevealedCards(LOG)).toEqual(['Nest Ball', 'Ultra Ball', "Boss's Orders"]);
  });

  it('returns an empty array when nothing is revealed', () => {
    expect(extractRevealedCards('Konrad hat Iono gespielt.')).toEqual([]);
  });
});

describe('evidenceExistsInLog', () => {
  it('accepts a verbatim quote present in the log', () => {
    expect(evidenceExistsInLog('Konrad hat Iono gespielt.', LOG)).toBe(true);
  });

  it('rejects a quote not present in the log', () => {
    expect(evidenceExistsInLog('Konrad hat Professor gespielt.', LOG)).toBe(false);
  });

  it('rejects too-short evidence', () => {
    expect(evidenceExistsInLog('Zug', LOG)).toBe(false);
  });
});

describe('validateAnalysis', () => {
  it('drops items whose evidence is not in the log and keeps grounded ones', () => {
    const raw: BattleAnalysis = {
      playerName: 'Konrad',
      opponentName: 'GegnerX',
      summary: 's',
      keyMoments: [
        {
          turn: 1,
          observation: 'played Iono',
          evidence: 'Konrad hat Iono gespielt.',
          impact: 'high',
        },
        { turn: 2, observation: 'invented', evidence: 'totally fabricated line', impact: 'low' },
      ],
      playMistakes: [],
      cardNotes: [
        { card: 'Iono', observation: 'good', evidence: 'Konrad hat Iono gespielt.' },
        { card: 'Ghost', observation: 'fake', evidence: 'no such line here' },
      ],
      deckSuggestions: [],
      analyzedAt: '2026-06-17T00:00:00.000Z',
    };
    const clean = validateAnalysis(raw, LOG);
    expect(clean.keyMoments).toHaveLength(1);
    expect(clean.keyMoments[0].observation).toBe('played Iono');
    expect(clean.cardNotes).toHaveLength(1);
    expect(clean.cardNotes[0].card).toBe('Iono');
  });

  it('tolerates missing arrays', () => {
    const raw = {
      playerName: 'a',
      opponentName: 'b',
      summary: 's',
      analyzedAt: 'x',
    } as BattleAnalysis;
    const clean = validateAnalysis(raw, LOG);
    expect(clean.keyMoments).toEqual([]);
    expect(clean.playMistakes).toEqual([]);
    expect(clean.cardNotes).toEqual([]);
    expect(clean.deckSuggestions).toEqual([]);
  });
});

describe('stripJsonFences', () => {
  it('removes a ```json fenced block', () => {
    expect(stripJsonFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('leaves bare JSON untouched', () => {
    expect(stripJsonFences('{"a":1}')).toBe('{"a":1}');
  });
});
