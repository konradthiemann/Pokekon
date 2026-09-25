// Pure logic of the coach "Start" page (Spec 7 §5.2).
import { tournamentWinRatePct, wilsonInterval } from '@pokekon/shared';
import type { ArchetypeStats, Deck, OpponentLog } from '../../types';
import type { FieldAnalysisArchetype } from '../api';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Logs played with any deck of the archetype. */
export function logsOfArchetype(
  logs: readonly OpponentLog[],
  decks: readonly Deck[],
  archetypeId: string,
): OpponentLog[] {
  const deckIds = new Set(decks.filter((d) => d.archetype === archetypeId).map((d) => d.id));
  return logs.filter((l) => l.deckId !== undefined && deckIds.has(l.deckId));
}

export interface RecentForm {
  wins: number;
  losses: number;
  ties: number;
  /** Tie-weighted like every win rate in the app; null without games. */
  winRatePct: number | null;
  /** 95 % Wilson band; null without games. */
  band: { lowPct: number; highPct: number } | null;
}

/** Record of the last `days` calendar days including today (by eventDate, UTC). */
export function recentForm(logs: readonly OpponentLog[], now: Date, days = 7): RecentForm {
  const today = now.toISOString().slice(0, 10);
  const first = new Date(now.getTime() - (days - 1) * DAY_MS).toISOString().slice(0, 10);
  const recent = logs.filter((l) => l.eventDate >= first && l.eventDate <= today);
  const wins = recent.filter((l) => l.result === 'W').length;
  const losses = recent.filter((l) => l.result === 'L').length;
  const ties = recent.filter((l) => l.result === 'T').length;
  const interval = wilsonInterval(wins, losses, ties);
  return {
    wins,
    losses,
    ties,
    winRatePct: tournamentWinRatePct(wins, losses, ties),
    band: interval ? { lowPct: interval.lowPct, highPct: interval.highPct } : null,
  };
}

/** Scheibe 1 knows only these two; experiments, meta-list changes and coaching
 *  hotspots join the priority list with Specs 6 / 5 / 8. */
export type NextStep = { kind: 'adoptList' } | { kind: 'pasteLog' };

export function nextStep(ctx: { hasActiveDeck: boolean; hasLogs: boolean }): NextStep {
  return ctx.hasActiveDeck ? { kind: 'pasteLog' } : { kind: 'adoptList' };
}

function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[’'ʼʹ]/g, "'")
    .trim();
}

export interface FieldRow {
  archetypeId: string;
  name: string;
  sharePct: number;
  /** Own win rate against this archetype (matched by name); null without encounters. */
  ownWinRatePct: number | null;
}

/** Top `n` archetypes of the field by share, with the user's own win rate. */
export function fieldThisWeek(
  field: readonly FieldAnalysisArchetype[],
  own: readonly ArchetypeStats[],
  n = 5,
): FieldRow[] {
  const ownByName = new Map(own.map((s) => [normaliseName(s.archetype), s]));
  return [...field]
    .sort((a, b) => b.sharePct - a.sharePct)
    .slice(0, n)
    .map((a) => {
      const mine = ownByName.get(normaliseName(a.archetypeName));
      return {
        archetypeId: a.archetypeId,
        name: a.archetypeName,
        sharePct: a.sharePct,
        ownWinRatePct: mine && mine.encounters > 0 ? mine.winRate : null,
      };
    });
}
