// Pokémon TCG Live (PTCGL) deck export — the inverse of the web app's
// `parseDeckList` (apps/web/src/lib/deckImport.ts). Pure functions, no I/O.
//
// Format (PTCGL "copy deck list", as also produced by Limitless):
//
//   Pokémon: 17
//   4 N's Zorua JTG 97
//   …
//
//   Trainer: 35
//   …
//
//   Energy: 8
//   8 Basic {D} Energy SVE 7
//
//   Total Cards: 60
//
// Section headers carry the SUM of card copies in that section. PTCGL resolves
// a card by set code + collector number, so a line without a print can only be
// resolved by name (if at all) — `exportDeckList` reports those lines in
// `missingPrints` instead of silently emitting them as if they were complete.

import { normalizeCardName } from './cardPerformance.js';
import type { TournamentDecklist } from './meta.js';

export type ExportCardType = 'Pokemon' | 'Trainer' | 'Energy';

export interface ExportCard {
  name: string;
  count: number;
  type: ExportCardType;
  /** PTCGL set code, e.g. "JTG". Missing → the line has no print. */
  set?: string | null | undefined;
  /** Collector number within the set, e.g. "97". */
  number?: string | null | undefined;
}

export type ExportLanguage = 'en' | 'de';

export interface DeckExportResult {
  text: string;
  totalCards: number;
  /** Names of cards exported without set code + number (PTCGL may not resolve them). */
  missingPrints: string[];
}

/** One basic-Energy type: PTCGL's `{X}` symbol, the SVE collector number of
 *  its regular print, and the English/German type words used in card names. */
interface BasicEnergyType {
  symbol: string;
  sveNumber: string;
  words: string[];
}

/** SVE (Scarlet & Violet Energies) regular prints 1–8. */
export const BASIC_ENERGY_TYPES: readonly BasicEnergyType[] = [
  { symbol: 'G', sveNumber: '1', words: ['grass', 'pflanzen'] },
  { symbol: 'R', sveNumber: '2', words: ['fire', 'feuer'] },
  { symbol: 'W', sveNumber: '3', words: ['water', 'wasser'] },
  { symbol: 'L', sveNumber: '4', words: ['lightning', 'elektro'] },
  { symbol: 'P', sveNumber: '5', words: ['psychic', 'psycho'] },
  { symbol: 'F', sveNumber: '6', words: ['fighting', 'kampf'] },
  { symbol: 'D', sveNumber: '7', words: ['darkness', 'dark', 'finsternis'] },
  { symbol: 'M', sveNumber: '8', words: ['metal', 'metall'] },
];

/**
 * Recognises a basic Energy by name, in any of the spellings seen in the wild:
 * "Basic {D} Energy" (PTCGL), "Darkness Energy" (Limitless),
 * "Basic Darkness Energy", "Basis-Finsternis-Energie" (German client).
 * Special Energy ("Jet Energy", "Mist Energy", …) returns null.
 */
export function basicEnergyType(name: string): BasicEnergyType | null {
  const n = name.trim().toLowerCase();
  const symbol = /^basic \{([a-z])\} energy$/.exec(n)?.[1]?.toUpperCase();
  if (symbol) return BASIC_ENERGY_TYPES.find((e) => e.symbol === symbol) ?? null;

  const english = /^(?:basic )?([a-z]+) energy$/.exec(n)?.[1];
  const german = /^basis-([a-zäöü]+)-energie$/.exec(n)?.[1];
  const word = english ?? german;
  if (!word) return null;
  return BASIC_ENERGY_TYPES.find((e) => e.words.includes(word)) ?? null;
}

const HEADERS: Record<ExportLanguage, Record<ExportCardType | 'total', string>> = {
  en: { Pokemon: 'Pokémon', Trainer: 'Trainer', Energy: 'Energy', total: 'Total Cards' },
  de: { Pokemon: 'Pokémon', Trainer: 'Trainer', Energy: 'Energie', total: 'Karten insgesamt' },
};

const SECTION_ORDER: readonly ExportCardType[] = ['Pokemon', 'Trainer', 'Energy'];

interface Line {
  name: string;
  count: number;
  set: string | null;
  number: string | null;
}

function hasPrint(c: { set?: string | null; number?: string | null }): boolean {
  return !!c.set && !!c.number;
}

/** Resolve one card to its export line: basic Energy without a print gets the
 *  canonical PTCGL spelling and its regular SVE print. */
function toLine(card: ExportCard): Line {
  const set = card.set?.trim() || null;
  const number = card.number?.trim() || null;
  if (card.type === 'Energy') {
    const energy = basicEnergyType(card.name);
    if (energy) {
      const name = `Basic {${energy.symbol}} Energy`;
      return hasPrint({ set, number })
        ? { name, count: card.count, set, number }
        : { name, count: card.count, set: 'SVE', number: energy.sveNumber };
    }
  }
  return { name: card.name.trim(), count: card.count, set, number };
}

/** Merge lines that point at the same print (same name + set + number). */
function mergeLines(lines: Line[]): Line[] {
  const byKey = new Map<string, Line>();
  for (const l of lines) {
    const key = `${normalizeCardName(l.name)}|${l.set ?? ''}|${l.number ?? ''}`;
    const existing = byKey.get(key);
    if (existing) existing.count += l.count;
    else byKey.set(key, { ...l });
  }
  return [...byKey.values()];
}

function formatLine(l: Line): string {
  return l.set && l.number ? `${l.count} ${l.name} ${l.set} ${l.number}` : `${l.count} ${l.name}`;
}

/**
 * Formats a deck as a PTCGL deck list. Card order within a section is kept as
 * given (callers decide the order); empty sections are omitted, like PTCGL does.
 */
export function exportDeckList(
  cards: readonly ExportCard[],
  opts: { lang?: ExportLanguage } = {},
): DeckExportResult {
  const headers = HEADERS[opts.lang ?? 'en'];
  const blocks: string[] = [];
  const missingPrints: string[] = [];
  let totalCards = 0;

  for (const type of SECTION_ORDER) {
    const lines = mergeLines(
      cards.filter((c) => c.type === type && c.count > 0).map((c) => toLine(c)),
    );
    if (lines.length === 0) continue;
    const sectionTotal = lines.reduce((s, l) => s + l.count, 0);
    totalCards += sectionTotal;
    for (const l of lines) if (!hasPrint(l)) missingPrints.push(l.name);
    blocks.push([`${headers[type]}: ${sectionTotal}`, ...lines.map(formatLine)].join('\n'));
  }

  blocks.push(`${headers.total}: ${totalCards}`);
  return { text: blocks.join('\n\n'), totalCards, missingPrints };
}

/** Adapter for published tournament decklists (Limitless shape). */
export function exportCardsFromDecklist(decklist: TournamentDecklist): ExportCard[] {
  const map = (entries: TournamentDecklist['pokemon'], type: ExportCardType): ExportCard[] =>
    entries.map((e) => ({ name: e.name, count: e.count, type, set: e.set, number: e.number }));
  return [
    ...map(decklist.pokemon, 'Pokemon'),
    ...map(decklist.trainer, 'Trainer'),
    ...map(decklist.energy, 'Energy'),
  ];
}
