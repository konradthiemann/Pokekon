import i18n from '../i18n';
import type { DeckCard } from '../types';
import { normalizeCardName } from '@pokekon/shared';
import type { ArchetypeCardStat, CardPerformanceDelta, CardSignalTier } from '@pokekon/shared';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CardStat {
  name: string;
  cardType: 'pokemon' | 'trainer' | 'energy';
  /** % of tournament lists that include this card */
  frequency: number;
  /** Average copy count in all lists that include this card */
  avgCount: number;
  /** Average copy count in top-placing lists (top 30%) */
  topAvgCount: number;
  /** Is the card in the user's current deck? */
  inUserDeck: boolean;
  /** How many copies the user runs */
  userCount: number;
  /** Precomputed performance delta from our own DB (plan
   *  .claude/plans/recommendation-to-prognosis.md §3.7). undefined = no
   *  server data for this card (different tournament population, cold
   *  start, older server). Attached additively by `attachCardDeltas`,
   *  never computed here. */
  delta?: CardPerformanceDelta;
  /** Signal classification. undefined when `delta` is undefined. */
  tier?: CardSignalTier;
}

export interface ComparisonResult {
  archetypeSlug: string;
  listsAnalyzed: number;
  topListsAnalyzed: number;
  /** All cards sorted by frequency desc */
  cardStats: CardStat[];
  /** High-frequency cards missing from user's deck (freq >= 55%) */
  suggestedAdds: CardStat[];
  /** Low-frequency cards present in user's deck (freq <= 20%) */
  suggestedRemoves: CardStat[];
  /** Cards where user count differs from typical by ≥1 (freq >= 50%) */
  countAdjustments: { name: string; userCount: number; typicalCount: number; diff: number }[];
  fetchedAt: Date;
  /** Provenance of the delta signal — deliberately SEPARATE from the
   *  frequency numbers above, which come from a different tournament
   *  population (plan section 6, risk 5). null/undefined when no delta
   *  data has been attached. */
  cardStatsSource?: {
    computedAt: string | null;
    windowDays: number;
    listsAnalyzed: number;
  } | null;
}

// ─── Fetch helper ─────────────────────────────────────────────────────────────

const BASE = 'https://play.limitlesstcg.com';
const CORS_PROXY = 'https://corsproxy.io/?';

async function limitlessFetch(path: string): Promise<Response> {
  const url = `${BASE}${path}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return res;
    throw new Error(`HTTP ${res.status}`);
  } catch {
    return fetch(`${CORS_PROXY}${encodeURIComponent(url)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
  }
}

// ─── Slug matching ────────────────────────────────────────────────────────────

/**
 * Returns true when the tournament's deck.id is a reasonable match for the
 * user-supplied slug.
 *
 * Only the forward direction is checked: the Limitless deck ID may contain the
 * user's slug as a substring, but not vice versa. The reverse direction
 * (`b.includes(a)`) was removed because a short slug like "ex" would otherwise
 * match every "dragapult-ex", "gardevoir-ex", etc., producing wildly incorrect
 * comparisons. Prefer slugs of 8+ characters for best accuracy.
 */
function slugMatches(deckId: string, userSlug: string): boolean {
  const a = deckId.toLowerCase();
  const b = userSlug.toLowerCase().trim();
  return a === b || a.includes(b);
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface TourneyEntry {
  id: string;
  name: string;
  players: number;
}

interface StandingEntry {
  deck?: { id: string; name: string };
  placing: number | null;
  record: { wins: number; losses: number; ties: number };
  decklist?: {
    pokemon: { name: string; count: number }[];
    trainer: { name: string; count: number }[];
    energy: { name: string; count: number }[];
  };
}

/**
 * Fetches public tournament decklists from Limitless TCG and compares them
 * against the user's current deck to surface card additions, removals, and
 * copy-count adjustments.
 *
 * `archetypeSlug` must match Limitless's internal deck identifier format
 * (e.g. "dragapult-ex", "n-zoroark", "alakazam-dudunsparce"). If no public
 * decklists are found for the slug, the function throws with a hint message
 * rather than returning an empty result.
 * "Top-placing" is defined as finishing in the top 30% of a tournament's
 * field; `topAvgCount` stats use this subset, falling back to all lists when
 * fewer than 3 top lists are available.
 *
 * @param archetypeSlug - Limitless deck identifier (kebab-case).
 * @param userDeck - The player's current deck cards used for diff comparison.
 * @param onProgress - Optional callback for progress messages shown in the UI.
 * @returns Aggregated card statistics and suggested deck changes.
 */
export async function fetchArchetypeComparison(
  archetypeSlug: string,
  userDeck: DeckCard[],
  onProgress?: (msg: string) => void,
): Promise<ComparisonResult> {
  onProgress?.(i18n.t('recommendations:comparison.progress.fetching'));

  const tourRes = await limitlessFetch(
    '/api/tournaments?game=PTCG&completed=true&limit=50&format=standard',
  );
  if (!tourRes.ok) throw new Error(i18n.t('recommendations:comparison.errors.fetchFailed'));
  const allTourneys: TourneyEntry[] = await tourRes.json();

  // Top 8 largest events (more players → more archetype diversity & decklists)
  const eligible = allTourneys
    .filter((t) => t.players >= 30)
    .sort((a, b) => b.players - a.players)
    .slice(0, 8);

  // Collect decklists submitted by players of this archetype
  type ListEntry = {
    cards: { name: string; count: number; cardType: string }[];
    placing: number | null;
    totalPlayers: number;
  };
  const allLists: ListEntry[] = [];

  for (const t of eligible) {
    try {
      onProgress?.(
        i18n.t('recommendations:comparison.progress.scanning', {
          name: t.name,
          players: t.players,
        }),
      );
      const res = await limitlessFetch(`/api/tournaments/${t.id}/standings`);
      if (!res.ok) continue;

      const standings: StandingEntry[] = await res.json();
      const total = standings.length;

      for (const p of standings) {
        const id = p.deck?.id ?? '';
        if (!slugMatches(id, archetypeSlug)) continue;
        if (!p.decklist) continue;

        const cards = [
          ...p.decklist.pokemon.map((c) => ({ ...c, cardType: 'pokemon' as const })),
          ...p.decklist.trainer.map((c) => ({ ...c, cardType: 'trainer' as const })),
          ...p.decklist.energy.map((c) => ({ ...c, cardType: 'energy' as const })),
        ];
        if (cards.length > 0) allLists.push({ cards, placing: p.placing, totalPlayers: total });
      }
    } catch (err) {
      console.warn(`[deckComparison] Skipped tournament:`, err);
    }
  }

  if (allLists.length === 0) {
    throw new Error(
      i18n.t('recommendations:comparison.errors.noListsFound', { slug: archetypeSlug }),
    );
  }

  // Top-placing lists = top 30% of their event
  const topLists = allLists.filter(
    (l) => l.placing != null && l.totalPlayers > 0 && l.placing <= Math.ceil(l.totalPlayers * 0.3),
  );
  const topListsToUse = topLists.length >= 3 ? topLists : allLists;

  onProgress?.(
    i18n.t('recommendations:comparison.progress.analyzing', {
      lists: allLists.length,
      top: topListsToUse.length,
    }),
  );

  // Aggregate card stats
  type RawStat = {
    cardType: string;
    totalCount: number;
    listsCount: number;
    topTotal: number;
    topCount: number;
  };
  const statsMap = new Map<string, RawStat>();

  for (const list of allLists) {
    // A card can appear as more than one printing (different set/number)
    // within the same list — that must count as ONE inclusion for this
    // list, with copies summed, or frequency can exceed 100%.
    const countedInThisList = new Set<string>();
    for (const c of list.cards) {
      const s = statsMap.get(c.name) ?? {
        cardType: c.cardType,
        totalCount: 0,
        listsCount: 0,
        topTotal: 0,
        topCount: 0,
      };
      s.totalCount += c.count;
      if (!countedInThisList.has(c.name)) {
        s.listsCount++;
        countedInThisList.add(c.name);
      }
      statsMap.set(c.name, s);
    }
  }
  for (const list of topListsToUse) {
    const countedInThisList = new Set<string>();
    for (const c of list.cards) {
      const s = statsMap.get(c.name);
      if (s) {
        s.topTotal += c.count;
        if (!countedInThisList.has(c.name)) {
          s.topCount++;
          countedInThisList.add(c.name);
        }
      }
    }
  }

  // Build user card lookup
  const userMap = new Map(userDeck.map((c) => [c.name.toLowerCase(), c]));

  const cardStats: CardStat[] = [];
  for (const [name, s] of statsMap) {
    const frequency = Math.round((s.listsCount / allLists.length) * 100);
    const avgCount = s.listsCount > 0 ? Math.round((s.totalCount / s.listsCount) * 10) / 10 : 0;
    const topAvgCount = s.topCount > 0 ? Math.round((s.topTotal / s.topCount) * 10) / 10 : avgCount;
    const userCard = userMap.get(name.toLowerCase());

    cardStats.push({
      name,
      cardType: s.cardType as 'pokemon' | 'trainer' | 'energy',
      frequency,
      avgCount,
      topAvgCount,
      inUserDeck: userCard != null,
      userCount: userCard?.count ?? 0,
    });
  }

  cardStats.sort((a, b) => b.frequency - a.frequency);

  const suggestedAdds = cardStats.filter((c) => c.frequency >= 55 && !c.inUserDeck);
  const suggestedRemoves = cardStats.filter((c) => c.frequency <= 20 && c.inUserDeck);
  const countAdjustments = cardStats
    .filter((c) => c.inUserDeck && c.frequency >= 50)
    .map((c) => ({
      name: c.name,
      userCount: c.userCount,
      typicalCount: Math.round(c.topAvgCount),
      diff: Math.round(c.topAvgCount) - c.userCount,
    }))
    .filter((c) => Math.abs(c.diff) >= 1);

  return {
    archetypeSlug,
    listsAnalyzed: allLists.length,
    topListsAnalyzed: topListsToUse.length,
    cardStats,
    suggestedAdds,
    suggestedRemoves,
    countAdjustments,
    fetchedAt: new Date(),
  };
}

// ─── Delta join (plan .claude/plans/recommendation-to-prognosis.md §3.7) ──────

/**
 * Pure join: attaches precomputed server-side card-performance deltas to an
 * existing ComparisonResult by normalised card name. Never removes, reorders
 * or recomputes anything that `fetchArchetypeComparison` produced —
 * `suggestedAdds`/`suggestedRemoves`/`countAdjustments` keep their existing
 * frequency-based membership untouched, because they were built by filtering
 * the SAME `cardStats` array: mutating each matched `CardStat` in place (not
 * rebuilding any array) is what makes the delta land on the identical object
 * instance wherever it is referenced. Cards with no matching server row are
 * returned unchanged (`delta`/`tier` stay undefined). No I/O, so it is
 * unit-testable without a network.
 */
export function attachCardDeltas(
  result: ComparisonResult,
  stats: ArchetypeCardStat[],
  source: NonNullable<ComparisonResult['cardStatsSource']>,
): ComparisonResult {
  const byName = new Map<string, ArchetypeCardStat>();
  for (const stat of stats) {
    byName.set(normalizeCardName(stat.cardName), stat);
  }

  for (const card of result.cardStats) {
    const match = byName.get(normalizeCardName(card.name));
    if (!match) continue;
    // `delta` is null only for mathematical undefinedness (empty group) on
    // the server side — the client type keeps that case as `undefined`
    // rather than widening CardStat.delta to accept `null` too.
    card.delta = match.delta ?? undefined;
    card.tier = match.tier;
  }

  return { ...result, cardStatsSource: source };
}
