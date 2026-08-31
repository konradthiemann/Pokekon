// Demo seed: fills a freshly-created anonymous (guest) account with sample decks,
// deck snapshots and documented matches so a visitor can immediately explore the
// recommendation engine and the battle-log analysis WITHOUT signing up or spending
// anyone's LLM token.
//
// The data is hand-crafted to trigger the heuristic recommendations in
// apps/web/src/hooks/useRecommendations.ts:
//   • Version comparison  — Dragapult ex & N's Zoroark go 0% (v1) → ~67% (v2).
//   • Tech suggestions     — ≥5 losing-ish encounters vs Dragapult ex (→ Eri) and
//                            N's Zoroark (→ Briar), neither tech card in the deck.
//   • Missing Boss's Orders — Deck A intentionally has no "Boss's Orders".
//   • Prize-dominated      — two logged blow-out losses where "me" takes ≤1 prize.
// The logged matches also carry pre-baked, evidence-grounded analyses (so the
// MatchDetailModal shows a real analysis with zero API calls).
//
// The local player's in-game name is DEMO_PLAYER ("Gtmap"); the frontend stores it
// under localStorage 'tcg-player-name' on demo entry so the parser pins "me".

import { eq } from 'drizzle-orm';
import type { BattleAnalysis } from '@pokekon/shared';
import type { Db } from '../db/index.js';
import { decks, deckCards, deckSnapshots, opponentLogs } from '../db/schema.js';
import type { SnapshotCard } from '../db/schema.js';
import { syncParsedLog } from './matchLogPipeline.js';

export const DEMO_PLAYER = 'Gtmap';

// ─── Date helpers (server runtime — Date is available here) ─────────────────────

function daysAgoDate(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}
function daysAgoStr(n: number): string {
  return daysAgoDate(n).toISOString().slice(0, 10);
}

// ─── Deck card lists ────────────────────────────────────────────────────────────
// English print names: the recommendation engine matches Trainer names in English
// ("Boss's Orders", "Ultra Ball", "Eri", "Briar"). Counts sum to 60.

type SeedCard = SnapshotCard;

// Deck A — current build ("Regional Build" = snapshot v2). Note: NO Boss's Orders,
// NO Eri, NO Briar → keeps the corresponding recommendations valid. Has ball search.
// Exported so the invariant test can assert those omissions hold.
export const DECK_A_CARDS_V2: SeedCard[] = [
  // Pokémon (14)
  { name: 'Mega Kangaskhan ex', count: 3, type: 'Pokemon', role: 'attacker' },
  { name: 'Teal Mask Ogerpon ex', count: 3, type: 'Pokemon', role: 'attacker' },
  { name: 'Fan Rotom', count: 2, type: 'Pokemon', role: 'tech' },
  { name: 'Latias ex', count: 1, type: 'Pokemon', role: 'tech' },
  { name: 'Munkidori', count: 2, type: 'Pokemon', role: 'tech' },
  { name: 'Fezandipiti ex', count: 2, type: 'Pokemon', role: 'tech' },
  { name: 'Squawkabilly ex', count: 1, type: 'Pokemon', role: 'tech' },
  // Trainers — Supporters (11)
  { name: 'Arven', count: 4, type: 'Trainer', role: 'supporter' },
  { name: 'Iono', count: 3, type: 'Trainer', role: 'supporter' },
  { name: "Professor's Research", count: 2, type: 'Trainer', role: 'supporter' },
  { name: 'Carmine', count: 2, type: 'Trainer', role: 'supporter' },
  // Trainers — Items (21)
  { name: 'Ultra Ball', count: 4, type: 'Trainer', role: 'item' },
  { name: 'Nest Ball', count: 3, type: 'Trainer', role: 'item' },
  { name: 'Buddy-Buddy Poffin', count: 4, type: 'Trainer', role: 'item' },
  { name: 'Earthen Vessel', count: 2, type: 'Trainer', role: 'item' },
  { name: 'Rare Candy', count: 2, type: 'Trainer', role: 'item' },
  { name: 'Switch', count: 2, type: 'Trainer', role: 'item' },
  { name: 'Counter Catcher', count: 1, type: 'Trainer', role: 'item' },
  { name: 'Night Stretcher', count: 2, type: 'Trainer', role: 'item' },
  { name: 'Super Rod', count: 1, type: 'Trainer', role: 'item' },
  // Trainers — Stadiums (2)
  { name: 'Area Zero Underdepths', count: 1, type: 'Trainer', role: 'stadium' },
  { name: 'Gravity Mountain', count: 1, type: 'Trainer', role: 'stadium' },
  // Energy (12)
  { name: 'Basic Grass Energy', count: 5, type: 'Energy', role: 'energy' },
  { name: 'Basic Lightning Energy', count: 4, type: 'Energy', role: 'energy' },
  { name: 'Basic Fighting Energy', count: 3, type: 'Energy', role: 'energy' },
];

// Deck A — older build ("League Cup Build" = snapshot v1). Same shell, a few swaps
// so the deck-comparison panel shows a real diff (the worse Dragapult matchup).
const DECK_A_CARDS_V1: SeedCard[] = [
  { name: 'Mega Kangaskhan ex', count: 3, type: 'Pokemon', role: 'attacker' },
  { name: 'Teal Mask Ogerpon ex', count: 2, type: 'Pokemon', role: 'attacker' },
  { name: 'Fan Rotom', count: 2, type: 'Pokemon', role: 'tech' },
  { name: 'Latias ex', count: 2, type: 'Pokemon', role: 'tech' },
  { name: 'Munkidori', count: 1, type: 'Pokemon', role: 'tech' },
  { name: 'Fezandipiti ex', count: 1, type: 'Pokemon', role: 'tech' },
  { name: 'Squawkabilly ex', count: 1, type: 'Pokemon', role: 'tech' },
  { name: 'Arven', count: 4, type: 'Trainer', role: 'supporter' },
  { name: 'Iono', count: 2, type: 'Trainer', role: 'supporter' },
  { name: "Professor's Research", count: 3, type: 'Trainer', role: 'supporter' },
  { name: 'Carmine', count: 1, type: 'Trainer', role: 'supporter' },
  { name: 'Ultra Ball', count: 4, type: 'Trainer', role: 'item' },
  { name: 'Nest Ball', count: 3, type: 'Trainer', role: 'item' },
  { name: 'Buddy-Buddy Poffin', count: 4, type: 'Trainer', role: 'item' },
  { name: 'Earthen Vessel', count: 2, type: 'Trainer', role: 'item' },
  { name: 'Rare Candy', count: 2, type: 'Trainer', role: 'item' },
  { name: 'Switch', count: 3, type: 'Trainer', role: 'item' },
  { name: 'Night Stretcher', count: 2, type: 'Trainer', role: 'item' },
  { name: 'Super Rod', count: 1, type: 'Trainer', role: 'item' },
  { name: 'Lost City', count: 1, type: 'Trainer', role: 'stadium' },
  { name: 'Basic Grass Energy', count: 5, type: 'Energy', role: 'energy' },
  { name: 'Basic Lightning Energy', count: 5, type: 'Energy', role: 'energy' },
  { name: 'Basic Fighting Energy', count: 3, type: 'Energy', role: 'energy' },
];

// Deck B — secondary deck ("N's Zoroark ex"). Complete list (has Boss's Orders +
// balls) so it generates fewer generic recs; opponents are chosen to be OUTSIDE
// TECH_SUGGESTIONS so they never muddy Deck A's tech recommendations.
const DECK_B_CARDS: SeedCard[] = [
  { name: "N's Zoroark ex", count: 3, type: 'Pokemon', role: 'attacker' },
  { name: "N's Zorua", count: 4, type: 'Pokemon', role: 'attacker' },
  { name: "N's Reshiram", count: 2, type: 'Pokemon', role: 'attacker' },
  { name: "N's Zekrom", count: 1, type: 'Pokemon', role: 'attacker' },
  { name: 'Meowscarada ex', count: 1, type: 'Pokemon', role: 'tech' },
  { name: 'Fezandipiti ex', count: 1, type: 'Pokemon', role: 'tech' },
  { name: "Professor's Research", count: 2, type: 'Trainer', role: 'supporter' },
  { name: 'Iono', count: 3, type: 'Trainer', role: 'supporter' },
  { name: "N's PP Up", count: 3, type: 'Trainer', role: 'supporter' },
  { name: "Boss's Orders", count: 2, type: 'Trainer', role: 'supporter' },
  { name: 'Arven', count: 2, type: 'Trainer', role: 'supporter' },
  { name: 'Ultra Ball', count: 4, type: 'Trainer', role: 'item' },
  { name: 'Nest Ball', count: 3, type: 'Trainer', role: 'item' },
  { name: 'Buddy-Buddy Poffin', count: 2, type: 'Trainer', role: 'item' },
  { name: 'Earthen Vessel', count: 2, type: 'Trainer', role: 'item' },
  { name: 'Night Stretcher', count: 2, type: 'Trainer', role: 'item' },
  { name: 'Counter Catcher', count: 2, type: 'Trainer', role: 'item' },
  { name: 'Switch', count: 1, type: 'Trainer', role: 'item' },
  { name: "N's Castle", count: 2, type: 'Trainer', role: 'stadium' },
  { name: 'Basic Darkness Energy', count: 8, type: 'Energy', role: 'energy' },
  { name: 'Basic Fire Energy', count: 3, type: 'Energy', role: 'energy' },
  { name: 'Basic Lightning Energy', count: 2, type: 'Energy', role: 'energy' },
];

function totalCount(cards: SeedCard[]): number {
  return cards.reduce((s, c) => s + c.count, 0);
}

/** Pull the id from a single-row `.returning({ id })` result, or throw. */
function takeId(rows: { id: number }[]): number {
  const row = rows[0];
  if (row === undefined) throw new Error('demo seed: insert returned no row');
  return row.id;
}

// ─── Battle logs (German PTCG-Live style, local player = Gtmap) ──────────────────

// Headline match: the user's real example — Gtmap (Mega-Kangaskhan) BEATS Premiox
// (N's Zoroark ex). Kept verbatim so the analysis can quote it line-for-line.
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

// Gtmap LOSES to Dragapult ex under the old build (League Cup) — a blow-out where
// Gtmap never takes a prize (drives the "prize-dominated" recommendation).
const LOG_DRAGAPULT_LOSS = `Vorbereitung
Lina hat den Münzwurf gewonnen.
Lina hat für die Starthand 7 Karten gezogen.
Gtmap hat für die Starthand 7 Karten gezogen.

Zug von Lina
Lina hat Dreepy auf die Bank gelegt.
Lina hat Nest Ball gespielt.
Lina hat Basis-Psycho-Energie an Dreepy angelegt.

Zug von Gtmap
Gtmap hat eine Karte gezogen.
Gtmap hat Mega-Kangama-ex in die Aktive Position gelegt.
Gtmap hat Türkisgrüne-Maske-Ogerpon-ex auf die Bank gelegt.

Zug von Lina
Lina hat Rare Candy gespielt.
Lina hat Drakhaja in der Aktiven Position zu Dragapult-ex entwickelt.
Dragapult-ex von Lina hat Phantomschwarm gegen Mega-Kangama-ex von Gtmap für 200 Schadenspunkte eingesetzt.
Mega-Kangama-ex von Gtmap wurde kampfunfähig gemacht!
Lina hat 3 Preiskarten aufgenommen.

Zug von Gtmap
Gtmap hat eine Karte gezogen.
Gtmap hat Latias-ex in die Aktive Position gelegt.
Mega-Kangama-ex von Gtmap hat Besorgung machen eingesetzt.
- Gtmap hat 2 Karten gezogen.

Zug von Lina
Dragapult-ex von Lina hat Phantomschwarm gegen Latias-ex von Gtmap für 200 Schadenspunkte eingesetzt.
Latias-ex von Gtmap wurde kampfunfähig gemacht!
Lina hat 3 Preiskarten aufgenommen.

Lina hat gewonnen!`;

// Gtmap BEATS Dragapult ex under the new build (Regional) — the matchup fix.
const LOG_DRAGAPULT_WIN = `Vorbereitung
Gtmap hat den Münzwurf gewonnen.
Gtmap hat für die Starthand 7 Karten gezogen.
Tobias hat für die Starthand 7 Karten gezogen.

Zug von Gtmap
Gtmap hat Mega-Kangama-ex in die Aktive Position gelegt.
Gtmap hat Hyperball gespielt.
Gtmap hat Furienblitz-ex auf die Bank gelegt.
Gtmap hat Basis-Elektro-Energie an Furienblitz-ex auf der Bank angelegt.

Zug von Tobias
Tobias hat Dreepy auf die Bank gelegt.
Tobias hat Nest Ball gespielt.
Tobias hat Basis-Psycho-Energie an Dreepy angelegt.

Zug von Gtmap
Gtmap hat eine Karte gezogen.
Gtmap hat Basis-Kampf-Energie an Furienblitz-ex auf der Bank angelegt.
Mega-Kangama-ex von Gtmap hat Besorgung machen eingesetzt.
- Gtmap hat 2 Karten gezogen.
Gtmap hat Furienblitz-ex in die Aktive Position gelegt.
Furienblitz-ex von Gtmap hat Kläffender Donner gegen Dreepy von Tobias für 200 Schadenspunkte eingesetzt.
Dreepy von Tobias wurde kampfunfähig gemacht!
Gtmap hat eine Preiskarte aufgenommen.

Zug von Tobias
Tobias hat Rare Candy gespielt.
Dragapult-ex von Tobias hat Phantomschwarm gegen Furienblitz-ex von Gtmap für 120 Schadenspunkte eingesetzt.

Zug von Gtmap
Gtmap hat eine Karte gezogen.
Gtmap hat Basis-Elektro-Energie an Furienblitz-ex auf der Aktiven Position angelegt.
Furienblitz-ex von Gtmap hat Kläffender Donner gegen Dragapult-ex von Tobias für 300 Schadenspunkte eingesetzt.
Dragapult-ex von Tobias wurde kampfunfähig gemacht!
Gtmap hat 2 Preiskarten aufgenommen.

Zug von Tobias
Tobias hat Drakloak in die Aktive Position gelegt.

Zug von Gtmap
Furienblitz-ex von Gtmap hat Kläffender Donner gegen Drakloak von Tobias für 200 Schadenspunkte eingesetzt.
Drakloak von Tobias wurde kampfunfähig gemacht!
Gtmap hat 3 Preiskarten aufgenommen.

Gtmap hat gewonnen!`;

// Gtmap LOSES to N's Zoroark under the old build — second blow-out (prize-dominated).
const LOG_NZOROARK_LOSS = `Vorbereitung
Premiox hat den Münzwurf gewonnen.
Premiox hat für die Starthand 7 Karten gezogen.
Gtmap hat für die Starthand 7 Karten gezogen.

Zug von Premiox
Premiox hat Ns Zorua in die Aktive Position gelegt.
Premiox hat Hyperball gespielt.
Premiox hat Basis-Finsternis-Energie an Ns Zorua angelegt.

Zug von Gtmap
Gtmap hat eine Karte gezogen.
Gtmap hat Mega-Kangama-ex in die Aktive Position gelegt.
Gtmap hat Türkisgrüne-Maske-Ogerpon-ex auf die Bank gelegt.

Zug von Premiox
Premiox hat Ns Zorua in der Aktiven Position zu Ns Zoroark-ex entwickelt.
Ns Zoroark-ex von Premiox hat Nachtjoker gegen Mega-Kangama-ex von Gtmap für 230 Schadenspunkte eingesetzt.
Mega-Kangama-ex von Gtmap wurde kampfunfähig gemacht!
Premiox hat 3 Preiskarten aufgenommen.

Zug von Gtmap
Gtmap hat eine Karte gezogen.
Gtmap hat Latias-ex in die Aktive Position gelegt.

Zug von Premiox
Ns Zoroark-ex von Premiox hat Nachtjoker gegen Latias-ex von Gtmap für 250 Schadenspunkte eingesetzt.
Latias-ex von Gtmap wurde kampfunfähig gemacht!
Premiox hat 3 Preiskarten aufgenommen.

Premiox hat gewonnen!`;

// Gtmap BEATS Raging Bolt Ogerpon under the new build — a favourable matchup.
const LOG_RAGINGBOLT_WIN = `Vorbereitung
Gtmap hat den Münzwurf gewonnen.
Gtmap hat für die Starthand 7 Karten gezogen.
Sven hat für die Starthand 7 Karten gezogen.

Zug von Gtmap
Gtmap hat Mega-Kangama-ex in die Aktive Position gelegt.
Gtmap hat Hyperball gespielt.
Gtmap hat Furienblitz-ex auf die Bank gelegt.
Gtmap hat Basis-Elektro-Energie an Furienblitz-ex auf der Bank angelegt.

Zug von Sven
Sven hat Donnersichel auf die Bank gelegt.
Sven hat Basis-Drachen-Energie an Donnersichel angelegt.

Zug von Gtmap
Gtmap hat eine Karte gezogen.
Gtmap hat Basis-Kampf-Energie an Furienblitz-ex auf der Bank angelegt.
Mega-Kangama-ex von Gtmap hat Besorgung machen eingesetzt.
- Gtmap hat 2 Karten gezogen.

Zug von Sven
Raging-Bolt-ex von Sven hat Kronendonner gegen Mega-Kangama-ex von Gtmap für 180 Schadenspunkte eingesetzt.

Zug von Gtmap
Gtmap hat Furienblitz-ex in die Aktive Position gelegt.
Furienblitz-ex von Gtmap hat Kläffender Donner gegen Raging-Bolt-ex von Sven für 280 Schadenspunkte eingesetzt.
Raging-Bolt-ex von Sven wurde kampfunfähig gemacht!
Gtmap hat 3 Preiskarten aufgenommen.

Zug von Sven
Sven hat Teal-Maske-Ogerpon in die Aktive Position gelegt.

Zug von Gtmap
Furienblitz-ex von Gtmap hat Kläffender Donner gegen Teal-Maske-Ogerpon von Sven für 200 Schadenspunkte eingesetzt.
Teal-Maske-Ogerpon von Sven wurde kampfunfähig gemacht!
Gtmap hat 3 Preiskarten aufgenommen.

Gtmap hat gewonnen!`;

// ─── Pre-baked analyses (every `evidence` is a verbatim log line) ────────────────

const ANALYSIS_NZOROARK_WIN: BattleAnalysis = {
  playerName: 'Gtmap',
  opponentName: 'Premiox',
  summary:
    'Solider Sieg gegen N’s Zoroark ex: Nach einem frühen Mega-Kangama-ex-Verlust übernimmt Furienblitz-ex das Spiel und nimmt mit zwei Kläffender-Donner-Treffern fünf Preiskarten. Premiox gibt auf.',
  keyMoments: [
    {
      turn: 4,
      observation:
        'Furienblitz-ex one-shottet Mega-Schlapor-ex und holt drei Preiskarten zurück ins Spiel.',
      evidence:
        'Furienblitz-ex von Gtmap hat Kläffender Donner gegen Mega-Schlapor-ex von Premiox für 350 Schadenspunkte eingesetzt.',
      impact: 'high',
    },
    {
      turn: 6,
      observation:
        'Zweiter Kläffender Donner räumt Ns Zoroark-ex ab und beendet das Spiel effektiv.',
      evidence:
        'Furienblitz-ex von Gtmap hat Kläffender Donner gegen Ns Zoroark-ex von Premiox für 280 Schadenspunkte eingesetzt.',
      impact: 'high',
    },
  ],
  playMistakes: [
    {
      turn: 3,
      observation:
        'Mega-Kangama-ex blieb aktiv und kassierte 230 Schaden — ein früherer Rückzug hätte den Preis-Tausch vermieden.',
      evidence:
        'Mega-Schlapor-ex von Premiox hat Orkanstoß gegen Mega-Kangama-ex von Gtmap für 230 Schadenspunkte eingesetzt.',
      impact: 'medium',
    },
  ],
  cardNotes: [
    {
      card: 'Furienblitz-ex',
      observation: 'Klarer MVP — zwei Angriffe, fünf Preiskarten.',
      evidence:
        'Furienblitz-ex von Gtmap hat Kläffender Donner gegen Mega-Schlapor-ex von Premiox für 350 Schadenspunkte eingesetzt.',
      deckSuggestion: 'increase',
      deckSuggestionReason: 'Hauptangreifer im Matchup — eine zweite Kopie erhöht die Konsistenz.',
    },
  ],
  deckSuggestions: [],
  analyzedAt: daysAgoStr(6) + 'T18:30:00.000Z',
};

const ANALYSIS_DRAGAPULT_LOSS: BattleAnalysis = {
  playerName: 'Gtmap',
  opponentName: 'Lina',
  summary:
    'Klare Niederlage gegen Dragapult ex (alte Liste): Zwei Phantomschwarm-Treffer räumen Mega-Kangama-ex und Latias-ex ab, ohne dass Gtmap eine einzige Preiskarte nimmt.',
  keyMoments: [
    {
      turn: 3,
      observation: 'Früher Dragapult-ex-Treffer nimmt Mega-Kangama-ex und drei Preiskarten.',
      evidence:
        'Dragapult-ex von Lina hat Phantomschwarm gegen Mega-Kangama-ex von Gtmap für 200 Schadenspunkte eingesetzt.',
      impact: 'high',
    },
  ],
  playMistakes: [
    {
      turn: 4,
      observation:
        'Latias-ex aktiv zu setzen lieferte Dragapult ein weiteres leichtes Ziel für drei Preiskarten.',
      evidence:
        'Dragapult-ex von Lina hat Phantomschwarm gegen Latias-ex von Gtmap für 200 Schadenspunkte eingesetzt.',
      impact: 'high',
    },
  ],
  cardNotes: [
    {
      card: 'Mega-Kangama-ex',
      observation: 'Als Starter zu fragil gegen Dragapults verteilten Schaden.',
      evidence:
        'Dragapult-ex von Lina hat Phantomschwarm gegen Mega-Kangama-ex von Gtmap für 200 Schadenspunkte eingesetzt.',
      deckSuggestion: null,
    },
  ],
  deckSuggestions: [],
  analyzedAt: daysAgoStr(24) + 'T20:05:00.000Z',
};

const ANALYSIS_DRAGAPULT_WIN: BattleAnalysis = {
  playerName: 'Gtmap',
  opponentName: 'Tobias',
  summary:
    'Sieg gegen Dragapult ex mit der neuen Liste: Furienblitz-ex wird früh aufgeladen und nimmt durch drei Kläffender-Donner-Treffer alle sechs Preiskarten.',
  keyMoments: [
    {
      turn: 3,
      observation:
        'Früher Furienblitz-ex-KO setzt das Tempo, bevor Dragapult fertig aufgebaut ist.',
      evidence:
        'Furienblitz-ex von Gtmap hat Kläffender Donner gegen Dreepy von Tobias für 200 Schadenspunkte eingesetzt.',
      impact: 'medium',
    },
    {
      turn: 5,
      observation: 'Furienblitz-ex one-shottet das fertige Dragapult-ex.',
      evidence:
        'Furienblitz-ex von Gtmap hat Kläffender Donner gegen Dragapult-ex von Tobias für 300 Schadenspunkte eingesetzt.',
      impact: 'high',
    },
  ],
  playMistakes: [],
  cardNotes: [
    {
      card: 'Furienblitz-ex',
      observation: 'Trägt das Matchup, sobald zwei Energien liegen.',
      evidence:
        'Furienblitz-ex von Gtmap hat Kläffender Donner gegen Dragapult-ex von Tobias für 300 Schadenspunkte eingesetzt.',
      deckSuggestion: 'increase',
      deckSuggestionReason: 'Zentraler Angreifer gegen Dragapult — Konsistenz lohnt.',
    },
  ],
  deckSuggestions: [],
  analyzedAt: daysAgoStr(5) + 'T17:10:00.000Z',
};

const ANALYSIS_NZOROARK_LOSS: BattleAnalysis = {
  playerName: 'Gtmap',
  opponentName: 'Premiox',
  summary:
    'Niederlage gegen N’s Zoroark ex (alte Liste): Zwei Nachtjoker-Treffer nehmen Mega-Kangama-ex und Latias-ex; Gtmap kommt nie ins Spiel und nimmt keine Preiskarte.',
  keyMoments: [
    {
      turn: 3,
      observation: 'Schneller Ns-Zoroark-ex-KO auf Mega-Kangama-ex für drei Preiskarten.',
      evidence:
        'Ns Zoroark-ex von Premiox hat Nachtjoker gegen Mega-Kangama-ex von Gtmap für 230 Schadenspunkte eingesetzt.',
      impact: 'high',
    },
  ],
  playMistakes: [
    {
      turn: 4,
      observation: 'Ohne Antwort blieb nur, Latias-ex zu opfern — das beendete das Spiel.',
      evidence:
        'Ns Zoroark-ex von Premiox hat Nachtjoker gegen Latias-ex von Gtmap für 250 Schadenspunkte eingesetzt.',
      impact: 'high',
    },
  ],
  cardNotes: [],
  deckSuggestions: [],
  analyzedAt: daysAgoStr(22) + 'T19:40:00.000Z',
};

const ANALYSIS_RAGINGBOLT_WIN: BattleAnalysis = {
  playerName: 'Gtmap',
  opponentName: 'Sven',
  summary:
    'Sieg gegen Raging Bolt Ogerpon: Trotz frühem Kronendonner-Treffer dreht Furienblitz-ex das Spiel und nimmt mit zwei Treffern sechs Preiskarten.',
  keyMoments: [
    {
      turn: 5,
      observation: 'Furienblitz-ex one-shottet das aufgeladene Raging-Bolt-ex.',
      evidence:
        'Furienblitz-ex von Gtmap hat Kläffender Donner gegen Raging-Bolt-ex von Sven für 280 Schadenspunkte eingesetzt.',
      impact: 'high',
    },
  ],
  playMistakes: [],
  cardNotes: [
    {
      card: 'Mega-Kangama-ex',
      observation: 'Guter Starter zum Nachziehen, bevor Furienblitz-ex übernimmt.',
      evidence: 'Mega-Kangama-ex von Gtmap hat Besorgung machen eingesetzt.',
      deckSuggestion: null,
    },
  ],
  deckSuggestions: [],
  analyzedAt: daysAgoStr(4) + 'T16:00:00.000Z',
};

// ─── Match plan ─────────────────────────────────────────────────────────────────
// snapshot: 'v1' (League Cup) | 'v2' (Regional) | null (untagged).

type SnapKey = 'v1' | 'v2' | null;
interface SeedMatch {
  archetype: string; // display name (matches recommendation TECH_SUGGESTIONS keys)
  result: 'W' | 'L' | 'T';
  eventType: 'LC' | 'LCup' | 'Regional' | 'Worlds' | 'Online';
  daysAgo: number;
  snapshot: SnapKey;
  notes: string;
  log?: string;
  analysis?: BattleAnalysis;
}

// Deck A (Mega Kangaskhan ex) — drives every recommendation. Exported so the
// invariant test can assert the matchup distribution still triggers the intended
// recommendations (tech vs bad matchups, version comparison, prize-dominated).
export const DECK_A_MATCHES: SeedMatch[] = [
  // vs Dragapult ex — v1 went 0/3, v2 went 2/1 (→ version rec + tech "Eri").
  {
    archetype: 'Dragapult ex',
    result: 'L',
    eventType: 'LCup',
    daysAgo: 24,
    snapshot: 'v1',
    notes: 'Früh überrannt.',
    log: LOG_DRAGAPULT_LOSS,
    analysis: ANALYSIS_DRAGAPULT_LOSS,
  },
  {
    archetype: 'Dragapult ex',
    result: 'L',
    eventType: 'LCup',
    daysAgo: 23,
    snapshot: 'v1',
    notes: 'Kein Setup.',
  },
  {
    archetype: 'Dragapult ex',
    result: 'L',
    eventType: 'Online',
    daysAgo: 21,
    snapshot: 'v1',
    notes: 'Spread-Schaden zu schnell.',
  },
  {
    archetype: 'Dragapult ex',
    result: 'W',
    eventType: 'Regional',
    daysAgo: 5,
    snapshot: 'v2',
    notes: 'Neue Liste, Furienblitz-Plan.',
    log: LOG_DRAGAPULT_WIN,
    analysis: ANALYSIS_DRAGAPULT_WIN,
  },
  {
    archetype: 'Dragapult ex',
    result: 'W',
    eventType: 'Regional',
    daysAgo: 4,
    snapshot: 'v2',
    notes: 'Sauberer Aufbau.',
  },
  {
    archetype: 'Dragapult ex',
    result: 'L',
    eventType: 'Online',
    daysAgo: 3,
    snapshot: 'v2',
    notes: 'Knapp verloren.',
  },

  // vs N's Zoroark — v1 went 0/2, v2 went 2/1 (→ version rec + tech "Briar").
  {
    archetype: "N's Zoroark",
    result: 'L',
    eventType: 'LCup',
    daysAgo: 22,
    snapshot: 'v1',
    notes: 'Nachtjoker zu stark.',
    log: LOG_NZOROARK_LOSS,
    analysis: ANALYSIS_NZOROARK_LOSS,
  },
  {
    archetype: "N's Zoroark",
    result: 'L',
    eventType: 'Online',
    daysAgo: 20,
    snapshot: 'v1',
    notes: 'Preis-Race verloren.',
  },
  {
    archetype: "N's Zoroark",
    result: 'W',
    eventType: 'Regional',
    daysAgo: 6,
    snapshot: 'v2',
    notes: 'Beispiel-Spiel: Furienblitz dreht auf.',
    log: LOG_NZOROARK_WIN,
    analysis: ANALYSIS_NZOROARK_WIN,
  },
  {
    archetype: "N's Zoroark",
    result: 'W',
    eventType: 'Online',
    daysAgo: 2,
    snapshot: 'v2',
    notes: 'Tempo gehalten.',
  },
  {
    archetype: "N's Zoroark",
    result: 'L',
    eventType: 'Online',
    daysAgo: 1,
    snapshot: 'v2',
    notes: 'Stempel im falschen Moment.',
  },

  // vs Raging Bolt Ogerpon — favourable (3/0), one logged win.
  {
    archetype: 'Raging Bolt Ogerpon',
    result: 'W',
    eventType: 'Regional',
    daysAgo: 4,
    snapshot: 'v2',
    notes: 'Gutes Matchup.',
    log: LOG_RAGINGBOLT_WIN,
    analysis: ANALYSIS_RAGINGBOLT_WIN,
  },
  {
    archetype: 'Raging Bolt Ogerpon',
    result: 'W',
    eventType: 'Online',
    daysAgo: 3,
    snapshot: 'v2',
    notes: 'Schneller Donner.',
  },
  {
    archetype: 'Raging Bolt Ogerpon',
    result: 'W',
    eventType: 'Online',
    daysAgo: 2,
    snapshot: 'v2',
    notes: 'Klar gewonnen.',
  },
];

/**
 * The Deck-A matches that ship with a battle log + pre-baked analysis. Exported
 * so the seed-content verification test can assert each log parses and each
 * analysis survives the evidence-grounding gate (validateAnalysis).
 */
export const DEMO_LOGGED_MATCHES: {
  archetype: string;
  result: 'W' | 'L' | 'T';
  log: string;
  analysis: BattleAnalysis;
}[] = DECK_A_MATCHES.filter(
  (m): m is SeedMatch & { log: string; analysis: BattleAnalysis } =>
    m.log != null && m.analysis != null,
).map((m) => ({ archetype: m.archetype, result: m.result, log: m.log, analysis: m.analysis }));

// Deck B (N's Zoroark ex) — opponents OUTSIDE TECH_SUGGESTIONS, no battle logs.
const DECK_B_MATCHES: SeedMatch[] = [
  {
    archetype: "Ethan's Typhlosion",
    result: 'W',
    eventType: 'Online',
    daysAgo: 12,
    snapshot: null,
    notes: 'Stadtliga-Test.',
  },
  {
    archetype: "Ethan's Typhlosion",
    result: 'W',
    eventType: 'Online',
    daysAgo: 11,
    snapshot: null,
    notes: 'Gut gelaufen.',
  },
  {
    archetype: "Ethan's Typhlosion",
    result: 'L',
    eventType: 'Online',
    daysAgo: 10,
    snapshot: null,
    notes: 'Energie-Probleme.',
  },
  {
    archetype: 'Flareon Noctowl',
    result: 'W',
    eventType: 'Online',
    daysAgo: 9,
    snapshot: null,
    notes: 'Solide.',
  },
  {
    archetype: 'Flareon Noctowl',
    result: 'L',
    eventType: 'Online',
    daysAgo: 8,
    snapshot: null,
    notes: 'Knapp.',
  },
  {
    archetype: "Hop's Zacian",
    result: 'W',
    eventType: 'Online',
    daysAgo: 7,
    snapshot: null,
    notes: 'Tempo gehalten.',
  },
];

// ─── Seed entry point ─────────────────────────────────────────────────────────

/**
 * Idempotently seed demo content for `userId`. No-ops if the account already
 * owns at least one deck (so re-calling /api/demo/seed is safe). Returns whether
 * data was actually written.
 */
export async function seedDemoData(db: Db, userId: string): Promise<{ seeded: boolean }> {
  const existing = await db
    .select({ id: decks.id })
    .from(decks)
    .where(eq(decks.userId, userId))
    .limit(1);
  if (existing.length > 0) return { seeded: false };

  // ── Deck A (created first → becomes the default active deck) ────────────────
  const deckAId = takeId(
    await db
      .insert(decks)
      .values({
        userId,
        archetype: 'mega-kangaskhan-ex',
        archetypeName: 'Mega Kangaskhan ex',
        variant: 'Ogerpon Toolbox',
        createdAt: daysAgoDate(30),
      })
      .returning({ id: decks.id }),
  );

  const deckBId = takeId(
    await db
      .insert(decks)
      .values({
        userId,
        archetype: 'n-zoroark',
        archetypeName: "N's Zoroark ex",
        variant: 'Standard',
        createdAt: daysAgoDate(14),
      })
      .returning({ id: decks.id }),
  );

  // ── Deck cards (current lists) ──────────────────────────────────────────────
  await db.insert(deckCards).values(
    DECK_A_CARDS_V2.map((c) => ({
      deckId: deckAId,
      userId,
      name: c.name,
      count: c.count,
      type: c.type,
      role: c.role,
    })),
  );
  await db.insert(deckCards).values(
    DECK_B_CARDS.map((c) => ({
      deckId: deckBId,
      userId,
      name: c.name,
      count: c.count,
      type: c.type,
      role: c.role,
    })),
  );

  // ── Snapshots for Deck A (v1 older, v2 newer = current) ─────────────────────
  const snapV1Id = takeId(
    await db
      .insert(deckSnapshots)
      .values({
        deckId: deckAId,
        userId,
        label: 'League Cup Build',
        cards: DECK_A_CARDS_V1,
        totalCards: totalCount(DECK_A_CARDS_V1),
        createdAt: daysAgoDate(28),
      })
      .returning({ id: deckSnapshots.id }),
  );

  const snapV2Id = takeId(
    await db
      .insert(deckSnapshots)
      .values({
        deckId: deckAId,
        userId,
        label: 'Regional Build',
        cards: DECK_A_CARDS_V2,
        totalCards: totalCount(DECK_A_CARDS_V2),
        createdAt: daysAgoDate(8),
      })
      .returning({ id: deckSnapshots.id }),
  );

  const snapId = (k: SnapKey): number | null =>
    k === 'v1' ? snapV1Id : k === 'v2' ? snapV2Id : null;

  // Same default rule the log form uses (plan §3.7): Regional/Worlds events are
  // Bo3, everything else Bo1. Demo logs always get a value (plan §6, decision 4).
  const defaultBestOf = (eventType: SeedMatch['eventType']): 'BO1' | 'BO3' =>
    eventType === 'Regional' || eventType === 'Worlds' ? 'BO3' : 'BO1';

  // ── Matches (insert, then parse-on-write for the ones with a battle log) ────
  const allMatches: { deckId: number; match: SeedMatch }[] = [
    ...DECK_A_MATCHES.map((m) => ({ deckId: deckAId, match: m })),
    ...DECK_B_MATCHES.map((m) => ({ deckId: deckBId, match: m })),
  ];

  for (const { deckId, match } of allMatches) {
    const logId = takeId(
      await db
        .insert(opponentLogs)
        .values({
          deckId,
          userId,
          archetype: match.archetype,
          eventType: match.eventType,
          eventDate: daysAgoStr(match.daysAgo),
          result: match.result,
          bestOf: defaultBestOf(match.eventType),
          notes: match.notes,
          deckSnapshotId: snapId(match.snapshot),
          battleLog: match.log ?? null,
          analysis: match.analysis ? JSON.stringify(match.analysis) : null,
        })
        .returning({ id: opponentLogs.id }),
    );

    if (match.log) {
      await syncParsedLog(db, {
        opponentLogId: logId,
        userId,
        battleLog: match.log,
        playerName: DEMO_PLAYER,
      });
    }
  }

  return { seeded: true };
}
