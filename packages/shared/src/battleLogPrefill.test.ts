import { describe, it, expect } from 'vitest';
import { parseBattleLog, type ParsedBattleLog } from './battleLogParser.js';
import {
  normaliseCardName,
  opponentCardNames,
  guessOpponentArchetype,
  resultFromParsedLog,
  prefillFromBattleLog,
  type ArchetypeSignature,
} from './battleLogPrefill.js';

// ─── Real reference log, copied verbatim from apps/api/src/lib/demoSeed.ts
// (LOG_NZOROARK_WIN, lines ~152-224) — Konrad's own real match, plan §0.5/§3.5.
// Gtmap (Mega-Kangaskhan / Furienblitz-ex / Latias-ex) beats Premiox (N's
// Zoroark ex, benched Mega-Schlapor-ex + Haspiror). Ends on a concession line.
const LOG_NZOROARK_WIN = `Vorbereitung
Gtmap hat Zahl für den Münzwurf am Anfang gewählt.
Gtmap hat den Münzwurf gewonnen.
Gtmap möchte als Zweiter dran sein.
Gtmap hat für die Starthand 7 Karten gezogen.
Premiox hat für die Starthand 7 Karten gezogen.
   • Aufwischwirbel, Ns Zorua, Schloss von N, Ns Zoroark-ex, Haspiror, Hyperball, Hyperball
Gtmap hat Mega-Kangama-ex in die Aktive Position gelegt.
Premiox hat Ns Zorua in die Aktive Position gelegt.

Zug von Premiox
Premiox hat Mauzi-ex gezogen.
Premiox hat Haspiror auf die Bank gelegt.
Premiox hat den eigenen Zug beendet.

Zug von Gtmap
Gtmap hat eine Karte gezogen.
Gtmap hat Rockos Erkundung gespielt.
- Gtmap hat 2 Karten gezogen.
   • Furienblitz, Eisenblatt-ex
Gtmap hat Türkisgrüne-Maske-Ogerpon-ex auf die Bank gelegt.
Türkisgrüne-Maske-Ogerpon-ex von Gtmap hat Türkisgrüner Tanz eingesetzt.
- Gtmap hat Basis-Pflanze-Energie an Türkisgrüne-Maske-Ogerpon-ex auf der Bank angelegt.
- Gtmap hat eine Karte gezogen.
Mega-Kangama-ex von Gtmap hat Besorgung machen eingesetzt.
- Gtmap hat 2 Karten gezogen.
Gtmap hat Latias-ex auf die Bank gelegt.
Gtmap hat Furienblitz auf die Bank gelegt.
Gtmap hat Basis-Elektro-Energie an Furienblitz auf der Bank angelegt.
Gtmap hat den eigenen Zug beendet.

Zug von Premiox
Premiox hat Ns Zorua in der Aktiven Position zu Ns Zoroark-ex entwickelt.
Premiox hat Schloss von N auf das Stadion-Feld gespielt.
Premiox hat Basis-Finsternis-Energie an Mega-Schlapor-ex auf der Bank angelegt.
Mega-Schlapor-ex von Premiox ist jetzt in der Aktiven Position.
Mega-Schlapor-ex von Premiox hat Orkanstoß gegen Mega-Kangama-ex von Gtmap für 230 Schadenspunkte eingesetzt.

Zug von Gtmap
Gtmap hat eine Karte gezogen.
Gtmap hat Höhlensystem Null auf das Stadion-Feld gespielt.
Mega-Kangama-ex von Gtmap hat Besorgung machen eingesetzt.
- Gtmap hat 2 Karten gezogen.
Gtmap hat Furienblitz-ex auf die Bank gelegt.
Gtmap hat Basis-Kampf-Energie an Furienblitz-ex auf der Bank angelegt.
Gtmap hat Basis-Elektro-Energie an Furienblitz-ex auf der Bank angelegt.
Gtmap hat Mega-Kangama-ex auf die Bank zurückgezogen.
Furienblitz-ex von Gtmap ist jetzt in der Aktiven Position.
Furienblitz-ex von Gtmap hat Kläffender Donner gegen Mega-Schlapor-ex von Premiox für 350 Schadenspunkte eingesetzt.
Mega-Schlapor-ex von Premiox wurde kampfunfähig gemacht!
Gtmap hat 3 Preiskarten aufgenommen.

Zug von Premiox
Premiox hat Ns Zoroark-ex in die Aktive Position gelegt.
Ns Zoroark-ex von Premiox hat Nachtjoker gegen Furienblitz-ex von Gtmap für 250 Schadenspunkte eingesetzt.
Furienblitz-ex von Gtmap wurde kampfunfähig gemacht!
Premiox hat 2 Preiskarten aufgenommen.
Latias-ex von Gtmap ist jetzt in der Aktiven Position.

Zug von Gtmap
Gtmap hat eine Karte gezogen.
Beatori-ex von Gtmap hat Umdichten eingesetzt.
- Gtmap hat 3 Karten gezogen.
Gtmap hat Furienblitz-ex auf die Bank gelegt.
Gtmap hat Basis-Kampf-Energie an Furienblitz-ex auf der Bank angelegt.
Gtmap hat Basis-Elektro-Energie an Furienblitz-ex auf der Bank angelegt.
Gtmap hat Latias-ex auf die Bank zurückgezogen.
Furienblitz-ex von Gtmap ist jetzt in der Aktiven Position.
Furienblitz-ex von Gtmap hat Kläffender Donner gegen Ns Zoroark-ex von Premiox für 280 Schadenspunkte eingesetzt.
Ns Zoroark-ex von Premiox wurde kampfunfähig gemacht!
Gtmap hat 2 Preiskarten aufgenommen.

Du hast aufgegeben. Gtmap hat gewonnen.`;

// ─── 3.2 normaliseCardName ────────────────────────────────────────────────────

describe('normaliseCardName', () => {
  it.each([
    ['Ns Zoroark-ex', 'ns zoroark'],
    ["N's Zoroark ex", 'ns zoroark'],
    ['Mega-Kangama-ex', 'mega kangama'],
    ['Türkisgrüne-Maske-Ogerpon-ex', 'türkisgrüne maske ogerpon'],
    ['Haspiror', 'haspiror'],
    ['Schloss von N', 'schloss von n'],
    ['  Dragapult   ex ', 'dragapult'],
    ['', ''],
  ])('normalises %j to %j', (input, expected) => {
    expect(normaliseCardName(input)).toBe(expected);
  });
});

// ─── 3.3 opponentCardNames ────────────────────────────────────────────────────

describe('opponentCardNames', () => {
  it('returns an empty array when the log has no opponent turns', () => {
    const parsed = parseBattleLog('Gtmap hat den Münzwurf gewonnen.', 'Gtmap');
    expect(opponentCardNames(parsed)).toEqual([]);
  });

  it('collects Pokémon and Trainer names attributable to the opponent from the real log', () => {
    const parsed = parseBattleLog(LOG_NZOROARK_WIN, 'Gtmap');
    expect(parsed.player2).toBe('Premiox');
    const cards = opponentCardNames(parsed);
    // §3.5 verbindliche Wertetabelle: must contain these two, at minimum.
    expect(cards).toContain('Ns Zoroark-ex');
    expect(cards).toContain('Haspiror');
    // Also benched + attacked with Mega-Schlapor-ex, and played the "Schloss
    // von N" stadium — all opponent-attributable evidence per the contract.
    expect(cards).toContain('Mega-Schlapor-ex');
    expect(cards).toContain('Schloss von N');
    // Must never leak Gtmap's own cards.
    expect(cards).not.toContain('Mega-Kangama-ex');
    expect(cards).not.toContain('Furienblitz-ex');
  });
});

// ─── 3.3 guessOpponentArchetype — verbindliche Wertetabelle ──────────────────

const SIG_A: ArchetypeSignature = { slug: 'n-zoroark', name: "N's Zoroark", logNames: ['Zoroark'] };
const SIG_B: ArchetypeSignature = {
  slug: 'lopunny-dudunsparce',
  name: 'Lopunny Dudunsparce',
  logNames: ['Schlapor', 'Haspiror'],
};
const SIG_C: ArchetypeSignature = { slug: 'greninja', name: 'Greninja', logNames: ['Quajutsu'] };

describe('guessOpponentArchetype', () => {
  it('is unique when exactly one signature is fully covered (single-fragment signature)', () => {
    const guess = guessOpponentArchetype(['Ns Zoroark-ex'], [SIG_A, SIG_B, SIG_C]);
    expect(guess.confidence).toBe('unique');
    expect(guess.best?.slug).toBe('n-zoroark');
    expect(guess.candidates.map((c) => c.slug)).toEqual(['n-zoroark']);
  });

  it('is unique for a different single-fragment signature (Quajutsu -> Greninja)', () => {
    const guess = guessOpponentArchetype(['Quajutsu'], [SIG_A, SIG_B, SIG_C]);
    expect(guess.confidence).toBe('unique');
    expect(guess.best?.slug).toBe('greninja');
  });

  it('is ambiguous when only half of a two-fragment signature is covered', () => {
    const guess = guessOpponentArchetype(['Mega-Schlapor-ex'], [SIG_A, SIG_B, SIG_C]);
    expect(guess.confidence).toBe('ambiguous');
    expect(guess.best).toBeNull();
    const b = guess.candidates.find((c) => c.slug === 'lopunny-dudunsparce');
    expect(b?.coverage).toBe(0.5);
  });

  it('is unique once both fragments of a two-fragment signature are covered', () => {
    const guess = guessOpponentArchetype(['Mega-Schlapor-ex', 'Haspiror'], [SIG_A, SIG_B, SIG_C]);
    expect(guess.confidence).toBe('unique');
    expect(guess.best?.slug).toBe('lopunny-dudunsparce');
  });

  it('THE key regression: two fully-covered signatures at coverage 1 must NOT auto-pick either (real card lineup, plan §3.3 row 5)', () => {
    // This is the actual opponent card lineup from demoSeed.ts: Premiox plays
    // N's Zoroark ex WITH Mega-Schlapor-ex and Haspiror on the bench. A sort
    // that additionally breaks ties by `matched.length` would wrongly and
    // automatically select `lopunny-dudunsparce` (2 matched fragments) over
    // `n-zoroark` (1 matched fragment) even though BOTH are at coverage 1.
    const guess = guessOpponentArchetype(
      ['Ns Zoroark-ex', 'Mega-Schlapor-ex', 'Haspiror'],
      [SIG_A, SIG_B, SIG_C],
    );
    expect(guess.confidence).toBe('ambiguous');
    expect(guess.best).toBeNull();
    expect(guess.candidates.map((c) => c.slug).sort()).toEqual(
      ['lopunny-dudunsparce', 'n-zoroark'].sort(),
    );
  });

  it('is none when no card matches any signature fragment', () => {
    const guess = guessOpponentArchetype(['Hyperball', 'Pokégear 3.0'], [SIG_A, SIG_B, SIG_C]);
    expect(guess.confidence).toBe('none');
    expect(guess.candidates).toEqual([]);
    expect(guess.best).toBeNull();
  });

  it('is none for an empty card list', () => {
    const guess = guessOpponentArchetype([], [SIG_A, SIG_B, SIG_C]);
    expect(guess.confidence).toBe('none');
    expect(guess.candidates).toEqual([]);
    expect(guess.best).toBeNull();
  });

  it('ignores signatures with an empty logNames list (no division by zero)', () => {
    const emptySig: ArchetypeSignature = { slug: 'nothing', name: 'Nothing', logNames: [] };
    const guess = guessOpponentArchetype(['Ns Zoroark-ex'], [emptySig, SIG_A]);
    expect(guess.candidates.find((c) => c.slug === 'nothing')).toBeUndefined();
    expect(guess.confidence).toBe('unique');
    expect(guess.best?.slug).toBe('n-zoroark');
  });

  it('token-boundary match: "Absol" must not match "Absolem"', () => {
    const sig: ArchetypeSignature = { slug: 'absol', name: 'Absol', logNames: ['Absol'] };
    const guess = guessOpponentArchetype(['Absolem'], [sig]);
    expect(guess.confidence).toBe('none');
  });
});

// ─── 3.4 resultFromParsedLog ──────────────────────────────────────────────────

function fakeParsed(overrides: Partial<ParsedBattleLog>): ParsedBattleLog {
  return {
    player1: 'Gtmap',
    player2: 'Premiox',
    winner: null,
    totalTurns: 0,
    turns: [],
    prizeProgression: [],
    damageByTurn: [],
    cardFrequency: [],
    totalDamage: [],
    totalKOs: [],
    parserVersion: 2,
    firstPlayer: null,
    wentFirst: null,
    setupCleanByTurn2: false,
    deadTurns: 0,
    ...overrides,
  };
}

describe('resultFromParsedLog', () => {
  it('returns W when the winner is player1', () => {
    expect(resultFromParsedLog(fakeParsed({ winner: 'Gtmap' }))).toBe('W');
  });

  it('returns L when the winner is player2', () => {
    expect(resultFromParsedLog(fakeParsed({ winner: 'Premiox' }))).toBe('L');
  });

  it('returns null when there is no winner line', () => {
    expect(resultFromParsedLog(fakeParsed({ winner: null }))).toBeNull();
  });

  it('returns null (never "T") when the winner matches neither detected player', () => {
    expect(resultFromParsedLog(fakeParsed({ winner: 'SomeoneElse' }))).toBeNull();
  });
});

// ─── 3.5 prefillFromBattleLog — verbindliche Wertetabelle ────────────────────

describe('prefillFromBattleLog', () => {
  it('pins the player, detects both names, resolves the result and opponent cards from the real log', () => {
    const prefill = prefillFromBattleLog(LOG_NZOROARK_WIN, 'Gtmap', [SIG_A, SIG_B]);
    expect(prefill).not.toBeNull();
    expect(prefill?.playerPinned).toBe(true);
    expect(prefill?.detectedPlayers[1]).toBe('Premiox');
    expect(prefill?.result).toBe('W');
    expect(prefill?.opponentCards).toContain('Ns Zoroark-ex');
    expect(prefill?.opponentCards).toContain('Haspiror');
  });

  it('is ambiguous with both real signatures (the regression case, plan §3.3 row 5)', () => {
    const prefill = prefillFromBattleLog(LOG_NZOROARK_WIN, 'Gtmap', [SIG_A, SIG_B]);
    expect(prefill?.archetype.confidence).toBe('ambiguous');
    expect(prefill?.archetype.candidates.map((c) => c.slug).sort()).toEqual(
      ['lopunny-dudunsparce', 'n-zoroark'].sort(),
    );
  });

  it('is unique when only the N-Zoroark signature is supplied', () => {
    const prefill = prefillFromBattleLog(LOG_NZOROARK_WIN, 'Gtmap', [SIG_A]);
    expect(prefill?.archetype.confidence).toBe('unique');
    expect(prefill?.archetype.best?.slug).toBe('n-zoroark');
  });

  it('reports playerPinned=false when the supplied name matches neither detected player', () => {
    const prefill = prefillFromBattleLog(LOG_NZOROARK_WIN, 'Unbekannt', [SIG_A]);
    expect(prefill?.playerPinned).toBe(false);
  });

  it('returns null for text with no "Zug von" turn blocks', () => {
    expect(prefillFromBattleLog('nur text', 'Gtmap', [SIG_A])).toBeNull();
  });

  it('returns null for whitespace-only input', () => {
    expect(prefillFromBattleLog('   ', 'Gtmap', [SIG_A])).toBeNull();
  });

  it('never throws on malformed input — a parser failure becomes null', () => {
    expect(() => prefillFromBattleLog('', 'Gtmap', [SIG_A])).not.toThrow();
    expect(prefillFromBattleLog('', 'Gtmap', [SIG_A])).toBeNull();
  });
});
