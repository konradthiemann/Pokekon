import { describe, it, expect } from 'vitest';
import { parseBattleLog, PARSER_VERSION } from './battleLogParser.js';

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

  // ── Board-state reconstruction (v2) ──────────────────────────────────────

  it('stamps the parser version on the result', () => {
    const parsed = parseBattleLog(SAMPLE_LOG, 'Konrad');
    expect(parsed.parserVersion).toBe(PARSER_VERSION);
  });

  it('detects the first player and whether player1 went first', () => {
    const parsed = parseBattleLog(SAMPLE_LOG, 'Konrad');
    expect(parsed.firstPlayer).toBe('Konrad');
    expect(parsed.wentFirst).toBe(true);
  });

  it('reports wentFirst=null when there are no turns', () => {
    const parsed = parseBattleLog('Konrad hat den Münzwurf gewonnen.', 'Konrad');
    expect(parsed.firstPlayer).toBeNull();
    expect(parsed.wentFirst).toBeNull();
  });

  it('flags only Supporter cards as supporters played', () => {
    const parsed = parseBattleLog(SAMPLE_LOG, 'Konrad');
    // Turn 1: Konrad played Nest Ball (item) + Iono (supporter) → only Iono counts.
    expect(parsed.turns[0].supportersPlayed).toEqual(['Iono']);
  });

  it('approximates hand size from the opening hand minus plays and energy', () => {
    const parsed = parseBattleLog(SAMPLE_LOG, 'Konrad');
    // Konrad opens 7, turn 1 plays 2 cards + attaches 1 energy → 4.
    expect(parsed.turns[0].handSize).toBe(4);
  });

  it('infers the active Pokémon from attack lines', () => {
    const parsed = parseBattleLog(SAMPLE_LOG, 'Konrad');
    // Turn 3 (index 2): "Dragapult-ex von Konrad hat Phantombrise ... eingesetzt".
    expect(parsed.turns[2].activePokemon).toBe('Dragapult-ex');
    // Turn 1 has no attack and no placement markers → unknown active.
    expect(parsed.turns[0].activePokemon).toBeNull();
  });

  it('leaves the bench empty when the log has no bench-placement markers', () => {
    const parsed = parseBattleLog(SAMPLE_LOG, 'Konrad');
    expect(parsed.turns[0].bench).toEqual([]);
  });

  it('tracks cumulative energy in play for the turn player', () => {
    const parsed = parseBattleLog(SAMPLE_LOG, 'Konrad');
    expect(parsed.turns[0].energyInPlay).toBe(1); // Konrad attached 1 energy by turn 1
  });

  it('marks a clean setup when energy and a draw supporter land by turn 2', () => {
    const parsed = parseBattleLog(SAMPLE_LOG, 'Konrad');
    expect(parsed.setupCleanByTurn2).toBe(true);
  });

  it('counts no dead turns when every player1 turn acts or attacks', () => {
    const parsed = parseBattleLog(SAMPLE_LOG, 'Konrad');
    // Turn 5 only attacks (actionsCount 0) but deals damage → not a dead turn.
    expect(parsed.deadTurns).toBe(0);
  });

  // ── Winner detection on conceded games (plan personal-data-role-rework §3.4,
  //    Entscheidung 5 — battleLogParser.ts:457, the ONE sanctioned exception to
  //    the "parser is out of scope" rule for this plan) ───────────────────────
  //
  // The regex must keep matching a plain "X hat gewonnen!" line, but ALSO match
  // when that sentence is preceded by another sentence on the same line (the
  // concession case) — see the verbatim table in the plan §3.4.
  describe('winner detection on conceded games (plan §3.4)', () => {
    it('detects the winner from a plain "X hat gewonnen!" line', () => {
      const parsed = parseBattleLog('Gtmap hat gewonnen!', 'Gtmap');
      expect(parsed.winner).toBe('Gtmap');
    });

    it('detects the winner when the loser conceded first — real log tail from demoSeed.ts:224', () => {
      // Verbatim final line of Konrad's own reference log (LOG_NZOROARK_WIN),
      // apps/api/src/lib/demoSeed.ts:224. Today this returns null (empirically
      // verified false match) because the regex is anchored to the start of
      // the line; the "Du hast aufgegeben. " prefix breaks the `^` anchor.
      const parsed = parseBattleLog('Du hast aufgegeben. Gtmap hat gewonnen.', 'Gtmap');
      expect(parsed.winner).toBe('Gtmap');
    });

    it('does NOT treat a coin-toss win as a game winner', () => {
      const parsed = parseBattleLog('Gtmap hat den Münzwurf gewonnen.', 'Gtmap');
      expect(parsed.winner).toBeNull();
    });
  });
});
