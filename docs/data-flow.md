# Data Flow

This document traces how data moves through the application for each major operation.

---

## App Startup

```mermaid
sequenceDiagram
    participant Browser
    participant App as App.tsx
    participant Store as dashboardStore
    participant Seed as seed.ts
    participant DB as Dexie / IndexedDB

    Browser->>App: Mount
    App->>Seed: seedIfEmpty()
    Seed->>DB: Check if deckCards is empty
    alt DB is empty
        Seed->>DB: Insert demo deck + 60 cards
    end
    App->>Store: refresh()
    Store->>DB: getDecks()
    alt No decks exist
        Store->>DB: createDeck("My Deck")
        Store->>DB: Stamp deckId on orphaned records
    end
    Store->>DB: getDeckCards(activeDeckId)
    Store->>DB: getDeckSnapshots(activeDeckId)
    Store->>DB: getOpponentLogs()
    Store->>DB: getLatestMetaSnapshots()
    Store->>DB: getArchetypeStats()
    Store-->>App: isLoading = false, data arrays populated
    App-->>Browser: Render active page
```

The `refresh()` call is the single synchronization point between IndexedDB and Zustand. All pages read from the store — never directly from Dexie.

---

## User Logs a Match

```mermaid
sequenceDiagram
    participant User
    participant AddLogModal
    participant Store as dashboardStore
    participant DB as Dexie / IndexedDB
    participant Hook as useRecommendations

    User->>AddLogModal: (optional, now FIRST) Paste battle log text
    AddLogModal->>AddLogModal: prefillFromBattleLog(log, playerName, signatures) [@pokekon/shared, client-only]
    AddLogModal-->>User: pre-fills opponent/result when unique, offers chips when ambiguous, asks "who are you" when unpinned
    User->>AddLogModal: Fill in / confirm archetype, event, result
    User->>AddLogModal: Submit
    AddLogModal->>DB: addOpponentLog(logData)
    AddLogModal->>Store: refresh()
    Store->>DB: getOpponentLogs()
    Store->>DB: getArchetypeStats()
    Store-->>AddLogModal: opponentLogs updated
    AddLogModal-->>User: Modal closes, table refreshes
    Hook->>Store: archetypeStats (recompute)
    Hook-->>DeckTipsSection: Updated recommendations
```

After the log is written to IndexedDB, `refresh()` reloads both the raw logs and the derived `archetypeStats`. The `useRecommendations` hook in `DeckTipsSection` reacts automatically because it depends on `archetypeStats` from the store.

**Where the pre-fill happens (plan `personal-data-role-rework.md` §3.5/§3.6):**
entirely on the client, entirely before submit — `prefillFromBattleLog` lives in
`@pokekon/shared` (no server round-trip; `parseBattleLog` was already called
client-side elsewhere, e.g. `MatchDetailModal`) and is pure: it reads the pasted
text and the `tcg-player-name` value, and returns a `BattleLogPrefill` or `null`.
**Nothing new is persisted** — the archetype/result pre-fill only sets the same
form fields a manual entry would set; the only wire change is the now-actually-sent
`playerName` (see the pipeline section below).

---

## Deck Synthesis (Spec 8 — Structured LLM Analysis)

```mermaid
sequenceDiagram
    participant User
    participant UI as DeckTipsSection
    participant Store as dashboardStore
    participant API as POST /api/analysis/deck/:deckId
    participant AI as ai/synthesize
    participant DB as PostgreSQL
    participant Validate as validateSynthesis

    User->>UI: Click "Synthesize" button
    UI->>Store: runDeckSynthesis(deckId, language)
    Store->>Store: buildSynthesisFactSet(fieldScore, cardStats, equilibrium)
    Store->>Store: computeInputHash(facts, language, promptVersion)
    Store->>DB: Check deck_synthesis cache by (deckId, windowDays, language)
    
    alt Cache hit
        DB-->>Store: Return cached DeckSynthesis
        Store-->>UI: Render cached text + "snapshot from X"
    else Cache miss
        Store->>API: POST {deckId, language, facts}
        API->>AI: synthesize(facts, context)
        AI->>AI: buildSynthesisPrompts(facts, context)
        AI->>AI: LLM call (temperature: 0, JSON mode)
        AI->>AI: Parse response → SynthesisClaim[]
        AI->>Validate: validateSynthesis(claims, facts)
        Validate-->>AI: accepted[], rejected[]
        AI->>AI: assembleSynthesis(validated, facts, ...) → DeckSynthesis
        AI-->>API: DeckSynthesis (rendered, persisted)
        API->>DB: Upsert into deck_synthesis (cache key = inputHash)
        DB-->>API: Row inserted/updated
        API-->>Store: Return DeckSynthesis
        Store-->>UI: Render sections + claims + dropped count
    end
    UI-->>User: Display synthesized text with sources
```

**Key differences from battle-log analysis:**
1. **No raw input:** The LLM receives a closed, structured facts list (Field-Score, matchups, card deltas, equilibrium) — not a raw battle log.
2. **Direction from band:** Each fact's direction (positive/negative/neutral) is derived from its confidence interval, not guessed by the model.
3. **No numbers from model:** Claims use placeholders (`{value}`, `{label}`) filled server-side after validation.
4. **Cache by input hash:** Text is reused until the underlying facts change; input hash is computed from the canonical facts list + language + prompt version.
5. **Snapshot semantics:** Old text persists as "snapshot from {timestamp}" with a "Re-synthesize" button, but the UI always renders the **current** numbers, never stale data.

---

## Server-side Battle-Log Pipeline (match_log_parsed)

---

## Meta Sync (Limitless API)

> **Legacy browser path.** This sync currently runs in the browser (with the `corsproxy.io` fallback shown below). It is slated to move to a server-side cron job — no CORS proxy needed — writing the shared server-side `meta_snapshots` table (see [architecture.md](./architecture.md) → *External API Integration* and [backend-evolution-plan.md](./backend-evolution-plan.md) §6.2).

```mermaid
sequenceDiagram
    participant User
    participant UI as Sidebar / Meta page
    participant Store as dashboardStore
    participant MetaFetch as metaFetch.ts
    participant Limitless as play.limitlesstcg.com
    participant CORSProxy as corsproxy.io
    participant DB as Dexie / IndexedDB

    User->>UI: Click "Sync Live Meta" (sidebar on desktop, Meta header on mobile)
    UI->>Store: syncMeta()
    Store->>MetaFetch: syncLiveMeta(onProgress)
    MetaFetch->>Limitless: GET /api/tournaments?game=PTCG&completed=true&limit=50&format=standard
    alt Direct fetch succeeds
        Limitless-->>MetaFetch: Tournament list JSON
    else CORS or HTTP error
        MetaFetch->>CORSProxy: GET (proxied URL)
        CORSProxy-->>MetaFetch: Tournament list JSON
    end
    MetaFetch->>MetaFetch: Filter top 6 by player count (≥30 players)
    loop For each eligible tournament
        MetaFetch->>Limitless: GET /api/tournaments/{id}/standings
        Limitless-->>MetaFetch: Standings JSON
        MetaFetch->>MetaFetch: Aggregate win/loss by archetype
    end
    MetaFetch->>MetaFetch: Compute frequencyPct, winRatePct per archetype
    MetaFetch->>DB: clearMetaSnapshots()
    MetaFetch->>DB: upsertMetaSnapshot() for each archetype
    MetaFetch-->>Store: MetaSyncResult {archetypes, tournaments, totalPlayers, period}
    Store->>Store: refresh()
    Store-->>UI: isSyncing = false, lastSynced = now
    UI-->>User: Show result toast
```

The sync always clears all existing meta snapshots before writing new ones. The period label is the current ISO week (e.g., `"2026-W15"`), so re-syncing in the same week replaces the same-period rows via the compound index upsert.

> **Note on the diagram above:** it predates the server-side sync
> (`apps/api/src/jobs/syncMeta.ts`, [features.md](./features.md) §2) and is kept
> here as a historical record of the browser-side predecessor; it does not
> reflect the current data path. Two additions the current server-side sync
> makes that are worth documenting even without redrawing the whole diagram:
> - **Ties propagate through the sync path:** `tournament_standings.ties` →
>   `recomputeCurrentPeriodSnapshots` sums them per archetype →
>   `meta_snapshots.ties` and its tie-weighted `win_rate_pct`
>   (`tournamentWinRatePct`, `@pokekon/shared`).
> - **Matchup blend + conflict flag:** `GET /api/meta/matchups` builds each
>   directed pair from `tournament_matchups` (own data) with the TrainerHill
>   CSV as a fallback for pairs without enough own games; the two sources are
>   also compared via `detectMatchupConflicts` (own vs. fallback, > 15pp with
>   own data overriding the fallback → flagged), exposed as
>   `matchupSource.conflictCount`/`conflicts` and logged server-side. The
>   displayed win rate is always the own value — a conflict never changes it.
> - **Confidence bands, computed at read time, nothing persisted (Spec 3,
>   `confidence-aware-matchups.md`):** every raw record needed for a Wilson
>   interval (`wins`/`losses`/`ties`/`total`) already lives in
>   `matchup_matrix`, `tournament_matchups` and `tournament_standings` — no
>   migration, no new column, no backfill job. `apps/api/src/routes/meta.ts`
>   passes those raw counts straight into the `MatchupCell`s it feeds
>   `computeFieldScores` (`@pokekon/shared`), which computes the band
>   (`fieldWinRateLowPct`/`HighPct`, `threats[]`/`freeWins[].lowPct/highPct/
>   significant`) fresh on every `/field-analysis` and `/archetypes/:id/analysis`
>   request. The web client repeats the same computation client-side in
>   `PredictionPanel.tsx` (it calls `computeFieldScores` directly over the
>   fetched `MatchupRow[]`) — the same pure function, not a second
>   implementation. Nothing about this is cached or written back to the
>   database; a re-request with the same inputs always recomputes the same
>   band.

---

## Deck Import (Text Paste)

```mermaid
sequenceDiagram
    participant User
    participant ImportDeckModal
    participant DeckImport as deckImport.ts
    participant DB as Dexie / IndexedDB
    participant Store as dashboardStore

    User->>ImportDeckModal: Paste decklist text
    ImportDeckModal->>DeckImport: parseDeckList(text)
    DeckImport->>DeckImport: Split into sections by "Pokemon:", "Trainer:", "Energy:"
    DeckImport->>DeckImport: Parse each line: count + name + set + number
    DeckImport->>DeckImport: Infer role (inferTrainerRole / inferPokemonRole)
    DeckImport-->>ImportDeckModal: ParsedCard[] + skippedLines[]
    User->>ImportDeckModal: Confirm import (replace or append)
    ImportDeckModal->>DeckImport: importCards(cards, replaceExisting, deckId)
    alt replaceExisting = true
        DeckImport->>DB: clearDeck(deckId)
    end
    loop For each card
        DeckImport->>DB: upsertDeckCard(card, deckId)
    end
    ImportDeckModal->>Store: refresh()
    Store-->>ImportDeckModal: deckCards updated
```

The text format expected is the standard PTCG export format:
```
Pokémon: 12
4 Pikachu ex MEW 71
...
Trainer: 32
4 Professor's Research SVI 189
...
Energie: 16
8 Basic Lightning Energy SVE 4
```

Section headers are detected case-insensitively and support both English ("Energy") and German ("Energie") spellings.

---

## Deck Comparison (Tournament Lists)

```mermaid
sequenceDiagram
    participant User
    participant DeckComparisonPanel
    participant Store as dashboardStore
    participant DeckComp as deckComparison.ts
    participant Limitless as play.limitlesstcg.com

    User->>DeckComparisonPanel: Click "Compare vs. Tournament"
    DeckComparisonPanel->>Store: runDeckComparison()
    Store->>DeckComp: fetchArchetypeComparison(slug, deckCards, onProgress)
    DeckComp->>Limitless: GET /api/tournaments (top 8 by player count)
    loop For each tournament
        DeckComp->>Limitless: GET /api/tournaments/{id}/standings
        DeckComp->>DeckComp: Filter players matching slug
        DeckComp->>DeckComp: Collect decklists
    end
    DeckComp->>DeckComp: Aggregate card frequency + avg count
    DeckComp->>DeckComp: Compare against user's deckCards
    DeckComp-->>Store: ComparisonResult {suggestedAdds, suggestedRemoves, countAdjustments}
    Store-->>DeckComparisonPanel: comparisonResult populated
    DeckComparisonPanel-->>User: Show comparison table
```

The slug matching uses bidirectional substring matching: `"n-zoroark"` matches any tournament deck ID that contains `"n-zoroark"` or that `"n-zoroark"` contains. Cards appearing in fewer than 45% of tournament lists are not in `suggestedAdds` (threshold is 55%); cards the user runs that appear in fewer than 20% of lists go into `suggestedRemoves`.

---

## Battle Log Analysis (LLM, server-side · BYOK)

The LLM analysis runs **server-side** behind a provider abstraction (plan §6.3 Phase A).
The user's API key is stored encrypted in PostgreSQL and only decrypted on the
server for the call — it never reaches the browser. The default (and currently
only) provider is **GitHub Models**. Anti-hallucination is enforced by the shared
engine: every `evidence` field must be a verbatim log quote, suggestions only for
cards shown in hand, `temperature=0`, and ungrounded items are dropped.

```mermaid
sequenceDiagram
    participant User
    participant MatchDetailModal
    participant API as POST /api/analysis/log
    participant DB as PostgreSQL
    participant Engine as @pokekon/shared (analysis engine)
    participant LLM as GitHub Models

    User->>MatchDetailModal: Open match, enter GitHub Models token (once)
    MatchDetailModal->>API: PUT /api/analysis/settings { apiKey } (encrypted at rest)
    User->>MatchDetailModal: Click "Analyze"
    MatchDetailModal->>API: analyzeBattleLogViaApi(battleLog, playerName)
    API->>DB: load user_ai_settings (provider, model, encrypted key)
    API->>API: decryptSecret(encrypted key)  [lib/crypto.ts, AES-256-GCM]
    API->>Engine: buildAnalysisPrompts(log, playerName) + extractRevealedCards
    API->>LLM: POST chat/completions { temperature: 0, response_format: json_object }
    LLM-->>API: JSON analysis
    API->>Engine: validateAnalysis() — drop items whose evidence isn't in the log
    API-->>MatchDetailModal: BattleAnalysis (grounded)
    MatchDetailModal->>DB: updateOpponentLog(id, { analysis }) (IndexedDB)
    MatchDetailModal-->>User: key moments, mistakes, card notes, suggestions
```

The battle log protocol is in **German** (exported from Pokémon TCG Live). Turn
boundaries are marked by `"Zug von "` lines; player detection uses frequency
analysis on `"Name hat ..."` lines, filtering German stop-words. Activation requires
the `ENCRYPTION_KEY` server variable and a per-user GitHub Models token (see
[getting-started.md](./getting-started.md)).

---

## Recommendation Generation

```mermaid
sequenceDiagram
    participant Store as dashboardStore
    participant PerfStats as deckPerformanceStats.ts
    participant Hook as useRecommendations
    participant RecsSection as DeckTipsSection

    RecsSection->>PerfStats: computeDeckPerformanceStats(opponentLogs)
    PerfStats->>PerfStats: Filter logs with battleLog text
    PerfStats->>BattleParser: parseBattleLog() for each
    PerfStats-->>RecsSection: DeckPerformanceStats | null

    RecsSection->>Hook: useRecommendations({archetypeStats, deckCards, opponentLogs, deckSnapshots, localMeta, deckStats})
    Note over Hook: Runs entirely in useMemo — no async, no DB calls

    Hook->>Hook: 1. Deck version comparison (snapshot WR deltas)
    Hook->>Hook: 2. Tech card suggestions for bad matchups
    Hook->>Hook: 3. Zero-win high-frequency archetypes
    Hook->>Hook: 3b. Local meta blind spots
    Hook->>Hook: 4. Boss's Orders ratio check
    Hook->>Hook: 5. Pokemon search ball check
    Hook->>Hook: 6. Overall WR degradation across snapshots
    Hook->>Hook: 7. Meta blind spots (>10% frequency, 0 encounters)
    Hook->>Hook: 8. Data sparsity warning
    Hook->>Hook: 9-14. Battle log performance signals (if deckStats present)
    Hook-->>RecsSection: DeckRecommendation[] sorted by priority then dataPoints
```

The hook is a pure `useMemo` computation — no side effects, no DB calls. It recomputes whenever any of its inputs change. The 14 recommendation rules run in sequence, each appending to a shared `recs` array. Final sort: `high → medium → low`, then within each priority by `dataPoints` descending.

---

## Snapshot Save and Version Tracking

```mermaid
sequenceDiagram
    participant User
    participant VersionsWidget
    participant Store as dashboardStore
    participant DB as Dexie / IndexedDB

    User->>VersionsWidget: Type label, click "Snapshot"
    VersionsWidget->>Store: saveCurrentDeckSnapshot(label)
    Store->>DB: saveDeckSnapshot(label, deckCards, activeDeckId)
    DB->>DB: INSERT deckSnapshots {label, cards: JSON, totalCards, createdAt, deckId}
    Store->>DB: getDeckSnapshots(activeDeckId)
    Store-->>VersionsWidget: deckSnapshots array updated

    Note over User,DB: When logging next match...
    User->>AddLogModal: Log match, select snapshot from dropdown
    AddLogModal->>DB: addOpponentLog({..., deckSnapshotId: selectedId})
```

Once a match log is linked to a snapshot, the recommendation engine can compare win rates across deck versions for the same opponent archetype.

---

## Server-side Battle-Log Pipeline (parse on write)

The flows above are the browser's local-first paths. The backend (`apps/api`)
adds a **parse-on-write** pipeline (plan §4): the expensive battle-log parse
runs once when a log is saved, and the structured result is persisted so later
analytics reads never re-parse.

```mermaid
sequenceDiagram
    participant Client
    participant Logs as POST/PATCH /api/logs
    participant Parser as @pokekon/shared parseBattleLog
    participant DB as PostgreSQL

    Client->>Logs: save log { ..., battleLog, playerName }
    Logs->>DB: INSERT/UPDATE opponent_logs
    alt battleLog present
        Logs->>Parser: parseBattleLog(battleLog, playerName)
        Parser-->>Logs: turns + board state + turn-quality signals
        Logs->>DB: UPSERT match_log_parsed (unique opponent_log_id)
    else battleLog cleared
        Logs->>DB: DELETE match_log_parsed for the log
    end
    Logs-->>Client: 201/200 (parse is best-effort, never blocks the write)
```

`playerName` pins which side is "me"; absent, the parser falls back to its
heuristic player detection. The parse step is wrapped so a parser failure logs a
warning but never fails the log write. Parsed rows cascade-delete with their
`opponent_logs` row.

**Fixed gap (plan `personal-data-role-rework.md` §0.6/§3.7):** the server has
accepted `playerName` on this route from the start, but `AddLogModal` never
actually sent it — `matchLogPipeline.ts` always parsed with `''`, so
`match_log_parsed.turns` could silently be attributed to the wrong side. The web
client now sends `playerName` whenever it is known (the same value stored under
`localStorage['tcg-player-name']`), omitting the field entirely otherwise. Not
re-parsed retroactively — see [database.md](./database.md).

## Card Performance Delta Precomputation (Spec 5)

```mermaid
sequenceDiagram
    participant Admin/Cron
    participant Job as computeCardStats job
    participant DB as PostgreSQL
    participant Engine as @pokekon/shared

    Note over Admin/Cron: Runs on schedule (separate cron after syncMeta)

    Admin/Cron->>Job: npm run job:compute-card-stats [--dry-run]
    Job->>DB: SELECT tournaments, tournament_standings WHERE online=true, swiss_mode='BO1', window_days in (7,14,21,28)
    DB-->>Job: standings + tournaments.players

    loop For each (archetype, window) pair
        Job->>Job: Compute placementPercentile(placing, players)
        Job->>Engine: computeArchetypeCardStats(lists)
        Engine->>Engine: For each card: split into with/without groups
        Engine->>Engine: mannWhitneyTheta() + rankEffectiveSampleSize()
        Engine->>Engine: wilsonInterval() on effective sample size
        Engine->>Engine: classifyCardSignal() → tier
        Engine-->>Job: ArchetypeCardStat[]
    end

    alt dryRun = false
        Job->>DB: For each (archetype, window):
        DB->>DB: BEGIN TRANSACTION
        DB->>DB: DELETE archetype_card_stats WHERE archetype_id = ?, window_days = ?
        DB->>DB: INSERT ArchetypeCardStat[] (chunked, size 200)
        DB->>DB: COMMIT
    end

    Job-->>Admin/Cron: CardStatsJobResult {computedAt, windows, archetypesProcessed, archetypesSkipped, rowsWritten, listsWithoutData, dryRun}
```

The job runs separately from `syncMeta` (no direct coupling). Both rows in a single
(archetype, window) are written atomically, guaranteeing readers never see a
partially-computed state. `computedAt` marks the point in time the run occurred;
the UI surfaces this alongside each card's delta so users understand freshness.

Archetype-window pairs with fewer than 8 usable lists are skipped entirely
(no rows written, reported in `archetypesSkipped`). Listings without `decklist`
or `placing` are dropped and tallied in `listsWithoutData`.

---

## Deck Comparison with Performance Deltas (Spec 5)

The existing deck-comparison fetch (Limitless-based) is now extended with server-side
precomputed deltas:

```mermaid
sequenceDiagram
    participant User
    participant DeckComparisonPanel
    participant Store as dashboardStore
    participant DeckComp as deckComparison.ts
    participant API as GET /api/meta/archetypes/:id/card-stats
    participant Limitless as play.limitlesstcg.com
    participant Engine as @pokekon/shared

    User->>DeckComparisonPanel: Click "Compare vs. Tournament"
    DeckComparisonPanel->>Store: runDeckComparison()

    par
        Store->>DeckComp: fetchArchetypeComparison(slug, deckCards)
        DeckComp->>Limitless: GET /api/tournaments, /standings
        Limitless-->>DeckComp: Decklists + card frequency
        DeckComp-->>Store: ComparisonResult {suggestedAdds, suggestedRemoves, countAdjustments}
    and
        Store->>API: fetchArchetypeCardStats(slug, days?)
        API->>API: snapCardStatsWindow(days) → nearest precomputed window
        DB-->>API: archetype_card_stats rows
        API-->>Store: ArchetypeCardStatsResponse {cards[], computedAt, windowDays, listsAnalyzed}
    end

    Store->>DeckComp: attachCardDeltas(comparisonResult, cardStats)
    DeckComp->>Engine: For each card: find matching server stats by normalizeCardName()
    Engine->>Engine: Copy delta/tier onto the card object (in-place)
    DeckComp-->>Store: ComparisonResult {suggestedAdds [with delta/tier], ...}
    Store-->>DeckComparisonPanel: comparisonResult + cardStatsSource
    DeckComparisonPanel-->>User: Show both signals: frequency bar + delta bar, separate source labels
```

The two fetches run in parallel; if the delta-fetch fails (old server, cold start, network error),
the comparison still succeeds with `delta` and `tier` undefined on each card. The
`cardStatsSource` field documents provenance (window, `computedAt`, `listsAnalyzed`)
separately from the frequency data so both sources are always visible and distinct.

---

## Recommendation Rule 2 with Card Deltas (Spec 5)

Rule 2 (weak matchup) is enriched when card performance deltas are available:

```mermaid
sequenceDiagram
    participant Store as dashboardStore
    participant Hook as useRecommendations
    participant RecSection as DeckTipsSection

    RecSection->>Store: Read archetypeStats, deckCards, cardStats
    RecSection->>Hook: useRecommendations({..., cardDeltas: cardStats})

    Hook->>Hook: Rule 2: Weak matchup check (≥5 encounters, ≤50% WR)
    Note over Hook: If cardDeltas provided and not empty:
    Hook->>Hook: Filter cardDeltas to tier='hiddenGem' or 'confirmed'
    Hook->>Hook: Exclude cards already in deckCards (by normalizeCardName)
    Hook->>Hook: Sort by deltaPp desc, then inclusionPct desc
    Hook->>Hook: Take top 2 cards
    Hook->>Hook: Append text: "In your archetype, [Card1] (+Xpp, 95% Y–Z) and [Card2] (+Aap, 95% B–C) correlate with better placements; you play neither."
    Note over Hook: Archetype-wide correlation claim, never matchup-specific

    Hook-->>RecSection: DeckRecommendation (same priority/id/category as before, enriched reasoning)
```

The enrichment is purely textual — it does not change priority, category, or data points.
The statement is always correlational ("correlate with"), never causal ("help against" the opponent archetype).
If no qualifying cards exist, the rule produces the original reasoning (frequency-based pointer to List Comparison).

---

## Deck Analytics Read Path

```mermaid
sequenceDiagram
    participant Client
    participant API as GET /api/analytics/deck/:id?weeks=
    participant DB as PostgreSQL

    Client->>API: getDeckAnalytics(deckId, weeks)
    API->>API: verify deck ownership, validate weeks (1–4)
    API->>DB: opponent_logs ⨝ match_log_parsed WHERE deck, user, event_date ≥ today − weeks·7d
    DB-->>API: rows (result + parsed turn-quality fields)
    API->>API: computeDeckAnalytics (pure)
    API-->>Client: DeckAnalytics (record, going-first/second WR, setup %, dead-turn rate, prize curve)
```

The window filter is served by the new plain `event_date` index. The aggregation
covers plan §3.7.1: going-first/second win rate, clean-setup-by-turn-2 share,
dead-turn rate, and the average remaining-prize curve of won games. The response
shape is the shared `DeckAnalytics` contract in `@pokekon/shared`.

---

## Meta Equilibrium Computation (Weekly Job)

```mermaid
sequenceDiagram
    participant Cron as Railway Cron (Monday)
    participant Job as computeEquilibrium
    participant DB as PostgreSQL
    participant SharedLib as @pokekon/shared

    Cron->>Job: invoke (daily or weekly, post-syncMeta)
    Job->>DB: For each window (7/14/21/28 days):
    Note over Job: Load tournament_standings + tournaments (online, bo1 scope)
    DB-->>Job: Match data (wins, losses, ties per pair)
    
    Job->>SharedLib: buildPayoffMatrix(archetypes, cells)
    Note over SharedLib: Symmetrize p_ij + p_ji = 1 exactly
    SharedLib-->>Job: PayoffMatrix
    
    Job->>SharedLib: solveSymmetricZeroSumNash(matrix)
    Note over SharedLib: Phase-II simplex, Bland's rule
    SharedLib-->>Job: NashEquilibrium (weights, payoffs, support, excludedCertain)
    
    Job->>SharedLib: equilibriumRobustness(matrix, pointEstimate, resamples=2000, seed)
    Note over SharedLib: Monte-Carlo: resample 2000x from Jeffreys-Beta, re-solve, collect stats
    SharedLib-->>Job: RobustnessResult (exclusion rates, mean weights, confidence bands)
    
    Job->>SharedLib: fitnessTrend(matrix, currentShares, priorWeekShares)
    Note over SharedLib: Compare fitness against two completed ISO weeks
    SharedLib-->>Job: FitnessTrend[] (direction, delta, observed share change)
    
    Note over Job: Write in one transaction per window:
    Job->>DB: DELETE FROM meta_equilibrium_runs WHERE window_days = ?
    Note over DB: Cascade deletes meta_equilibrium_archetypes
    DB-->>Job: Done
    Job->>DB: INSERT meta_equilibrium_runs (valuePct, support_size, robustness counts, ...)
    DB-->>Job: run_id
    Job->>DB: INSERT meta_equilibrium_archetypes (chunked, 200 per batch)
    Note over DB: All rows share same computed_at timestamp
    DB-->>Job: Done
    
    Job-->>Cron: Result {windows, archetypesProcessed, rowsWritten, durationMs per window}
```

**Dry-run mode:** Executes all steps above, prints counters and durations, writes nothing to DB — safe to test against production data.

**Data sources:** The job reads `tournament_standings` joined with `tournaments` (filtering `is_online=true, swiss_mode='BO1'`), aggregates by unordered archetype pair, and invokes the pure computation functions from `@pokekon/shared`.

---

## Meta Equilibrium Read Path

```mermaid
sequenceDiagram
    participant Browser
    participant Web as MetaPage.tsx
    participant API as GET /api/meta/equilibrium?days=
    participant DB as PostgreSQL
    participant EquilPanel as EquilibriumPanel.tsx

    Browser->>Web: Navigate to Meta page
    Web->>API: getMetaEquilibrium(days)
    API->>API: snapEquilibriumWindow(days)
    Note over API: Snap 1→7, 11→14, 25→28, etc.
    API->>DB: SELECT * FROM meta_equilibrium_runs WHERE window_days = ?
    alt Run exists
        DB-->>API: One row with valuePct, support_size, robustness counts
        API->>DB: SELECT * FROM meta_equilibrium_archetypes WHERE run_id = ? ORDER BY weight_pct DESC, share_pct DESC
        DB-->>API: Archetype rows
        API-->>Web: MetaEquilibriumResponse {computedAt, run, archetypes[]}
    else Cold start (no run yet)
        DB-->>API: No rows
        API-->>Web: MetaEquilibriumResponse {computedAt: null, run: null, archetypes: []}
    end
    
    Web->>EquilPanel: Pass response
    EquilPanel->>EquilPanel: exclusionBand(exclusionRatePct)
    Note over EquilPanel: Band tier: veryRobust (≥90%), robust (≥70%), unclear (≥30%), likelyIn (<30%)
    EquilPanel->>EquilPanel: isCompositionFragile(exactSupportRatePct, equalizerCount, supportSize)
    Note over EquilPanel: true if exactSupportRatePct < 50% OR equalizerCount > supportSize
    
    EquilPanel-->>Browser: Render three blocks:
    Note over EquilPanel: Block 1: Robust exclusions (plain-language + %) for each archetype
    Note over EquilPanel: Block 2: Exact composition (with/without fragility warning + confidence bands)
    Note over EquilPanel: Block 3: Week-over-week trend (arrow + label + delta + observed share change)
```

**Placement:** The section is a collapsed `CollapsibleSection` (no `defaultOpen`) on the Meta page, appearing after Field Score and Matchup Matrix. An "experimental" badge signals this is additional analysis, not a replacement.

**Cold start:** `computedAt === null` displays a neutral message ("Not yet computed") — no error, no spinner, just honest acknowledgement that the weekly job hasn't run yet.
