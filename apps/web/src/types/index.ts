// ─── Core domain types ───────────────────────────────────────────────────────

export type CardType = 'Pokemon' | 'Trainer' | 'Energy';
export type CardRole = 'attacker' | 'supporter' | 'item' | 'stadium' | 'energy' | 'tech';
export type EventType = 'LC' | 'LCup' | 'Regional' | 'Worlds' | 'Online';
/**
 * Outcome of a single match. Ties are recorded but excluded from win-rate calculations
 * throughout the app — only W and L count toward decisive game percentages.
 */
export type MatchResult = 'W' | 'L' | 'T';

// ─── Database entity types ────────────────────────────────────────────────────

export interface Card {
  id?: number;
  name: string;
  set: string;
  number: string;
  type: CardType;
  subtype: string;
}

export interface Deck {
  id?: number;
  archetype: string; // Limitless slug, e.g. "n-zoroark"
  archetypeName: string; // Display name, e.g. "N's Zoroark"
  variant: string; // e.g. "Fezandipiti Build", "Standard"
  createdAt: string;
}

export interface DeckCard {
  id?: number;
  deckId?: number;
  /**
   * Foreign key to the card catalogue. `0` is a sentinel value meaning the card was
   * added via quick-text entry and is not linked to any catalogue record.
   */
  cardId: number;
  name: string;
  count: number;
  type: CardType;
  role: CardRole;
}

/** Snapshot of the deck at a point in time — used to track deck versions */
export interface DeckSnapshot {
  id?: number;
  deckId?: number;
  label: string; // e.g. "N's Zoroark v2 — added Fezandipiti"
  cards: string; // JSON.stringify(DeckCard[])
  totalCards: number;
  createdAt: string; // ISO timestamp
}

/**
 * A single logged match result against an opponent archetype.
 * `deckSnapshotId` optionally links the game to a historical deck version, enabling
 * version-to-version performance comparisons. `analysis` is a JSON-stringified
 * `BattleAnalysis` object — parse it with `JSON.parse` before use.
 */
export interface OpponentLog {
  id?: number;
  deckId?: number;
  archetype: string;
  eventType: EventType;
  eventDate: string; // YYYY-MM-DD
  result: MatchResult;
  notes: string;
  round?: number;
  deckSnapshotId?: number; // which deck version was piloted
  battleLog?: string; // raw battle protocol text
  analysis?: string; // JSON-stringified BattleAnalysis
}

// ─── Deck performance stats (aggregated from battle logs) ────────────────────

export interface CardPerformance {
  card: string;
  totalPlays: number; // total times played across all analyzed games
  gamesPlayed: number; // games where card appeared at least once
  totalGames: number; // total analyzed games (denominator)
  playRate: number; // gamesPlayed / totalGames * 100
  winsWithCard: number;
  lossesWithCard: number;
  winRate: number; // win% in games where played (0 if no decisive games)
  avgPlaysPerGame: number; // totalPlays / gamesPlayed
}

export interface DeckPerformanceStats {
  totalGamesAnalyzed: number;
  overallWinRate: number;
  avgGameLength: number;
  avgGameLengthWins: number;
  avgGameLengthLosses: number;
  avgTurn1Actions: number;
  lowActivityTurnRate: number; // % of player turns with ≤1 card played
  cardPerformance: CardPerformance[];
  prizeEfficiency: {
    avgPrizesOpponentTookInWins: number; // how many prizes opponent took before losing (closeness)
    avgPrizesYouTookInLosses: number; // how many prizes you took before losing
    lossGamesCount: number;
    winGamesCount: number;
  };
}

// ─── Battle log analysis types ────────────────────────────────────────────────
// Defined once in @pokekon/shared (the API produces them, the web renders them);
// re-exported here so existing `../types` imports keep working.

export type {
  BattleAnalysis,
  BattleAnalysisPlay,
  BattleAnalysisCardNote,
  BattleAnalysisDeckSuggestion,
} from '@pokekon/shared';

export interface MetaSnapshot {
  id?: number;
  archetype: string;
  frequencyPct: number; // 0–100
  /** Tournament win rate 0–100. `null` means every game in the sample ended in a tie
   *  or the archetype had no recorded decisive games — it does NOT imply 50%. */
  winRatePct: number | null; // 0–100, null if no decisive games
  wins: number; // raw win count across all fetched tournaments
  losses: number; // raw loss count
  playerCount: number; // how many players ran this archetype
  period: string; // e.g. "2026-W15"
  sourceNote: string;
}

/** A completed tournament from Limitless, used for the Recent Tournaments view (not persisted) */
export interface RecentTournament {
  id: string;
  name: string;
  date: string; // ISO timestamp
  players: number;
  topArchetypes: { name: string; count: number; winRate: number }[];
  /** Archetype that placed 1st (the winner), or null if undeterminable / "Other".
   *  When the winner is not among the top-5-by-count, it replaces the 5th entry. */
  winnerArchetype: string | null;
}

// ─── View / derived types ─────────────────────────────────────────────────────

export interface ArchetypeStats {
  archetype: string;
  encounters: number;
  wins: number;
  losses: number;
  ties: number;
  winRate: number; // 0–100, personal win rate
  frequencyPct: number; // meta share from latest snapshot
  metaWinRate: number; // overall win rate from meta data (0 if unknown)
}

export interface MetaTrendPoint {
  period: string;
  archetype: string;
  frequencyPct: number;
}

export interface DeckRecommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  category: 'add' | 'remove' | 'ratio' | 'tech' | 'version';
  suggestion: string;
  reasoning: string;
  dataPoints: number;
}

export interface DeckVariantStats {
  deckId: number;
  deck: Deck;
  games: number;
  wins: number;
  losses: number;
  ties: number;
  winRate: number; // 0–100
  /** Frequency-weighted win rate, 0–100. Formula: Σ(metaFreq × WR) / Σ(metaFreq of ALL
   *  known archetypes). The denominator intentionally includes untested matchups so gaps
   *  in coverage pull the score down, not just poor results. */
  metaScore: number; // frequency-weighted win rate 0–100
  recentForm: MatchResult[]; // last 10 results, newest first
  matchupBreakdown: {
    archetype: string;
    wins: number;
    losses: number;
    ties: number;
    winRate: number;
    metaFreq: number;
  }[];
}
