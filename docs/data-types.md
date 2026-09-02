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
The type of event where a match was played. `LC` = League Challenge, `LCup` = League Cup. **Not** the match format — see `BestOf` below; `EventType` only feeds `BestOf`'s *default* (Regional/Worlds → Bo3, else Bo1) in the log form, it is never used to infer the format for an already-logged match.

### `BestOf` (`@pokekon/shared`)
```typescript
const BEST_OF_VALUES = ['BO1', 'BO3'] as const;
type BestOf = (typeof BEST_OF_VALUES)[number];
```
Whether a logged match was single-game (Bo1) or best-of-three (Bo3). Lives on `OpponentLog.bestOf` as `BestOf | undefined` — `undefined` means "format unknown" (a log written before this field existed), never a silently-assumed default. Used to convert a Bo3 win rate back to its Bo1 equivalent (`bo1ToBo3WinRate`/`bo3ToBo1WinRate`, closed-form inverse of `P_Bo3 = 3p² − 2p³`) so a mixed Bo1/Bo3 personal record can be compared to the Bo1-only meta baseline (`bo1EquivalentWinRate`).

### `MatchResult`
```typescript
type MatchResult = 'W' | 'L' | 'T';
```
Win, Loss, or Tie. **Semantic change:** meta snapshots, the matchup matrix and `ArchetypeStats.winRate` now weight a tie as **a third of a win** (`tournamentWinRatePct = (wins + ties/3) / (wins + losses + ties)`, `@pokekon/shared`) — the official tournament scoring — instead of excluding ties entirely. A handful of other, deliberately unchanged personal-analytics views (`deckAnalytics.ts`'s `WinRateBlock`, `deckPerformanceStats.ts`, `useRecommendations.ts`) still use the older "decided games only" semantic; that inconsistency is out of scope here (Spec 4).

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
  bestOf?: BestOf;
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
- `bestOf`: Bo1 or Bo3 (see `BestOf` above). Required on new logs; `undefined` on logs written before this field existed ("format unknown" — shown as a badge, excluded from the Bo1-equivalent comparison but still counted in `winRate`).
- `deckSnapshotId`: Optional. When set, it links this match to the deck version that was played. This is what powers the "version comparison" recommendations.
- `battleLog`: The raw text copied from TCG Live's battle protocol (in German). Optional — only present when the user pastes it in.
- `analysis`: `JSON.stringify(BattleAnalysis)` — the result of the server-side LLM analyzing the battle log. Only present after the user triggers analysis.

**Wire-only addition, not part of this type (plan `personal-data-role-rework.md`
§0.6/§3.7):** `apps/web/src/lib/api.ts`'s `LogWriteBody` is `Omit<OpponentLog, 'id'>
& { playerName?: string }`. `playerName` is **never persisted** on `opponent_logs`
— it only pins "me" for the server-side battle-log parse
(`apps/api/src/lib/matchLogPipeline.ts`), closing a gap where the web client
accepted-but-never-sent the field the server already validated.

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

These types represent the structured output from the server-side LLM battle-log analysis. They are defined in `@pokekon/shared` (shared by the API's analysis route and the web client).

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

## Battle-Log Prefill Types (`@pokekon/shared`)

Introduced by the battle-log-first "Match loggen" flow (plan
`personal-data-role-rework.md` §3.1–§3.5, `packages/shared/src/battleLogPrefill.ts`).
Pure, client-side computation — none of this is persisted; it only pre-fills the
`AddLogModal` form fields from a pasted battle log.

### `ArchetypeSignature`
```typescript
interface ArchetypeSignature {
  slug: string;
  name: string;
  logNames: string[];
}
```
One archetype's recognition signature: card-name fragments as they appear in a
**German** PTCG-Live log. Supplied by the caller (`apps/web/src/constants/archetypes.ts`'s
`archetypeSignatures()`) so this module stays free of UI constants.

### `ArchetypeCandidate`
```typescript
interface ArchetypeCandidate {
  slug: string;
  name: string;
  matched: string[];
  coverage: number;
}
```
One archetype's match result against a set of opponent card names. `coverage` is
`matched.length / signature.logNames.length` (0–1, unrounded) — a **coverage
ratio**, not a fabricated percent confidence: the parser itself exposes no
confidence signal at all.

### `OpponentArchetypeGuess`
```typescript
interface OpponentArchetypeGuess {
  candidates: ArchetypeCandidate[]; // sorted by coverage desc, then name asc; max 3
  best: ArchetypeCandidate | null;  // non-null exactly when confidence === 'unique'
  confidence: 'unique' | 'ambiguous' | 'none';
}
```
`unique` = exactly one candidate reaches coverage 1 with no tie at the top → safe
to pre-select. `ambiguous` = at least one candidate, but not uniquely so → offer,
never pick. `none` = nothing matched at all.

### `BattleLogPrefill`
```typescript
interface BattleLogPrefill {
  parsed: ParsedBattleLog;
  playerPinned: boolean;
  detectedPlayers: [string, string];
  opponentCards: string[];
  archetype: OpponentArchetypeGuess;
  result: 'W' | 'L' | null; // never 'T' — German logs carry no draw marker
}
```
The full prefill result for one pasted log, assembled by
`prefillFromBattleLog(log, playerName, signatures)`. `playerPinned` is `true` only
when `playerName` exactly matched one of the two names the parser detected — when
`false`, the UI must ask "Welcher Spieler bist du?" before using `result` or
`archetype` (an unpinned split could mean the "opponent" card evidence is actually
the local player's own deck).

---

## Meta Data Types

### `MetaSnapshot`
```typescript
interface MetaSnapshot {
  id?: number;
  archetype: string;
  frequencyPct: number;
  winRatePct: number | null;
  wins: number;
  losses: number;
  ties: number;
  playerCount: number;
  period: string;
  sourceNote: string;
}
```
One archetype's stats for one week. The `period` field uses the ISO week format `YYYY-Www` (e.g., `"2026-W15"`). The `sourceNote` is auto-generated during sync and describes which tournaments and how many players were included. `winRatePct` is the tie-weighted tournament win rate (see `MatchResult` above) — `null` only when the archetype had zero games in the period, not merely zero decisive games.

### `WilsonInterval` (Spec 3 — `packages/shared/src/wilsonInterval.ts`)
```typescript
interface WilsonInterval {
  pct: number;        // tie-weighted point estimate in percent, unrounded
  lowPct: number;      // lower bound, clamped to [0, 100]
  highPct: number;     // upper bound, clamped to [0, 100]
  widthPct: number;    // highPct - lowPct
  n: number;            // wins + losses + ties
  significant: boolean; // true when the interval excludes 50 %
}
```
The 95 % Wilson score interval (score-test inversion — **not** the Wald/normal approximation, which collapses to zero width at `p̂ ∈ {0, 1}`) for a tie-weighted `wins/losses/ties` record. `null` when `n === 0`. **Ties are a deliberately conservative approximation:** the score used is `wins + ties/3` (the same tie-weighted value as `tournamentWinRate`), evaluated with the standard binomial Wilson formula, which slightly overstates the true trinomial variance — the interval comes out a few percent too wide, never too narrow. `zForConfidence` is table-backed (80/90/95/98/99 % — no numeric approximation) and throws for any other level. `combineIndependentIntervals` propagates a share-weighted sum of independent Wilson intervals via `Var(Σ wᵢXᵢ) = Σ wᵢ²Var(Xᵢ)`, reading each term's asymmetric standard error back from its own bounds; a term whose bounds equal its point estimate (e.g. the definitional 50 % mirror) contributes zero variance. `matchupCellInterval` resolves one `MatchupCell`'s interval by precedence: explicit `lowPct`/`highPct` on the cell, then raw `wins`/`losses`/`ties` (only if they sum to at least one game — an all-zero placeholder record falls through), then a reconstruction from `total`/`winRate`. This is the **only** place the Wilson formula is implemented in the repo; nothing else re-derives it.

**Independence caveat:** real matchup cells in one row share players/tournaments (mild correlation) and the `sharePct` weights are themselves estimates treated as exact here — both effects make the combined band tend to be **too narrow**, not too wide, partially offsetting the ties approximation above. Accepted for now (plan `confidence-aware-matchups.md` §6 risk 3); not a correctness bug, a documented approximation.

### `MatchupCell` / `WeightedMatchup` / `FieldScore` (Spec 3 — `packages/shared/src/fieldWinRate.ts`)
```typescript
interface MatchupCell {
  deck1: string; deck2: string; total: number; winRate: number;
  wins?: number; losses?: number; ties?: number;      // raw record (preferred)
  lowPct?: number; highPct?: number;                    // precomputed bounds (win over raw record)
}

interface WeightedMatchup {
  archetypeId: string; archetypeName: string; sharePct: number;
  winRatePct: number; games: number; weightPct: number;
  lowPct: number; highPct: number; significant: boolean;
}

interface FieldScore {
  archetypeId: string; archetypeName: string; sharePct: number;
  fieldWinRatePct: number | null;
  fieldWinRateLowPct: number | null; fieldWinRateHighPct: number | null;
  coveragePct: number; mirrorSharePct: number; rank: number;
  threats: WeightedMatchup[]; freeWins: WeightedMatchup[];
}
```
`computeFieldScores(shares, matchups, opts?)` computes the meta-weighted field win rate for every archetype. **Spec 3 change:** the previous hard `MIN_MATCHUP_GAMES` (10) sample-size cutoff is gone — a cell is skipped only when it is missing or has `total <= 0` (no data at all); a 1-game cell now counts fully, with its uncertainty expressed as `fieldWinRateLowPct`/`fieldWinRateHighPct` (full error propagation via `combineIndependentIntervals`, weight = opponent `sharePct`) instead of vanishing. The point estimate is still the raw `cell.winRate` — no shrinkage toward the Wilson centre (a deliberate choice: shrinking would decouple the displayed matrix number from the field-score input for the same cell; candidate for a later spec). `opts.minGamesPerPair` was **removed** (no in-repo caller used it); `opts.confidence` was added instead. `threats`/`freeWins` now sort by significance first, then by `weightPct` — a non-significant matchup no longer disappears, it just sorts behind significant ones at the same weight.

**`coveragePct` changed meaning:** it used to mean "share of the field covered by a cell with ≥10 games", it now means "share of the field with **any** matchup data at all". This number typically goes up under the new contract and no longer implies the score is reliable — that question moved into the band. `LOW_COVERAGE_PCT` (40, in `FieldScorePanel.tsx`) is unchanged and still shown alongside the band, not replaced by it — coverage and confidence are two separate questions.

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
  bo1EquivalentWinRate: number | null;
  bo1Games: number;
  bo3Games: number;
  unknownFormatGames: number;
}
```
Per-archetype summary combining personal match history and meta data. Computed by `getArchetypeStats()` in `queries.ts`. The `frequencyPct` and `metaWinRate` come from the latest `metaSnapshots`; everything else comes from `opponentLogs`. Sorted by `frequencyPct` descending, then by `encounters` descending.
- `winRate`: tie-weighted across **all** logs (`tournamentWinRatePct`), `0` when there are no logs at all.
- `bo1EquivalentWinRate`/`bo1Games`/`bo3Games`/`unknownFormatGames`: the Bo1-comparable personal win rate (`bo1EquivalentWinRate` from `@pokekon/shared`) — Bo3 logs converted back via `bo3ToBo1WinRate`, logs with unknown `bestOf` counted but excluded from the rate itself. `null` only when there are zero Bo1/Bo3-tagged logs (i.e. every log for this archetype has an unknown format, or there are no logs at all).

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

---

## Card Performance Delta Types (Spec 5 — `packages/shared/src/cardPerformance.ts`)

These types represent precomputed card performance analysis, bridging tournament placement data and card recommendations.

### `CardPerformanceDelta`
```typescript
interface CardPerformanceDelta {
  listsWith: number;
  listsWithout: number;
  superiorityPct: number;  // Mann-Whitney θ × 100, 1 decimal
  deltaPp: number;         // superiorityPct - 50, the headline delta in pp
  lowPct: number;          // Wilson band lower bound, 1 decimal
  highPct: number;         // Wilson band upper bound, 1 decimal
  widthPct: number;        // highPct - lowPct
  significant: boolean;    // true when band excludes 50
  effectiveN: number;      // 3*n1*n2/(n1+n2+1), 2 decimals
  meanPercentileWithPct: number;     // descriptive only, 1 decimal
  meanPercentileWithoutPct: number;  // descriptive only, 1 decimal
}
```

The performance delta for one card within one archetype. **Method (plan §3.0):** 
- Computes Mann-Whitney probability of superiority θ between two groups (lists with card vs. without)
- θ is itself a proportion in [0,1], so Wilson score intervals are legitimately applicable to it
- `effectiveN = 3·n1·n2/(n1+n2+1)` is the effective sample size that makes a Wilson interval on θ-hat reproduce the exact Mann-Whitney null variance
- The band always uses 95% confidence (Spec 3 precedent)
- `significant` is true when the **unrounded** bounds exclude 50% — not a cutoff, a binary expression of "does the band contain the null?"

**Three critical approximations (also in code comments and in `docs/features.md` §17):**
1. **Ties assumption:** The formula assumes no ties (identical percentiles). In practice, ties make the true variance smaller than predicted, so the band is **too wide, never too narrow** — conservative.
2. **Null-point calibration:** The n_eff bridge makes the interval exact at θ = 0.5 (the decision boundary). Away from the null, it becomes a conservative approximation with credible coverage but not exact matching.
3. **Correlation, not causation:** Lists are not randomly assigned to include/exclude cards. The delta measures **association** (lists with X ranked better), not causal effect (X makes lists better). No UI text ever claims causation.

### `CardSignalTier`
```typescript
type CardSignalTier =
  | 'insufficient'      // No prognosis: empty group or band too wide
  | 'confirmed'         // Popular AND significantly positive
  | 'hiddenGem'         // Rare AND significantly positive
  | 'popularityParadox' // Popular BUT negative or not significant
  | 'discouraged'       // Significantly negative
  | 'neutral';          // Measurable but no strong signal
```

Classification of a card's signal tier, determined by `classifyCardSignal(inclusionPct, delta, opts)` — the single place in the codebase that decides which case the UI is looking at. **Classification rules (order matters — first match wins):**

1. `delta === null` OR `delta.widthPct > maxBandPp` (default 40) → `'insufficient'`
2. `delta.significant && delta.deltaPp > 0 && inclusionPct >= 55` → `'confirmed'`
3. `delta.significant && delta.deltaPp > 0` → `'hiddenGem'`
4. `inclusionPct >= 55 && (delta.deltaPp <= 0 || !delta.significant)` → `'popularityParadox'` (the core of Spec 5's fifth AC: "popular but not helping")
5. `delta.significant && delta.deltaPp < 0` → `'discouraged'`
6. Else → `'neutral'`

Rule 1 has precedence over Rule 4 so a staple with only 3 usable lists doesn't falsely become "popularity paradox"; instead it honestly reports insufficient data.

### `ArchetypeCardStat`
```typescript
interface ArchetypeCardStat {
  cardName: string;
  cardType: 'pokemon' | 'trainer' | 'energy';
  listsAnalyzed: number;
  listsWith: number;
  inclusionPct: number;      // listsWith / listsAnalyzed × 100, 1 decimal
  avgCount: number;          // Mean copies among including lists, 1 decimal
  delta: CardPerformanceDelta | null;
  tier: CardSignalTier;
}
```

One card's complete stats within one archetype (for one time window). The `inclusionPct` is from the server's own tournament database (online-Bo1 scope only) — it is **purely informational** and does **not** drive the 55%/20% thresholds used in `suggestedAdds`/`suggestedRemoves` (those stay on the Limitless-based client fetch). This design separates two data sources explicitly so they never confuse.

### `ListPerformanceEntry`
```typescript
interface ListPerformanceEntry {
  counts: Record<string, number>;      // by normalizeCardName() key
  displayNames: Record<string, string>;
  cardTypes: Record<string, CardType>;
  percentile: number;  // in [0,1], from placementPercentile()
}
```

One published tournament list, reduced to what the analysis needs. The `counts` are summed across printings (two editions of the same card = one inclusion with summed count) — a deliberate correction to `deckComparison.ts`'s per-entry counting (plan §0.3 / §6 risk 5). The `displayNames` and `cardTypes` map each normalised key to its first-seen display form and type, deterministic and consistent.

### `ListPerformanceEntry` to `ArchetypeCardStat` (the computation)

`computeArchetypeCardStats(lists, opts?)` is the pure, I/O-free aggregation function that produces a list of `ArchetypeCardStat` from a list of tournament lists:
1. **Deduplicate and normalise:** across all lists, collect every distinct card by `normalizeCardName()` key, tracking display names and types.
2. **Split and compute delta:** for each card, partition the lists into `with` (list includes the card) and `without`, compute `placementPercentile()` for each, then `cardPerformanceDelta()`.
3. **Classify tier:** apply `classifyCardSignal()` to the delta and `inclusionPct`.
4. **Sort and return:** by `inclusionPct` descending, then `cardName` asc (stable and testable).

Result is `[]` if the input is empty or all lists have invalid percentiles. A list with all cards means `delta === null` (same group for with/without), and the tier becomes `'insufficient'` — this is honest: you can't claim a card helps or hurts if it appears in every list.
