# Data Types

All shared TypeScript types are defined in `src/types/index.ts`. This document explains each type in plain language, including what the values mean and how they are used in practice.

---

## Primitive Union Types

### `CardType`
```typescript
type CardType = 'Pokemon' | 'Trainer' | 'Energy';
```
The three card categories in the Pokemon TCG. Used to group cards in the deck list and to infer the role during import.

### `CardRole`
```typescript
type CardRole = 'attacker' | 'supporter' | 'item' | 'stadium' | 'energy' | 'tech';
```
A more granular classification than `CardType`. The role is **inferred** during deck import by `src/lib/deckImport.ts` — it is never entered manually. Rules:
- `Pokemon` cards are `'attacker'` by default, or `'tech'` if the name matches a known tech-Pokemon list (Budew, Fezandipiti, Pecharunt, etc.)
- `Trainer` cards are classified as `'supporter'`, `'item'`, or `'stadium'` based on name heuristics
- `Energy` cards are always `'energy'`

### `EventType`
```typescript
type EventType = 'LC' | 'LCup' | 'Regional' | 'Worlds' | 'Online';
```
The type of event where a match was played. `LC` = League Challenge, `LCup` = League Cup.

### `MatchResult`
```typescript
type MatchResult = 'W' | 'L' | 'T';
```
Win, Loss, or Tie. Ties are tracked but excluded from win-rate calculations (`winRate = wins / (wins + losses)`).

---

## Database Entity Types

These are the types that map directly to IndexedDB tables.

### `Card`
```typescript
interface Card {
  id?: number;
  name: string;
  set: string;
  number: string;
  type: CardType;
  subtype: string;
}
```
A card definition. The `id` is optional because it is assigned by Dexie on insert. The `set` field holds the set code (e.g., `"TWM"`) and `number` holds the collector number (e.g., `"189"`). In practice, the `cards` table is rarely queried directly — card data is denormalized into `deckCards`.

### `Deck`
```typescript
interface Deck {
  id?: number;
  archetype: string;
  archetypeName: string;
  variant: string;
  createdAt: string;
}
```
One row per deck the user manages. The distinction between `archetype` and `archetypeName`:
- `archetype` is the **Limitless slug** (lowercase, hyphen-separated, e.g. `"n-zoroark"`). This is used when matching against Limitless API tournament data.
- `archetypeName` is the **display name** (e.g., `"N's Zoroark"`). This is what the user sees in the UI.
- `variant` describes the specific build within an archetype (e.g., `"Fezandipiti Build"`). Multiple deck rows can share the same `archetype` and `archetypeName` but have different `variant` labels.

### `DeckCard`
```typescript
interface DeckCard {
  id?: number;
  deckId?: number;
  cardId: number;
  name: string;
  count: number;
  type: CardType;
  role: CardRole;
}
```
One row per distinct card in a deck. `count` is how many copies are in the list (1–4). The `cardId` is a foreign key to the `cards` table, but in practice it is often `0` when the card was imported from a text list without a matching card entry.

### `DeckSnapshot`
```typescript
interface DeckSnapshot {
  id?: number;
  deckId?: number;
  label: string;
  cards: string;
  totalCards: number;
  createdAt: string;
}
```
A frozen copy of a deck's card list at a specific point in time. The `cards` field is `JSON.stringify(DeckCard[])` — the full array serialized as a string. Use `parseDeckSnapshot(snap)` from `queries.ts` to get it back as an array. The `label` is a free-text user description, typically describing what changed in that version (e.g., `"Added Fezandipiti, -1 Judge"`).

### `OpponentLog`
```typescript
interface OpponentLog {
  id?: number;
  deckId?: number;
  archetype: string;
  eventType: EventType;
  eventDate: string;
  result: MatchResult;
  notes: string;
  round?: number;
  deckSnapshotId?: number;
  battleLog?: string;
  analysis?: string;
}
```
One row per match played. This is the primary personal-data table. Key fields:
- `archetype`: The opponent's deck archetype. This is entered manually and must match the names used in `metaSnapshots` for win-rate correlation to work.
- `deckSnapshotId`: Optional. When set, it links this match to the deck version that was played. This is what powers the "version comparison" recommendations.
- `battleLog`: The raw text copied from TCG Live's battle protocol (in German). Optional — only present when the user pastes it in.
- `analysis`: `JSON.stringify(BattleAnalysis)` — the result of Claude AI analyzing the battle log. Only present after the user triggers analysis.

---

## Deck Performance Types

These types represent aggregated statistics computed from battle logs in `src/lib/deckPerformanceStats.ts`.

### `CardPerformance`
```typescript
interface CardPerformance {
  card: string;
  totalPlays: number;
  gamesPlayed: number;
  totalGames: number;
  playRate: number;
  winsWithCard: number;
  lossesWithCard: number;
  winRate: number;
  avgPlaysPerGame: number;
}
```
Performance stats for a single card across all analyzed battle logs. Definitions:
- `playRate`: `gamesPlayed / totalGames * 100` — what percentage of games this card was played at all
- `winRate`: `winsWithCard / (winsWithCard + lossesWithCard) * 100` — win rate in games where the card was played (0 when no decisive games)
- `avgPlaysPerGame`: `totalPlays / gamesPlayed` — how often the card is played per game it appears in

Cards played in fewer than 2 games are excluded from the output.

### `DeckPerformanceStats`
```typescript
interface DeckPerformanceStats {
  totalGamesAnalyzed: number;
  overallWinRate: number;
  avgGameLength: number;
  avgGameLengthWins: number;
  avgGameLengthLosses: number;
  avgTurn1Actions: number;
  lowActivityTurnRate: number;
  cardPerformance: CardPerformance[];
  prizeEfficiency: {
    avgPrizesOpponentTookInWins: number;
    avgPrizesYouTookInLosses: number;
    lossGamesCount: number;
    winGamesCount: number;
  };
}
```
The top-level aggregation result. The `prizeEfficiency` object measures how close games are:
- `avgPrizesOpponentTookInWins`: How many prizes the opponent took before you won. Lower = more dominant wins.
- `avgPrizesYouTookInLosses`: How many prizes you took before losing. Higher = you were close to winning even in losses.
- `lowActivityTurnRate`: Percentage of your turns where you played 1 or fewer cards. A high value (>35%) is a "brick rate" signal.

---

## Battle Log Analysis Types

These types represent the structured output from Claude AI's battle log analysis in `src/lib/battleLogAnalysis.ts`.

### `BattleAnalysisPlay`
```typescript
interface BattleAnalysisPlay {
  turn: number;
  observation: string;
  evidence: string;
  suggestion?: string;
  impact: 'high' | 'medium' | 'low';
}
```
One notable play or mistake, with the turn it occurred and a mandatory verbatim quote from the battle log as `evidence`. The evidence requirement is an anti-hallucination measure: any item whose evidence cannot be found in the raw log is discarded after parsing.

### `BattleAnalysisCardNote`
```typescript
interface BattleAnalysisCardNote {
  card: string;
  observation: string;
  evidence: string;
  deckSuggestion?: 'add' | 'remove' | 'increase' | 'decrease' | null;
  deckSuggestionReason?: string;
}
```
An observation about a specific card's performance during the game. The optional `deckSuggestion` and `deckSuggestionReason` fields carry card-level deck change recommendations from the AI.

### `BattleAnalysis`
```typescript
interface BattleAnalysis {
  playerName: string;
  opponentName: string;
  summary: string;
  keyMoments: BattleAnalysisPlay[];
  playMistakes: BattleAnalysisPlay[];
  cardNotes: BattleAnalysisCardNote[];
  deckSuggestions: {
    action: 'add' | 'remove' | 'increase' | 'decrease';
    card: string;
    reasoning: string;
    evidence: string;
  }[];
  analyzedAt: string;
}
```
The complete analysis of one match. Stored in `opponentLogs.analysis` as a JSON string. All four arrays (`keyMoments`, `playMistakes`, `cardNotes`, `deckSuggestions`) are validated after Claude returns the response — items whose `evidence` field cannot be found in the raw log are silently removed.

---

## Meta Data Types

### `MetaSnapshot`
```typescript
interface MetaSnapshot {
  id?: number;
  archetype: string;
  frequencyPct: number;
  winRatePct: number;
  wins: number;
  losses: number;
  playerCount: number;
  period: string;
  sourceNote: string;
}
```
One archetype's stats for one week. The `period` field uses the ISO week format `YYYY-Www` (e.g., `"2026-W15"`). The `sourceNote` is auto-generated during sync and describes which tournaments and how many players were included.

### `RecentTournament`
```typescript
interface RecentTournament {
  id: string;
  name: string;
  date: string;
  players: number;
  topArchetypes: { name: string; count: number; winRate: number }[];
}
```
A single tournament entry fetched from Limitless. This is **not persisted** to IndexedDB — it is fetched on demand and stored only in Zustand's `recentTournaments` array. `topArchetypes` contains up to 5 archetypes sorted by player count.

---

## View / Derived Types

These types are computed from raw data and are never written to the database.

### `ArchetypeStats`
```typescript
interface ArchetypeStats {
  archetype: string;
  encounters: number;
  wins: number;
  losses: number;
  ties: number;
  winRate: number;
  frequencyPct: number;
  metaWinRate: number;
}
```
Per-archetype summary combining personal match history and meta data. Computed by `getArchetypeStats()` in `queries.ts`. The `frequencyPct` and `metaWinRate` come from the latest `metaSnapshots`; everything else comes from `opponentLogs`. Sorted by `frequencyPct` descending, then by `encounters` descending.

### `MetaTrendPoint`
```typescript
interface MetaTrendPoint {
  period: string;
  archetype: string;
  frequencyPct: number;
}
```
One data point for a trend chart. Used when plotting how an archetype's meta share has changed across multiple weeks.

### `DeckRecommendation`
```typescript
interface DeckRecommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  category: 'add' | 'remove' | 'ratio' | 'tech' | 'version';
  suggestion: string;
  reasoning: string;
  dataPoints: number;
}
```
One recommendation from the `useRecommendations` hook. The `id` is a stable string like `"tech-Dragapult ex"` or `"version-overall-decline"`. The `category` classifies the type of change recommended. `dataPoints` is the number of game logs that back the recommendation — used for sorting (more data = shown first within same priority).

### `DeckVariantStats`
```typescript
interface DeckVariantStats {
  deckId: number;
  deck: Deck;
  games: number;
  wins: number;
  losses: number;
  ties: number;
  winRate: number;
  metaScore: number;
  recentForm: MatchResult[];
  matchupBreakdown: {
    archetype: string;
    wins: number;
    losses: number;
    ties: number;
    winRate: number;
    metaFreq: number;
  }[];
}
```
Per-deck performance stats used in the `DeckAnalyticsPanel` to compare multiple variants of the same archetype. The `metaScore` is a frequency-weighted win rate: `Σ(metaFreq × WR) / Σ(metaFreq)`, computed only over matchups with at least 2 decisive games and a known meta frequency. `recentForm` is the last 10 match results, newest first.
