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

    User->>AddLogModal: Fill in archetype, event, result
    User->>AddLogModal: (optional) Paste battle log text
    User->>AddLogModal: Submit
    AddLogModal->>DB: addOpponentLog(logData)
    AddLogModal->>Store: refresh()
    Store->>DB: getOpponentLogs()
    Store->>DB: getArchetypeStats()
    Store-->>AddLogModal: opponentLogs updated
    AddLogModal-->>User: Modal closes, table refreshes
    Hook->>Store: archetypeStats (recompute)
    Hook-->>RecommendationsPage: Updated recommendations
```

After the log is written to IndexedDB, `refresh()` reloads both the raw logs and the derived `archetypeStats`. The `useRecommendations` hook in `RecommendationsPage` reacts automatically because it depends on `archetypeStats` from the store.

---

## Meta Sync (Limitless API)

```mermaid
sequenceDiagram
    participant User
    participant Sidebar
    participant Store as dashboardStore
    participant MetaFetch as metaFetch.ts
    participant Limitless as play.limitlesstcg.com
    participant CORSProxy as corsproxy.io
    participant DB as Dexie / IndexedDB

    User->>Sidebar: Click "Sync Live Meta"
    Sidebar->>Store: syncMeta()
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
    Store-->>Sidebar: isSyncing = false, lastSynced = now
    Sidebar-->>User: Show result toast
```

The sync always clears all existing meta snapshots before writing new ones. The period label is the current ISO week (e.g., `"2026-W15"`), so re-syncing in the same week replaces the same-period rows via the compound index upsert.

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

## Battle Log Analysis (Claude AI)

```mermaid
sequenceDiagram
    participant User
    participant MatchDetailModal
    participant BattleAI as battleLogAnalysis.ts
    participant BattleParser as battleLogParser.ts
    participant Claude as Anthropic API

    User->>MatchDetailModal: Open match with battle log
    User->>MatchDetailModal: Click "Analyze with AI" + enter API key
    MatchDetailModal->>BattleParser: parseBattleLog(rawText, playerName)
    BattleParser->>BattleParser: detectPlayers() — frequency analysis on German action lines
    BattleParser->>BattleParser: Split into turn blocks at "Zug von " markers
    BattleParser->>BattleParser: Parse each turn: cards played, damage, KOs, prizes
    BattleParser-->>MatchDetailModal: ParsedBattleLog
    MatchDetailModal->>BattleAI: analyzeBattleLog(rawText, playerName, apiKey)
    BattleAI->>BattleAI: extractRevealedCards() — find bullet-point card listings
    BattleAI->>Claude: POST /v1/messages {model: claude-opus-4-6, temperature: 0}
    Claude-->>BattleAI: JSON response
    BattleAI->>BattleAI: Validate evidence fields — drop items not found in raw log
    BattleAI-->>MatchDetailModal: BattleAnalysis
    MatchDetailModal->>DB: updateOpponentLog(id, {analysis: JSON.stringify(result)})
    MatchDetailModal-->>User: Show key moments, mistakes, card notes, suggestions
```

The battle log protocol is in **German** (exported from Pokemon TCG Live). Turn boundaries are marked by `"Zug von "` lines. Player detection uses frequency analysis on action lines matching `"Name hat ..."` patterns, filtering out German stop-words.

---

## Recommendation Generation

```mermaid
sequenceDiagram
    participant Store as dashboardStore
    participant PerfStats as deckPerformanceStats.ts
    participant Hook as useRecommendations
    participant RecsPage as RecommendationsPage

    RecsPage->>PerfStats: computeDeckPerformanceStats(opponentLogs)
    PerfStats->>PerfStats: Filter logs with battleLog text
    PerfStats->>BattleParser: parseBattleLog() for each
    PerfStats-->>RecsPage: DeckPerformanceStats | null

    RecsPage->>Hook: useRecommendations({archetypeStats, deckCards, opponentLogs, deckSnapshots, localMeta, deckStats})
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
    Hook-->>RecsPage: DeckRecommendation[] sorted by priority then dataPoints
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
