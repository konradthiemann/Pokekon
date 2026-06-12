import type { CardRole, CardType, DeckCard } from '../types';
import i18n from '../i18n';
import { listDeckCards, replaceDeckCards } from './api';

// ─── Role inference ───────────────────────────────────────────────────────────

const SUPPORTER_EXACT = new Set([
  "boss's orders",
  'judge',
  "professor's research",
  'arven',
  'iono',
  'marnie',
  'serena',
  'cynthia',
  'colress',
  'lillie',
  'bianca',
  'cyrano',
]);

const SUPPORTER_SUBSTRINGS = [
  "black belt's training",
  "xerosic's machinations",
  "janine's secret art",
  "lillie's determination",
];

// Names that look like supporters (have 's) but are items/stadiums
const KNOWN_NON_SUPPORTERS = new Set([
  "hero's cape",
  "n's pp up",
  'buddy-buddy poffin',
  'poké pad',
  'poke pad',
  "n's castle",
]);

const STADIUM_SUBSTRINGS = [
  "n's castle",
  'stadium',
  'city',
  'village',
  'arena',
  'tower',
  'cave',
  'gym',
  'hideout',
  'frontier',
  'pillar',
  'court',
];

const TECH_POKEMON = [
  'budew',
  'fezandipiti',
  'pecharunt',
  'yveltal',
  'shaymin',
  'manaphy',
  'jirachi',
  'dedenne',
  'crobat',
  'mew',
  'snorlax',
  'radiant',
  'okidogi',
  'munkidori',
  'binacle',
  'cramorant',
];

function inferTrainerRole(name: string): CardRole {
  const lower = name.toLowerCase();
  if (KNOWN_NON_SUPPORTERS.has(lower)) {
    // Distinguish items vs stadiums within the non-supporter set
    for (const s of STADIUM_SUBSTRINGS) {
      if (lower.includes(s)) return 'stadium';
    }
    return 'item';
  }
  if (SUPPORTER_EXACT.has(lower)) return 'supporter';
  for (const s of SUPPORTER_SUBSTRINGS) {
    if (lower.includes(s)) return 'supporter';
  }
  for (const s of STADIUM_SUBSTRINGS) {
    if (lower.includes(s)) return 'stadium';
  }
  // Heuristic: possessive form "'s <word>" often indicates a supporter
  if (/\b\w+'s\s+\w/i.test(name)) return 'supporter';
  return 'item';
}

function inferPokemonRole(name: string): CardRole {
  const lower = name.toLowerCase();
  for (const pat of TECH_POKEMON) {
    if (lower.includes(pat)) return 'tech';
  }
  return 'attacker';
}

// ─── Card line parser ─────────────────────────────────────────────────────────

export interface ParsedCard {
  count: number;
  name: string;
  set: string;
  number: string;
  type: CardType;
  role: CardRole;
}

function parseCardLine(line: string, type: CardType): ParsedCard | null {
  // Split on whitespace; last two tokens = set code + collector number
  const parts = line.trim().split(/\s+/);
  if (parts.length < 4) return null;

  const count = parseInt(parts[0], 10);
  if (isNaN(count) || count < 1) return null;

  const number = parts[parts.length - 1];
  const set = parts[parts.length - 2];

  // Set code: 2–5 uppercase letters, optionally followed by digits
  if (!/^[A-Z]{2,5}[A-Z0-9]*$/.test(set)) return null;

  const name = parts.slice(1, parts.length - 2).join(' ');
  if (!name) return null;

  const role: CardRole =
    type === 'Pokemon'
      ? inferPokemonRole(name)
      : type === 'Trainer'
        ? inferTrainerRole(name)
        : 'energy';

  return { count, name, set, number, type, role };
}

// ─── Section header detection ─────────────────────────────────────────────────

function detectSection(line: string): CardType | null {
  const lower = line.toLowerCase();
  if (/^pok[eé]mon\s*:/.test(lower)) return 'Pokemon';
  if (/^trainer\s*:/.test(lower)) return 'Trainer';
  if (/^energ(ie|y)\s*:/.test(lower)) return 'Energy';
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ImportResult {
  cards: ParsedCard[];
  totalCount: number;
  skippedLines: string[];
}

export function parseDeckList(text: string): ImportResult {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const cards: ParsedCard[] = [];
  const skippedLines: string[] = [];
  let currentType: CardType | null = null;

  for (const line of lines) {
    if (/^(karten insgesamt|total cards?)\s*:/i.test(line)) continue;

    const section = detectSection(line);
    if (section) {
      currentType = section;
      continue;
    }
    if (!currentType) continue;
    if (/^\d+$/.test(line)) continue; // bare count lines

    const card = parseCardLine(line, currentType);
    if (card) {
      cards.push(card);
    } else {
      skippedLines.push(line);
    }
  }

  return { cards, totalCount: cards.reduce((s, c) => s + c.count, 0), skippedLines };
}

/**
 * Imports parsed cards into the deck via the API's atomic PUT semantics:
 * the full target list is built client-side (replace → just the parsed cards;
 * merge → current server list with parsed cards upserted by name) and then
 * replaces the deck's card list in a single request.
 */
export async function importCards(
  cards: ParsedCard[],
  replaceExisting: boolean,
  deckId?: number,
): Promise<void> {
  // Cards always belong to a server deck now — without an active deck there
  // is nothing to import into. Fail loudly instead of guessing.
  if (deckId === undefined) {
    throw new Error(i18n.t('deck:import.noActiveDeck'));
  }

  const toDeckCard = (c: ParsedCard): Omit<DeckCard, 'id'> => ({
    deckId,
    cardId: 0,
    name: c.name,
    count: c.count,
    type: c.type,
    role: c.role,
  });

  let next: Pick<DeckCard, 'name' | 'count' | 'type' | 'role'>[];
  if (replaceExisting) {
    next = cards.map(toDeckCard);
  } else {
    const current = await listDeckCards(deckId);
    const byName = new Map<string, Pick<DeckCard, 'name' | 'count' | 'type' | 'role'>>(
      current.map((c) => [c.name, c]),
    );
    // Parsed cards win over existing entries with the same name (upsert).
    for (const c of cards) byName.set(c.name, toDeckCard(c));
    next = [...byName.values()];
  }

  await replaceDeckCards(deckId, next);
}
