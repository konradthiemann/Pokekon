# Features

## Overview

| Feature | Page | Triggered by |
|---------|------|-------------|
| Meta overview with charts | Overview | Auto on load |
| Live meta sync | Sidebar / Meta | User clicks "Sync" |
| Deck management (add, import, edit, delete) | Deck | User actions |
| Deck versioning (snapshots) | Deck | User clicks "Snapshot" |
| Deck variant management | Deck | User creates/duplicates |
| Match log (add, view, delete) | Deck / Opponents | User actions |
| Battle log parsing (visual stats) | Deck → Match detail | Automatic on log open |
| Battle log analysis (server-side LLM, BYOK) | Deck → Match detail | User triggers + API key |
| Deck comparison vs. tournament lists | Recommendations | User triggers |
| Data-driven recommendations | Recommendations | Auto on data change |
| Local meta priority | Deck / Recommendations | User configures |
| Recent tournaments view | Meta | User triggers |
| Matchup matrix | Meta | Auto from meta data |
| Archetype drilldown (decklists + field score) | Meta | User clicks a meta-table row |
| Legal pages (Impressum / Datenschutz) | `/impressum`, `/datenschutz` | Footer links; reachable signed-out |

---

## 1. Meta Overview

**Page:** `OverviewPage`

The default landing page shows four summary stat cards (overall win rate, games logged, deck size, top meta threat) and two charts:

- **Meta Share Chart** (`MetaShareChart`): A pie or bar chart showing the frequency distribution of archetypes from the latest `metaSnapshots`.
- **Win Rate Chart** (`WinRateChart`): Compares the user's personal win rate against each archetype, on a **Bo1-equivalent** basis — Bo3 results are converted back to their single-game win rate (`bo3ToBo1WinRate`) and logs with no known match format are excluded from the number (shown as an excluded-games footnote) rather than folded in. Both this and the archetype's own tournament win rate weight a tie as a third of a win (`tournamentWinRatePct`, `@pokekon/shared`).
- **Meta Table** (`MetaTable`): A sortable table of all archetypes with encounter count, win/loss, and meta frequency.

Data source: Zustand store (`archetypeStats`, `metaSnapshots`). No API calls on this page.

---

## 2. Live Meta Sync

**Triggered from:** the "Sync Live Meta" button — in the desktop **Sidebar** and, since the sidebar is hidden on mobile (`md:flex`), also in the **Meta page** header, so it's reachable on every viewport.

Runs **server-side** (`POST /api/meta/sync` → `apps/api/src/jobs/syncMeta.ts`, also runnable as a Railway cron): the server fetches the Limitless TCG API directly (no CORS proxy needed) and aggregates into the global `meta_snapshots` table.

**Process:**
1. Fetches up to 100 recent completed Standard tournaments (last 30 days, post-rotation, ≥16 players)
2. **Delta import**: checks which candidates are already in the DB with `pairingsSyncedAt` set — those are skipped entirely. Only new events are probed and ingested; coverage accumulates across runs without re-fetching known-good data.
3. Classifies each new candidate via the Limitless `/details` endpoint (`isOnline`, `platform`, Swiss-phase `mode`) and keeps only **online Bo1-Swiss** events — the proxy for local Bo1 Challenges/Cups. The tournament cap (`maxTournaments=80`, `maxProbes=160`) is high enough to ingest **all** qualifying events in the window; the delta skip keeps the per-run cost bounded.
4. Fetches standings for each selected tournament
5. **Fetches `/pairings`** for each tournament and resolves the round-by-round head-to-heads into per-archetype matchup rows, which are persisted in `tournament_matchups`. Simultaneously, **per-pilot match results** are derived: for each standing, the pairing data is mapped into `StandingMatchResult[]` records (opponent archetype slug + W/L/T + round number) and stored in `tournament_standings.match_results` (jsonb, added in migration `0009`). A failed pairings fetch leaves `pairingsSyncedAt` null so the event is retried next run (its standings still persist).
6. **Persists the raw data** (plan §5.2): upserts `tournaments`, replaces the event's `tournament_standings` rows — including player name, placing, wins/losses/**ties**, **pruned decklist** jsonb, **`icons`** (Limitless `deck.icons`), and **`match_results`** — so the archetype drilldown, time-window analyses, and the prediction drill-down read from the database instead of re-fetching.
7. **Recomputes `meta_snapshots` from the full DB** (not only the current run's fetch): because the delta skip means a run may not have fetched every event in the week, the weekly snapshots are derived from all persisted standings matching the window — so accumulated runs compose into a complete picture. Icons are surfaced from whichever pilot carried them.
8. Filters out archetypes with fewer than 2 total players; computes `frequencyPct` (players / total players) and `winRatePct` via `tournamentWinRatePct` (a tie counts as a third of a win, `null` only when there were no games at all — `packages/shared/src/winRate.ts`); upserts `meta_snapshots` (keyed `period` + `archetype`, also carrying the Limitless slug in `archetype_id` and the summed `ties`).

**One-off historical backfill:** `npm run job:backfill-winrates -w @pokekon/api [-- --dry-run]` (`apps/api/src/jobs/backfillMetaWinRates.ts`) recomputes `win_rate_pct`/`ties` on existing `meta_snapshots` rows from the raw `tournament_standings` history, so the tie-aware formula applies retroactively without a code-only trend break. It only overwrites a row when its stored `wins`/`losses` still exactly match the freshly recomputed raw totals for that period (a mismatch means the row was originally synced under a different scope and is left untouched, only counted); periods with no raw data at all (pre-migration-`0005` history) are also left untouched. Always run `--dry-run` first and check the counters before the real run (plan §5).

**Downstream consumers of `match_results`:** The archetype-lists endpoint (`GET /api/meta/archetypes/:id/lists`) joins each standing's `match_results` jsonb and returns it as the `matchResults` field of every `ArchetypeListEntry`. The prediction panel's per-list drill-down (`ListFieldPerformance`) reads this field to show real game-by-game W/L vs the local field — no additional server call needed.

**Progress feedback:** The Zustand store exposes `isSyncing` and `syncProgress` strings that the Sidebar and the Meta page header render in real time.

---

## 3. Deck Management

**Page:** `DeckPage` — "Deck List" section

The app supports multiple decks. Each deck has an archetype (for Limitless matching), an archetype name (display), and a variant label.

**Operations available:**
- **Create deck**: Via `CreateDeckModal` — enter name and variant
- **Switch deck**: Via `DeckSwitcher` — tab bar showing all decks
- **Add card manually**: Via `AddCardModal`
- **Import deck from text**: Via `ImportDeckModal` — paste a PTCG export list
- **Edit card count**: Inline in `DeckPanel`
- **Delete card**: Via delete button in `DeckPanel`
- **Rename deck**: Via `DeckSettingsWidget` (Archetype name, variant label, Limitless slug)
- **Delete deck**: Cascades to all related cards, snapshots, and logs
- **Duplicate as new variant**: Creates a new deck row with the same archetype/archetypeName but a new variant label, optionally copying cards

**Deck import format:** Standard PTCG list format with sections `Pokémon:`, `Trainer:`, `Energie:` (German) or `Energy:` (English). Each card line: `<count> <name> <set> <number>`. The importer infers card role automatically.

---

## 4. Deck Versioning (Snapshots)

**Page:** `DeckPage` — Deck List section, "Version History" side panel

Users can save a named snapshot of the current deck list at any moment. Snapshots:
- Store the full card list as JSON (not a diff)
- Can be attached to match logs when logging a game
- Are used by the recommendation engine to compare win rates across deck versions

Snapshot selection is offered **in the logging context** (the "more options" section
of "Match loggen") rather than as its own main area — it is secondary information a
log can carry, not a destination of its own (see §6's battle-log-first flow and the
deck-page IA change described there).

**Typical workflow:**
1. Build deck variant A, play some games
2. Save snapshot "v1 — original build"
3. Make changes (add/remove cards)
4. Save snapshot "v2 — added Fezandipiti"
5. Play more games, log them with snapshot v2 selected
6. Recommendations engine detects if WR changed significantly between versions

---

## 5. Deck Variants

Multiple decks can share the same `archetype` slug (e.g., all `"n-zoroark"` variants). This allows comparing different builds head-to-head in the `DeckAnalyticsPanel`.

The `DeckSwitcher` component shows all decks as tabs. The `DeckAnalyticsPanel` fetches variant stats via `getDeckVariantStats()` to produce per-variant win rates and matchup breakdowns.

---

## 6. Match Log

**Page:** `DeckPage` — the deck page has **two** co-equal sections (Deck List /
Analytics); the match log is no longer a third tab. A small, always-visible
"Log match" button next to the section tabs opens `AddLogModal` from either
section; the log list itself lives as an initially-**collapsed** section at the
end of Analytics, titled with the current log count (plan
`personal-data-role-rework.md` §3.8 — the deck-page IA acceptance criterion demotes
this *area*, not the logging *action*, which stays one tap away). Also accessible
as standalone `OpponentsPage`.

**Battle-log-first entry (plan §3.6):** pasting a PTCG-Live battle log is the
**first** field in "Match loggen", before the manual archetype/result pickers. If
the pasted log's evidence uniquely identifies the opponent archetype and/or the
game's result, those fields pre-select themselves (still fully editable — a manual
override is never silently reverted by a later render). Three outcomes, no
invented percentages:
- **Unique** — exactly one archetype candidate's card-name signature is fully
  covered by the opponent's cards in the log → pre-selected automatically.
- **Ambiguous** — more than one candidate is equally well covered (or none reaches
  full coverage) → up to three candidate chips are offered; none is auto-picked.
- **None** — no signature fragment matched at all → the form behaves exactly as if
  no log had been pasted, with a neutral hint, never error styling.

The result is only pre-filled for **Bo1** — a single battle log covers one game,
not a whole Bo3 match — and only once the local player is unambiguously identified
in the log; if the parser's two detected names don't include an exact match for the
stored player name, the modal asks "Welcher Spieler bist du?" once, persists the
answer to `localStorage['tcg-player-name']`, and only then proceeds with the guess.
This logic lives entirely in a new, pure `@pokekon/shared` module
(`battleLogPrefill.ts`) that consumes `ParsedBattleLog` output — it does not change
the parser itself (see §7's one narrow exception) or persist anything beyond what
already existed.

Saving a log now also sends the local player's name (`playerName`, already accepted
but previously unused by the web client) so the server-side parse
(`match_log_parsed`) is pinned to the correct side from the moment of creation,
instead of falling back to a frequency heuristic that could silently attribute the
wrong player's turns.

Records the result of each game played. Fields:
- Opponent deck archetype (text, matched against meta data)
- Event type (LC, LCup, Regional, Worlds, Online)
- Match format — Bo1 or Bo3 (`bestOf`, **required** on new logs). Defaults from
  the event type (Regional/Worlds → Bo3, else Bo1) but is always changeable
  before saving, and stays fixed once changed even if the event type changes
  afterwards. Logs written before this field existed have `bestOf: null`
  ("format unknown"): shown as a badge in the log list and match detail, they
  count toward the personal win rate but are excluded from the Bo1-equivalent
  comparison (§1) until backfilled via the one-time hint in the match detail
  modal (dismissable, `preferences.ts`). `bestOf` is hard-required on
  `POST /api/logs` (400 without it) so this can never be guessed for a
  newly-logged match; the **one exception** is the one-time legacy-Dexie
  migration (`localImport.ts`), which sends the whole local export as ONE
  batch to a dedicated `POST /api/logs/import` endpoint that explicitly
  accepts (and requires) `bestOf: null` — the only place a client may send
  `null` for this field. That endpoint is genuinely single-use per account
  (`legacy_import_state`, [database.md](./database.md)): a second attempt at
  any time returns `409`, so it can never become a standing second path
  around the hard-required guarantee above.
- Event date
- Result (W / L / T)
- Round number (optional)
- Deck snapshot (optional — which version was played)
- Notes (free text)
- Battle log (optional — raw protocol text from TCG Live, capped at
  `MAX_BATTLE_LOG_CHARS` = 200,000 characters server-side, ~2x the largest
  realistic log; the client textarea carries the same `maxLength`)

Logs drive the `archetypeStats` computation and all recommendation rules that depend on personal match history.

---

## 7. Battle Log Parsing

**Automatic** — triggered whenever a match detail modal opens for a log that has a battle log attached.

The battle log is the raw text from TCG Live's in-game protocol. It is **in German** because TCG Live uses German UI for German-language accounts.

**What is parsed:**
- Player names (detected by frequency analysis on action lines) — this is name
  detection only, **not** opponent archetype detection (see correction below).
- Turn-by-turn breakdown: cards played, energy attached, damage dealt, KOs, prizes taken
- Prize progression chart data (how many prizes each player had after each turn)
- Damage-by-turn chart data
- Card frequency (how often each card was played by the user)
- Winner detection, including a game the local player conceded (`"Du hast
  aufgegeben. X hat gewonnen."`) — the regex tolerates a sentence prefix before
  "X hat gewonnen", not just an anchored start-of-line match, so the common
  online case of a conceded game still yields a winner (plan
  `personal-data-role-rework.md` §3.4/§0.5; the **one** sanctioned, additive
  exception to that plan's "the parser is out of scope" rule — it changes no
  persisted field and has exactly one display consumer).

**Output types:** `ParsedBattleLog`, `ParsedTurn`, `PrizePoint`, `DamagePoint`, `CardCount`

The parser relies on the `tcg-player-name` localStorage key to identify which player is "you". If not set, it defaults to the most-frequent actor in the log.

**Corrections (plan `personal-data-role-rework.md` §0.3/§0.5 — belegt, replacing an
earlier, inaccurate description):**
- **The parser detects no opponent archetype and exposes no confidence value at
  all.** `ParsedBattleLog` has no archetype field and no score. Archetype
  detection (§6 above) is a **separate**, newer module
  (`@pokekon/shared/battleLogPrefill.ts`) that consumes the parser's output
  (cards played, bench, active Pokémon, KOs) without modifying it, and reports a
  coverage-based `unique`/`ambiguous`/`none` result instead of a fabricated
  percentage.
- **Card names in real German logs are German, not English.** The previous claim
  here (and the doc comment this section was based on) — that PTCG Live's German
  client prints English print names for Trainers — does **not** hold for real
  logs: Konrad's own reference log (`apps/api/src/lib/demoSeed.ts`) shows fully
  localised Pokémon **and** Trainer names (`Ns Zoroark-ex`, `Mega-Kangama-ex` =
  Kangaskhan, `Rockos Erkundung`, `Schloss von N`, `Höhlensystem Null`, ...).
  `battleLogPrefill.ts`'s archetype signatures therefore carry an optional,
  hand-maintained `logNames` field with the German fragments per archetype
  (currently filled in for a handful of archetypes verified against that real
  log; a missing or wrong fragment only ever causes a **missed** detection,
  never a wrong one).
- **Known gap, not fixed here:** `KNOWN_SUPPORTERS` (the allow-list
  `battleLogParser.ts` uses to flag a "clean setup") is English-only and
  therefore effectively never matches in a real German log, so
  `setupCleanByTurn2` (and the recommendation rules that depend on it, §10 rules
  11/12) work from a systematically weak signal today. Fixing this is parser
  work and out of scope for this plan; noted here so it doesn't read as an
  oversight.

---

## 8. Battle Log Analysis (server-side LLM · BYOK)

**Page:** Match detail modal, "Analyze" button

The analysis runs **server-side**: the web client calls `POST /api/analysis/log`
([apps/api/src/routes/analysis.ts](../apps/api/src/routes/analysis.ts)), which runs
the battle log through a **provider-agnostic** adapter. The default (and currently
only) provider is **GitHub Models** (OpenAI-compatible, default model
`openai/gpt-4.1`); the abstraction in [apps/api/src/ai/](../apps/api/src/ai/) lets
other providers plug in without touching callers.

**What is analyzed:**
- Key turning-point moments with exact evidence quotes
- Play mistakes with suggestions for improvement
- Card-level performance observations
- Deck change recommendations (add/remove/increase/decrease specific cards)

**Anti-hallucination measures** (enforced in the shared engine `@pokekon/shared`, so every provider is grounded):
1. The full raw log is included in the prompt — the model cannot invent events
2. Every analysis item must include an `evidence` field that is a verbatim quote from the log
3. After parsing the JSON response, `validateAnalysis()` drops any item whose `evidence` cannot be found in the raw log
4. `temperature: 0` and JSON-only output for deterministic, parseable results
5. The prompt restricts references — and deck suggestions — to cards that appear explicitly in the log

**BYOK key handling:** The user supplies their own provider API key. It is stored
**AES-256-GCM-encrypted** in PostgreSQL (`user_ai_settings`, key derived from the
server's `ENCRYPTION_KEY`) and decrypted **only server-side** for the call — it is
never returned to the browser or written to IndexedDB/localStorage. The guest/demo
flow may pass an ephemeral key that is used once and never stored (see
[demo-mode.md](./demo-mode.md)).

---

## 9. Deck Comparison vs. Tournament Lists

**Page:** `RecommendationsPage` — "List Comparison" section

Compares the user's current deck against public decklists submitted to recent Limitless tournaments.

**Process:**
1. Fetches top 8 largest recent Standard tournaments
2. Collects all decklists from players whose deck matches the user's archetype slug
3. Computes for each card: how many lists include it, average copy count, top-placing average count
4. Compares against user's current deck

**Output:**
- `suggestedAdds`: Cards in 55%+ of tournament lists that the user does not run
- `suggestedRemoves`: Cards the user runs that appear in 20% or fewer tournament lists
- `countAdjustments`: Cards the user runs where their copy count differs by 1+ from the typical count in top-placing lists

**Second signal: Card performance deltas** (Spec 5, §3.7–§3.8)

In addition to copy frequency, each card now carries a **performance delta** — a measured correlation between that card's presence and tournament placement percentile. This appears as a second bar/signal per card:
- **Confirmed**: Frequent (≥55%) *and* significantly correlated with better placements
- **Hidden Gem**: Rare (<55%) *but* significantly correlated with better placements
- **Popularity Paradox**: Frequent but *no positive* performance delta — a card everyone plays that does not actually help
- **Discouraged**: Significantly correlated with worse placements
- **Neutral**: Measurable data but no strong signal
- **Insufficient**: Too few lists to compute a reliable delta

The delta is derived from precomputed tournament data (own database, `archetype_card_stats` table) and represents the **Mann-Whitney probability of superiority** — how often a list *with* the card ranked better than a list *without* it, converted to percentage points (0 = equally; 50 = no difference; 100 = always better).

**Important data-source distinction:** Copy frequency comes from a Limitless browser fetch (8 largest recent tournaments, all scopes), while performance deltas come from the server's own database of online-Bo1-only tournaments (7–28 day window). These are **two different tournament populations**, and the same card can show different inclusion percentages between them. The UI labels both data sources separately, and `inclusionPct` (from the server) does **not** drive the 55%/20% thresholds — those remain on the Limitless-based frequency data only. This design ensures the two signals stay independent and avoids confusing two data streams.

**Limitation:** Requires the deck's archetype slug to be set correctly in Deck Settings (e.g., `"n-zoroark"`). If no public decklists are found for the slug, an error is shown.

---

## 10. Data-Driven Recommendations

**Page:** `RecommendationsPage` — primary panel

Generated by the `useRecommendations` hook. Runs entirely in the browser — no API calls. Produces `DeckRecommendation` items sorted by priority (`high → medium → low`) then by data points.

**The 14 recommendation rules:**

| # | Rule | Priority | Requires |
|---|------|----------|---------|
| 1 | Deck version WR swing ≥15% in a matchup | medium/high | ≥2 snapshots, ≥4 logs |
| 2 | Weak matchup flag (from own data) + pointer to List Comparison | medium/high | ≥5 encounters, ≥1 win |
| 3 | Zero wins vs. ≥8% meta archetype | high | Any losses |
| 3b | Local meta archetype with no log data | high | Local meta configured |
| 4 | Boss's Orders missing | medium | Deck loaded |
| 5 | No Pokemon search (Ultra Ball / Nest Ball etc.) | medium | Deck loaded |
| 6 | Overall WR drop ≥15% between oldest and newest snapshot | high | ≥2 snapshots, ≥6 logs |
| 7 | Meta archetype ≥10% with 0 personal encounters | low | Meta data + logs |
| 8 | Fewer than 5 total games logged | low | Any logs |
| 9 | Card played in <25% of analyzed games | medium | Battle logs present, ≥3 games |
| 10 | Card WR ≥15% below overall WR | low | Battle logs, ≥3 decisive games |
| 11 | Turn-1 average actions <1.5 | medium | Battle logs, ≥3 games |
| 12 | Low-activity turn rate >35% ("brick rate") | medium | Battle logs, ≥3 games |
| 13 | Average prizes taken in losses <2 | high | Battle logs, ≥2 losses |
| 14 | Wins average ≥3 turns longer than losses | medium | Battle logs, both outcomes |

**Rule 2 — no fabricated tech card, backed by measured card deltas:** The old hand-curated `TECH_SUGGESTIONS` table (archetype → "add card X") has been removed. Asserting a specific counter card is not defensible: a card that appears often in winning lists may be a universal staple (not a tech), and a genuine tech may not fit every deck's energy or shell. Rule 2 now reports the matchup weakness from the user's **own logged games** and points to the data-driven List Comparison (successful lists of the user's own archetype, which is deck-fit-safe). When card performance deltas are available (Spec 5), the rule enriches its reasoning by naming specific cards from the user's archetype that correlate with better tournament placements — specifically, cards classified as `'hiddenGem'` or `'confirmed'` that the user does not yet play, sorted by strength of correlation. The statement remains **archetypwide and correlational**, never matching-specific; it never claims a card counters a particular opponent, only that it correlates with the archetype's placement improvements.

**Local meta priority:** When the user marks specific archetypes as "local meta" (via `LocalMetaPanel`), those archetypes receive a priority boost in tech suggestions (always `high` priority when WR is bad) and generate blind-spot warnings even if their global meta share is below the normal threshold.

**Unchanged by the battle-log-first rework (plan `personal-data-role-rework.md`
§3.8):** the 14 rules and their thresholds above are untouched. What changed is
visibility at zero logs — `OverviewPage` and `RecommendationsPage` now show a
static, honest notice explaining that the meta table / recommendations above work
from real tournament data, and listing exactly three of the real thresholds a
user can unlock by logging matches (rule 2's `≥5 encounters`, rules 9–12's `≥3
games with a battle log`, rule 1/6's `≥2 deck versions + ≥4 logs`) — a
static list, not a live re-explanation of all 14 rules, since that belongs to a
future prediction-focused feature, not this one.

---

## 11. Local Meta Configuration

**Page:** `DeckPage` — Deck List section, "Local Meta" side panel

Users can tag archetypes as frequently played at their local store. This affects the recommendations engine:
- Tech suggestions for these matchups are always `high` priority
- Archetypes in local meta with no logged games generate "Log matches" warnings
- Local meta archetypes bypass the 8% meta frequency threshold for zero-win alerts

Persisted to `localStorage` as `tcg-local-meta-v1`.

---

## 12. Recent Tournaments

**Page:** `MetaPage` — "Recent Tournaments" section

Fetches individual recent tournaments from Limitless with configurable filters:
- Days back (3, 7, 14, 30)
- Minimum players (30, 50, 100)
- Online only toggle (uses heuristic: name contains "online", "live", "ptcgl", "weekly", or player count ≥150)

For each tournament, shows the top 5 archetypes by player count with their win rates. Links to the Limitless standings page.

This data is **not persisted** — it lives only in Zustand's `recentTournaments` array for the current session.

---

## 13. Matchup Matrix

**Page:** `MetaPage` (collapsible section) — `MatchupMatrix` component

A head-to-head win-rate cross-table for the current Standard meta. Every cell that has any data shows its win rate — there is no hard sample-size cutoff (Spec 3, plan `confidence-aware-matchups.md`). Colour hue still encodes the win rate (green favorable, red unfavorable), but colour **intensity/opacity** now encodes confidence: a narrow 95 % Wilson interval (`@pokekon/shared`'s `matchupCellInterval`/`confidenceTier`, ≤10/20/35 percentage points wide) renders fully saturated, a wide one washed out. Each cell shows a small second line with its `low–high` band (0 decimals), and the tooltip states the full interval. The mirror diagonal is a documented special case: no band, no tier, plain win rate at reduced opacity — the bundled TrainerHill export double-counts mirror wins/losses (see below), so a Wilson interval over `wins+losses+ties` there would be wrong. The user-controlled **min-games filter** (1/10/20/50, still purely a display filter, never a model cutoff) now defaults to **1** instead of 10, so the view built to retire the cutoff doesn't keep hiding thin cells by default.

**Data source:** `GET /api/meta/matchups?days&online&bo1` — a **real online-Bo1 matrix** built from the round pairings persisted in `tournament_matchups`, blended with the external TrainerHill CSV as a coverage fallback. Win rate uses the shared tournament formula (a tie counts as a third of a win). The blend works as follows: for each directed pair (A vs B), the own data takes precedence when it has at least `MIN_MATCHUP_GAMES` decisive games; otherwise the TrainerHill row fills in. (This blend threshold is a data-source decision, unrelated to and unchanged by the Spec-3 confidence bands — see plan §0.) The response includes a `matchupSource` object (`ownPairs`, `fallbackPairs`, `ownGames`, `trainerHillImportedAt`, `conflictCount`, `conflicts`) so the UI can display a source note distinguishing real head-to-heads from the approximate external fallback.

**Source conflicts:** when our own data overrides the TrainerHill fallback for a pair (`>= MIN_MATCHUP_GAMES`) and the two win rates differ by more than 15 percentage points, `detectMatchupConflicts` (`packages/shared/src/matchupConflict.ts`) flags it — the matrix note shows the count with a tooltip listing each pair's own/fallback values, and the server logs one summary line per request. **The displayed win rate is always the own value**; a conflict is a hint for a human to look at, never an auto-fix. **Update (Spec 3):** TrainerHill's tie convention, previously listed as unknown (Spec 2 risk 4), is now confirmed identical to ours — cross-checking `apps/api/data/matchup-matrix.csv` shows all 178 non-mirror rows satisfy `win_rate == (wins + ties/3)/total × 100` within 0.06pp, i.e. TrainerHill also counts a tie as a third of a win. The two numbers being compared in a conflict are defined the same way. Separately, all 14 mirror rows in that CSV are internally inconsistent (`wins == losses` and `wins+losses+ties` double the row's own `total`) — mirror rows must never have a Wilson interval computed over `wins+losses+ties`; `computeFieldScores` never looks them up (the mirror is definitional 50 %), and the matrix diagonal is excluded from banding for the same reason.

The legacy `GET /api/matchups` endpoint (external TrainerHill batch only, no window filter) remains available for the local-meta prediction panel and CSV import (`POST /api/matchups/import`). The server lazily seeds `matchup_matrix` from the CSV bundled at `apps/api/data/matchup-matrix.csv` on first read.

Archetype icons in the matrix are data-driven, sourced from the Limitless `deck.icons` field persisted during sync.

---

## 14. Legal Pages (Impressum / Datenschutz)

**Routes:** `/impressum` and `/datenschutz` — standalone pages rendered by `LegalPage` (`apps/web/src/pages/LegalPage.tsx`).

Unlike the four dashboard tabs (which are Zustand `activeTab` state, not URLs), these are real paths. `App.tsx` checks `legalDocForPath(window.location.pathname)` **before the login gate** — like `/reset-password` — so the pages are reachable while signed out (a legal requirement) and survive a reload via the API's SPA fallback.

- **Content** lives entirely in the `legal` i18n namespace (`apps/web/src/i18n/locales/{de,en}/legal.json`) as `{ heading, body[] }` sections, so switching DE/EN reflows the whole document. The **German version is the legally binding one** (stated in the page footer).
- **Links** are rendered by the shared `LegalLinks` component in three places: the `WelcomeScreen` footer (signed-out), the desktop `Sidebar` bottom, and the mobile `MobileAccountSheet`. Plain `<a>` anchors — a full navigation is acceptable for legal pages and keeps the router-less app simple.
- The privacy policy reflects the **current** server-side architecture: PostgreSQL on Railway (EU, `europe-west4`), Better Auth sessions (storing IP + user-agent), Resend for transactional email, **GitHub Models** for the BYOK battle-log analysis (key stored AES-256-GCM-encrypted server-side), optional Google sign-in, and GitHub-hosted sprite images.

---

## 15. Archetype Drilldown (Tournament Decklists & Field Score)

**Page:** `MetaPage` — click any row of the Tournament Meta table (`ArchetypeDetail` component)

Every archetype row is clickable and opens an in-tab drilldown. The whole Meta tab shares one **window control** — a free numeric day input (accessible `QuantityStepper`, range 1–180) with **preset buttons** (7 / 14 / 30 / 60 days) for quick-jumps, plus an **online-Bo1 toggle** (default on: only ground-truth online Bo1-Swiss events, the local-Bo1 proxy) — that drives both the overview and the drilldown:

- **KPI header:** meta share, tournament win rate, pilot count, field score + rank, weekly share/WR trend chips. Both the tournament win rate and the field score KPIs show their 95 % confidence band as a small second line (Spec 3) — the tournament WR band comes straight from `wilsonInterval(wins, losses, ties)`, the field score band from the same `fieldWinRateLowPct`/`HighPct` shown in the field-performance panel below. The trend reads `meta_snapshots.win_rate_pct` directly, so it only reflects the tie-aware formula for periods the one-off backfill job (§2) has touched or that were synced after the formula changed; older, un-backfilled periods (or periods with no persisted raw standings to recompute from) keep their original value. The trend line itself does **not** show a band (deferred, plan §6 risk 6 — no acceptance criterion requires it, though the raw wins/losses/ties needed are already selectable from `meta_snapshots`).
- **Field performance (the core metric, plan §3.4):** `FieldWR(A) = Σ share(B) × MatchupWR(A vs B)` over all opponents with **any** matchup data at all — Spec 3 (`confidence-aware-matchups.md`) removed the previous ≥10-games-per-pair cutoff. A thin cell (even a single game) now counts fully; its uncertainty shows up as an explicit **95 % confidence band** (`fieldWinRateLowPct`/`fieldWinRateHighPct`, full error propagation over the share-weighted sum of independent per-cell Wilson intervals, see `docs/data-types.md`) instead of the cell vanishing from the score. The mirror still counts as 50 %, definitionally, with zero variance. Normalised by the covered share; the **coverage %** is always shown (low coverage < 40 % gets a warning). **`coveragePct` changed meaning with Spec 3:** it used to mean "share of the field with ≥10 games", now it means "share of the field with any data at all" — it typically reads higher than before, and no longer implies the number is reliable by itself. Coverage and confidence are two separate questions: coverage says how much of the field has data, the band says how sure we are about the part that does (surfaced as a tooltip next to the band). Computed in `packages/shared/src/fieldWinRate.ts`, served by `GET /api/meta/archetypes/:id/analysis`.
- **Preparation panel:** opponents weighted by *frequency × matchup weakness* — common **and** bad-for-you decks rank first ("Darauf musst du vorbereitet sein"), plus the mirror probability and the good matchups (free wins). Each entry shows its own confidence band; entries whose interval still includes 50 % (`significant === false`) carry an explicit "unreliable" label (not just a colour, for accessibility) and sort behind significant entries at the same weight tier, rather than disappearing.
- **Matchups vs the field:** a table (`MatchupTable`) listing this archetype's record against every covered opponent — win rate, its 95 % interval, game count, and meta share — sorted from most favourable to least favourable. Data comes from the same real online-Bo1 blend (`tournament_matchups` + TrainerHill fallback) as the matrix. Opponent icons are data-driven from `iconsById` returned by `GET /api/meta/archetypes/:id/analysis`.
- **Most successful decklists:** published lists from the persisted standings, ordered by relative finish (placing ÷ field size, ties → bigger event, then more recent), 4 per page with a load-more button (`GET /api/meta/archetypes/:id/lists`). Each card shows placing, record, player, event and the full list grouped Pokémon/Trainer/Energy, linking to the Limitless standings. Pokémon icons are data-driven from Limitless `deck.icons`.

The overview Meta Table **is** the day-window field analysis itself (`GET /api/meta/field-analysis?days&online&bo1`): share, win rate, record **and** a sortable **Feld-Score** column per archetype, so the best-positioned deck — not merely the most-played one — is visible at a glance, and the day/online controls genuinely drive the metashare (not just the score).

**Cold start:** before the first server sync there are no persisted standings — the drilldown and the overview table show explicit empty states pointing to "Sync Live Meta".

---

## 16. Local-Meta Prediction

**Page:** `MetaPage` → "Prediction" section (`PredictionPanel` component)

Answers "what should I play at *my* local event?". The user builds the field they expect at their local Bo1 tournament — **seedable in one click from the current online meta** (the whole premise: online Bo1 ≈ local Bo1), then editable (add/remove archetypes, adjust weights).

**Field editor:** The local field table is **collapsible** (header button, `aria-expanded`) so it does not dominate the panel once configured. Each archetype row has an accessible **QuantityStepper** (−/+ buttons + numeric spinbutton, clamped to [0, 99]) to set its relative weight; the live share % is computed and shown beside it. Weights are normalised to shares and fed into the **same** `computeFieldScores` engine (`@pokekon/shared`) as the online field analysis, so every deck in the field gets an expected win rate against that custom field (share × matchup WR, mirror 50 %, coverage shown).

**Deck perspective:** Instead of a count-ordered ranking list, a **deck-perspective picker** (a `<select>` ordered by descending field win rate) lets the user choose which deck to evaluate against the field. Above the picker a **best-positioned headline** (Trophy icon) always names the deck with the highest field WR, its score **and its 95 % confidence band** (Spec 3 — `computeFieldScores` propagates the same Wilson-interval error propagation here as it does server-side, since `PredictionPanel` calls it client-side with the fetched `MatchupRow[]`), so the answer is visible at a glance without opening the dropdown.

When a deck is selected the panel shows its field-score and weighted threats/free-wins panels, and fetches that deck's most successful tournament lists (`getArchetypeLists` → `GET /api/meta/archetypes/:id/lists`) as **build templates**.

**Per-list drill-down:** Each suggested list has a collapsible "Why?" toggle. Expanding it renders `ListFieldPerformance`, which shows that list's **real game-by-game W/L vs every deck in the local field** — drawn from `StandingMatchResult[]` on `entry.matchResults` (tournament round pairings, see §2). Results are grouped by opponent with a W-L record and per-game chips colour-coded like the match log (green win / red loss / amber tie), sorted with the best matchups first. If pairings have not been synced for that event the component renders an empty-state message; it never fabricates results.

Runs **entirely client-side** over the windowed matchup matrix (`getMetaMatchups` → `GET /api/meta/matchups`) — no extra server round-trip beyond the initial fetch — and the field persists in `localStorage` (`tcg-local-meta-field-v1`). The matchup matrix is the real online-Bo1 blend (own data + TrainerHill fallback), flagged with a source note showing real vs approximate coverage.

---

## 17. Card Performance Deltas

**Context:** Part of Spec 5 (recommendation-to-prognosis), providing a second signal alongside copy frequency in the Deck Comparison panel and enriching Rule 2 reasoning.

### What it measures

For each card within an archetype, the system compares tournament placements of published lists that include the card versus those that don't. The **performance delta** quantifies this difference using the **Mann-Whitney probability of superiority** (θ): the proportion of all head-to-head pairings where a list-with-card ranked better than a list-without-card. This is converted to percentage points (deltaPp = (θ − 0.5) × 100, so 0 = no difference, +20 = 70% superiority).

**Why placement percentile, not Field WR:** Placement is ordinal (the rank a pilot achieved in the tournament) and is directly available in the persisted tournament data. Deriving a hypothetical Field WR change would require a full-list Matchup matrix, which is the scope of later phases. Placement percentile is simpler, already exists, and captures whether the card correlates with finishing higher in the field.

### Confidence framing (Wilson-calibrated band)

Like the matchup matrix (Spec 3), the delta carries a 95% confidence band. The band is derived by treating θ as an effective Bernoulli proportion and applying the Wilson-Score interval via an **effective sample size** that reproduces the exact Mann-Whitney null variance:
- `n_eff = 3 × n1 × n2 / (n1 + n2 + 1)`, where n1/n2 are the list counts in each group
- At the null point (θ = 0.5), this gives a Wilson band with the correct calibration for the underlying rank-comparison variance

The band **defines when data is too thin to report:** cards with `widthPct > 40` percentage points are marked `'insufficient'` — a derived classification based on uncertainty, not a hard sample-size cutoff. This ensures the signal respects the Spec 3 principle (confidence-aware, never a false-precision cutoff).

**Three technical assumptions documented here (plan §3.0):**
1. **Ties assumption:** The no-ties variance formula assumes placement percentiles never collide. In practice, ties (identical percentiles) make the true variance smaller than the formula predicts, so the band is **conservative** (too wide, never too narrow). This prevents over-confidence.
2. **Null-point calibration:** The n_eff bridge makes the Wilson interval exact at θ = 0.5 (the decision boundary: "Is the band consistent with no effect?"). Away from the null point, the interval becomes a conservative approximation with credible coverage but not exact matching of the underlying distribution.
3. **Correlation, not causation:** Lists are not randomly assigned to include or exclude cards — decks come as packages, and card presence is correlated with pilot skill, meta-knowledge, and other confounders. The delta measures **association** (lists with X ranked better), never **causal impact** (X makes you better). This distinction is mandatory in all UI text.

### Six signal tiers

Derived by `classifyCardSignal()` in `packages/shared/src/cardPerformance.ts`:

| Tier | Condition | Meaning |
|------|-----------|---------|
| `'insufficient'` | delta = null OR band width > 40pp | Not enough lists to compute a reliable delta |
| `'confirmed'` | Significant positive delta AND frequency ≥55% | Staple that earns its slot |
| `'hiddenGem'` | Significant positive delta AND frequency <55% | Underplayed, worth testing |
| `'popularityParadox'` | Frequency ≥55% AND (delta ≤ 0 OR not significant) | Everyone plays it, but no placement boost |
| `'discouraged'` | Significant negative delta | Correlates with worse placements |
| `'neutral'` | Measurable but no strong signal | Everything else |

### Multiple-comparisons risk

At ~80 cards per archetype with 95% confidence, pure chance alone predicts ~4 "significant" cards per archetype per window. The system **deliberately does not apply Bonferroni or FDR corrections** — they would suppress almost all signals at these sample sizes (the hidden cost of the conservative approach). Instead:
- The delta is positioned as a **hint** for human interpretation, not a statistical test
- `MAX_USABLE_BAND_PP = 40` filters the unreliable tail
- The UI always displays the confidence band; users can judge whether it's conclusive

This is honest communication: acknowledge the noise, show the uncertainty, let the pilot decide whether to act.

### Data pipeline

`GET /api/meta/archetypes/:archetypeId/card-stats?days=7..180` returns precomputed deltas from the `archetype_card_stats` table. The job `computeCardStats` runs once per sync window (separate from `syncMeta`, typically after it) and rewrites the table for each (archetype, window) pair in a single transaction. Cold start (empty table) yields `computedAt: null` and `cards: []`; the UI tolerates this gracefully.

---

## 18. Game-Theoretic Meta Layer (Experimental)

**Page:** `MetaPage` — "Equilibrium Analysis" section (collapsed by default)

A second, independent analysis layer built atop the Field Score. Instead of answering "how does deck A perform against the *observed* field", this section answers "what deck mixture would be optimal against itself, and which decks fall out of that optimal mix regardless of their popularity". This is **experimental** and does **not** replace the Field Score feature.

### The problem and the method

Every archetype has a win rate against every other archetype, stored in the matchup matrix. If we treat this as a **constant-sum game** (a symmetric zero-sum payoff matrix), we can solve for the Nash equilibrium mixture — the deck distribution where **no single-game prediction player can unilaterally improve by switching decks**. For a symmetric game, the equilibrium is unique, and we can ask: "which decks belong in that optimal mix?"

The matchup matrix in `meta_snapshots` uses the tournament tie convention (a tie = ⅓ of a win), which makes `p_ij + p_ji = 1 − t/(3n)` — slightly less than 1 per pair. For the equilibrium calculation, this matrix is **symmetrized** into a zero-sum game via the formula `p_sym(i,j) = (1 + p_ij − p_ji) / 2`, which is mathematically identical to the "half-tie" convention `(w + t/2) / n` and ensures `p_sym(i,j) + p_sym(j,i) = 1` exactly. This is the same symmetrization the reference paper uses.

The equilibrium is computed via **linear programming** (Phase-II simplex with Bland's rule, standard form `max 1·q` subject to `P q ≤ 1, q ≥ 0`). The resulting weights `x = q/Σq` form the optimal mixed strategy. A byproduct is an **exclusion certificate**: any archetype whose payoff against the equilibrium is strictly below the game value is provably excluded from every equilibrium, not just this one.

### Robustness: Monte-Carlo resampling over uncertainty

A single equilibrium composition is fragile — small changes in data can reshuffle the support (which decks are in the mix). To quantify this, the system runs a Monte-Carlo resampling over the matchup matrix's **Wilson-interval uncertainty**: each unordered pair `{i, j}` is sampled **once** from its Jeffreys-Beta posterior (reflecting the observed win-rate uncertainty), and the mirror cell is set to `1 − p` to maintain constant-sum-ness. The equilibrium is re-solved for each resample (2000 by default), and we report per archetype **in what percentage of resamples** that archetype was **excluded** (payoff strictly below the value). This "exclusion robustness" is the strong claim: "this deck falls out of the optimal mix in X% of reasonable scenarios, even accounting for sampling uncertainty."

**Three mathematical assumptions documented in code and [`docs/data-types.md`](./data-types.md):**
1. **Symmetrization:** The matchup matrix is not naturally zero-sum under the tie convention, so it must be symmetrized first — this restores the minimax theorem's applicability.
2. **Jeffreys-Beta resampling distribution:** We sample from the Jeffreys posterior `Beta(s + 0.5, n − s + 0.5)` rather than uniform over the Wilson band, because it is the Bayesian dual of the Wilson interval and is consistent with the symmetrization (its mirror is the exact posterior of the opposite direction). At thin sample sizes, Jeffreys differs from the Wilson band at the tails, so the reported robustness percentages are **not** identical to "resampling uniformly in the Wilson interval"—a distinction that matters for reproducibility.
3. **Exclusion is one-directional:** The certificate proves exclusion (payoff < value ⇒ not in any equilibrium), but **does not prove inclusion**—equal payoff does not guarantee a deck is in equilibrium, because the equilibrium can be non-unique in degenerate cases. The UI reports the exclusion robustness for decks that are excluded, and shows the equilibrium composition (with a fragility warning if exact-support reproducibility is low) for decks in the point estimate.

### Three easily-confused numbers

After implementing this feature, **three different win-rate-shaped numbers exist** and must not be conflated. They have different meanings, use different weight vectors, and handle missing data differently:

| Number | Definition | Weight vector | Remis convention | Missing data | Used in |
|--------|-----------|---------------|------------------|--------------|---------|
| `fieldWinRatePct` | Share-weighted EV against the **observed field** | Observed archetype shares | ⅓ of a win (tournament) | Excluded from coverage | Field Score panel, Spec 3 |
| `fitnessPct` | Fitness `Σ_j x_j P_ij` against the **observed field** with a **constant-sum** payoff matrix | Observed archetype shares | ½ of a win (symmetrized) | Imputed as 50% | Replicator fitness display, this feature |
| `equilibriumPayoffPct` | Payoff `Σ_j x*_j P_ij` against the **equilibrium**, where `x*` is the Nash mix | Nash equilibrium weights `x*` | ½ of a win (symmetrized) | Imputed as 50% | Deck strength report in equilibrium composition, this feature |

All three are valid metrics for different questions, but showing one in place of another would mislead. The UI labels each distinctly and carries tooltips explaining the difference.

### Replicator fitness and week-over-week direction

From the equilibrium weights `x*`, we compute each archetype's **fitness** `f_i = Σ_j x_j P_ij` against the equilibrium mixture. Mean fitness for a constant-sum game is exactly 50% — a built-in self-check.

To track whether the meta is favoring a deck, we compare the **week-over-week fitness delta**: the fitness of archetype `i` against **the most recent completed full week's observed shares** minus its fitness against **the prior completed week's shares**, both evaluated on the same payoff matrix (so the delta isolates meta shifts, not sampling noise). This gives a direction (rising / falling / stable / unknown — unknown when fewer than two complete weeks exist). The delta is shown alongside the observed share change (descriptive only, never used for the direction, so theory and reality can diverge visibly).

### Data and computation

**Precomputed weekly:** The job `computeEquilibrium` runs once per week (Monday recommended, after `syncMeta` completes), reads the default-scope (online, Bo1) tournament data for four analysis windows (7 / 14 / 21 / 28 days), computes the equilibrium for each, and persists to two tables: `meta_equilibrium_runs` (one row per window, carrying run-level metadata: game value, support size, robustness counters, imputation rate) and `meta_equilibrium_archetypes` (one row per archetype per window, with weights, payoffs, coverage, robustness percentiles, and trend data).

**API:** `GET /api/meta/equilibrium?days=7..180` returns the precomputed run for a snapped window (7 / 14 / 21 / 28 days). Cold start (before first job run) returns `computedAt: null`, `run: null`, `archetypes: []` — an honest empty state, never an error.

**UI placement:** The section is a **`CollapsibleSection` without `defaultOpen`**, titled with an "experimental" badge, appearing after the Field Score and Matchup Matrix sections on the Meta page. It includes:
- **Robust exclusions** (archetypes with `exclusionBand !== 'likelyIn'`): plain-language sentence ("Dragapult is in the most scenarios not a good choice — in 77.9% of 2000 resamples not part of the optimal mix (±0.9 pp)") plus raw percentage and confidence band
- **Exact composition** (the point-estimate equilibrium weights, shown only with a fragility warning if the exact support was reproduced in fewer than 50% of resamples, or if the equalizerCount suggests non-uniqueness)
- **Week-over-week trend** (arrow icon + direction label + fitness delta, with observed share change noted as descriptive context)
- **Source and limits** (computation timestamp, window, resample count, seed, imputation percentage)

### The "popularity paradox" framing

Decks in equilibrium are not necessarily popular, and popular decks are not necessarily in equilibrium. When a deck has high observed meta share but zero equilibrium weight (or a very low weight), that's the "popularity paradox"—played by many pilots despite being suboptimal to play against the current distribution. This is flagged with an icon and label pair (not color alone, for accessibility) in the equilibrium composition display, and the exclusion robustness for such a deck reinforces the statement: "in X% of scenarios, this deck drops out entirely."
