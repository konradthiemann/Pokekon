import { describe, it, expect } from 'vitest';
import { parseBattleLog } from './battleLogParser';

const SAMPLE_LOG = `Vorbereitung
Konrad hat den Münzwurf gewonnen.
Konrad hat für die Starthand 7 Karten gezogen.
GegnerX hat für die Starthand 7 Karten gezogen.

Zug von Konrad
Konrad hat Nest Ball gespielt.
Konrad hat Iono gespielt.
Konrad hat Psycho-Energie an Dreepy angelegt.

Zug von GegnerX
GegnerX hat Pokégear 3.0 gespielt.
GegnerX hat Feuer-Energie an Glumanda angelegt.
Glurak-ex von GegnerX hat Brandwunde für 90 Schadenspunkte eingesetzt.

Zug von Konrad
Konrad hat Nest Ball gespielt.
Dragapult-ex von Konrad hat Phantombrise für 200 Schadenspunkte eingesetzt.
Glurak-ex von GegnerX wurde kampfunfähig gemacht!
Konrad hat 2 Preiskarten aufgenommen.

Zug von GegnerX
GegnerX hat Professor's Research gespielt.

Zug von Konrad
Dragapult-ex von Konrad hat Phantombrise für 200 Schadenspunkte eingesetzt.
Pikachu von GegnerX wurde kampfunfähig gemacht!
Konrad hat eine Preiskarte aufgenommen.

Konrad hat gewonnen!`;

describe('parseBattleLog', () => {
  it('pins player1 to the supplied player name when it matches a detected player', () => {
    const parsed = parseBattleLog(SAMPLE_LOG, 'Konrad');
    expect(parsed.player1).toBe('Konrad');
    expect(parsed.player2).toBe('GegnerX');
  });

  it('falls back to the auto-detected player when the supplied name does not match', () => {
    const parsed = parseBattleLog(SAMPLE_LOG, 'Unbekannt');
    expect([parsed.player1, parsed.player2].sort()).toEqual(['GegnerX', 'Konrad']);
  });

  it('splits the log into turn blocks via "Zug von" markers', () => {
    const parsed = parseBattleLog(SAMPLE_LOG, 'Konrad');
    expect(parsed.totalTurns).toBe(5);
    expect(parsed.turns.map((t) => t.player)).toEqual([
      'Konrad',
      'GegnerX',
      'Konrad',
      'GegnerX',
      'Konrad',
    ]);
  });

  it('counts played cards, energy attachments and actions per turn', () => {
    const parsed = parseBattleLog(SAMPLE_LOG, 'Konrad');
    const turn1 = parsed.turns[0];
    expect(turn1.cardsPlayed).toEqual(['Nest Ball', 'Iono']);
    expect(turn1.energyAttached).toBe(1);
    expect(turn1.actionsCount).toBe(3);
  });

  it('attributes attack damage to the attacking player', () => {
    const parsed = parseBattleLog(SAMPLE_LOG, 'Konrad');
    expect(parsed.totalDamage).toContainEqual({ player: 'Konrad', damage: 400 });
    expect(parsed.totalDamage).toContainEqual({ player: 'GegnerX', damage: 90 });
  });

  it('records knock-outs with the owning player', () => {
    const parsed = parseBattleLog(SAMPLE_LOG, 'Konrad');
    expect(parsed.totalKOs).toContainEqual({ player: 'Konrad', kos: 2 });
  });

  it('tracks prize progression from 6 down as prizes are taken', () => {
    const parsed = parseBattleLog(SAMPLE_LOG, 'Konrad');
    const last = parsed.prizeProgression.at(-1);
    // Konrad took 3 prizes total → opponent column p2 stays 6, own remaining tracked via p1?
    // p1/p2 are prizes REMAINING for player1/player2; Konrad taking prizes reduces Konrad's own pool.
    expect(parsed.prizeProgression[0]).toEqual({ label: 'Start', turn: 0, p1: 6, p2: 6 });
    expect(last?.p1).toBe(3);
    expect(last?.p2).toBe(6);
  });

  it('aggregates card frequency for player1 only', () => {
    const parsed = parseBattleLog(SAMPLE_LOG, 'Konrad');
    expect(parsed.cardFrequency).toContainEqual({ card: 'Nest Ball', count: 2 });
    expect(parsed.cardFrequency.find((c) => c.card === 'Pokégear 3.0')).toBeUndefined();
  });

  it('detects the winner line', () => {
    const parsed = parseBattleLog(SAMPLE_LOG, 'Konrad');
    expect(parsed.winner).toBe('Konrad');
  });

  it('returns an empty turn list for a log without turn markers', () => {
    const parsed = parseBattleLog('Konrad hat den Münzwurf gewonnen.', 'Konrad');
    expect(parsed.totalTurns).toBe(0);
    expect(parsed.turns).toEqual([]);
    expect(parsed.winner).toBeNull();
  });
});
