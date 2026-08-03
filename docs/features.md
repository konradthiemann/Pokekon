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
- **Win Rate Chart** (`WinRateChart`): Compares the user's personal win rate against each archetype with the archetype's overall tournament win rate.
- **Meta Table** (`MetaTable`): A sortable table of all archetypes with encounter count, win/loss, and meta frequency.

Data source: Zustand store (`archetypeStats`, `metaSnapshots`). No API calls on this page.

---

## 2. Live Meta Sync

**Triggered from:** the "Sync Live Meta" button — in the desktop **Sidebar** and, since the sidebar is hidden on mobile (`md:flex`), also in the **Meta page** header, so it's reachable on every viewport.

Runs **server-side** (`POST /api/meta/sync` → `apps/api/src/jobs/syncMeta.ts`, also runnable as a Railway cron): the server fetches the Limitless TCG API directly (no CORS proxy needed) and aggregates into the global `meta_snapshots` table.

**Process:**
1. Fetches up to 100 recent completed Standard tournaments (last 30 days, post-rotation, ≥16 players)
2. Classifies each candidate via the Limitless `/details` endpoint (`isOnline`, `platform`, Swiss-phase `mode`) and keeps only **online Bo1-Swiss** events — the proxy for local Bo1 Challenges/Cups — up to ~20 (the name heuristic is only a `/details` fallback)
3. Fetches standings for each selected tournament
4. **Persists the raw data** (plan §5.2): upserts `tournaments`, replaces the event's `tournament_standings` rows — including player name, placing and the **pruned decklist** jsonb — so the archetype drilldown and time-window analyses read from the database instead of re-fetching
5. Aggregates win/loss records per archetype across all tournaments (`computeMetaSnapshots` in `@pokekon/shared`)
6. Filters out archetypes with fewer than 2 total players
7. Computes `frequencyPct` (players / total players) and `winRatePct`, and upserts `meta_snapshots` (keyed `period` + `archetype`, now also carrying the Limitless slug in `archetype_id`) for the current ISO week

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

**Page:** `DeckPage` — "Match Log" section; also accessible as standalone `OpponentsPage`

Records the result of each game played. Fields:
- Opponent deck archetype (text, matched against meta data)
- Event type (LC, LCup, Regional, Worlds, Online)
- Event date
- Result (W / L / T)
- Round number (optional)
- Deck snapshot (optional — which version was played)
- Notes (free text)
- Battle log (optional — raw protocol text from TCG Live)

Logs drive the `archetypeStats` computation and all recommendation rules that depend on personal match history.

---

## 7. Battle Log Parsing

**Automatic** — triggered whenever a match detail modal opens for a log that has a battle log attached.

The battle log is the raw text from TCG Live's in-game protocol. It is **in German** because TCG Live uses German UI for German-language accounts.

**What is parsed:**
- Player names (detected by frequency analysis on action lines)
- Turn-by-turn breakdown: cards played, energy attached, damage dealt, KOs, prizes taken
- Prize progression chart data (how many prizes each player had after each turn)
- Damage-by-turn chart data
- Card frequency (how often each card was played by the user)
- Winner detection

**Output types:** `ParsedBattleLog`, `ParsedTurn`, `PrizePoint`, `DamagePoint`, `CardCount`

The parser relies on the `tcg-player-name` localStorage key to identify which player is "you". If not set, it defaults to the most-frequent actor in the log.

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

**Limitation:** Requires the deck's archetype slug to be set correctly in Deck Settings (e.g., `"n-zoroark"`). If no public decklists are found for the slug, an error is shown.

---

## 10. Data-Driven Recommendations

**Page:** `RecommendationsPage` — primary panel

Generated by the `useRecommendations` hook. Runs entirely in the browser — no API calls. Produces `DeckRecommendation` items sorted by priority (`high → medium → low`) then by data points.

**The 14 recommendation rules:**

| # | Rule | Priority | Requires |
|---|------|----------|---------|
| 1 | Deck version WR swing ≥15% in a matchup | medium/high | ≥2 snapshots, ≥4 logs |
| 2 | Tech card suggestion for <50% WR matchup | medium/high | ≥2 encounters, tech known |
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

**Local meta priority:** When the user marks specific archetypes as "local meta" (via `LocalMetaPanel`), those archetypes receive a priority boost in tech suggestions (always `high` priority when WR is bad) and generate blind-spot warnings even if their global meta share is below the normal threshold.

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

A head-to-head win-rate cross-table for the current Standard meta (TrainerHill data). Cells are color-coded (green favorable, red unfavorable, gray below the min-games threshold) and show the win rate from the row deck's perspective.

Data comes from **`GET /api/matchups`** — the latest imported batch of the `matchup_matrix` table. The server lazily seeds the table from the CSV bundled at `apps/api/data/matchup-matrix.csv` on first read; a fresh TrainerHill export can be imported via `POST /api/matchups/import` (raw CSV body) or the `importMatchups` job. The matrix is also the data source for the field-score computation (feature 15).

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

Every archetype row is clickable and opens an in-tab drilldown. The whole Meta tab shares one **window control** — a day range (7/14/30/60) plus an **online-Bo1 toggle** (default on: only ground-truth online Bo1-Swiss events, the local-Bo1 proxy) — that drives both the overview and the drilldown:

- **KPI header:** meta share, tournament win rate, pilot count, field score + rank, weekly share/WR trend chips.
- **Field performance (the core metric, plan §3.4):** `FieldWR(A) = Σ share(B) × MatchupWR(A vs B)` over all opponents with usable matchup data (≥10 games per pair), the mirror counting as 50 %. Normalised by the covered share; the **coverage %** is always shown (low coverage < 40 % gets a warning) so a shiny score on thin data is impossible to miss. Computed in `packages/shared/src/fieldWinRate.ts`, served by `GET /api/meta/archetypes/:id/analysis`.
- **Preparation panel:** opponents weighted by *frequency × matchup weakness* — common **and** bad-for-you decks rank first ("Darauf musst du vorbereitet sein"), plus the mirror probability and the good matchups (free wins).
- **Most successful decklists:** published lists from the persisted standings, ordered by relative finish (placing ÷ field size, ties → bigger event, then more recent), 4 per page with a load-more button (`GET /api/meta/archetypes/:id/lists`). Each card shows placing, record, player, event and the full list grouped Pokémon/Trainer/Energy, linking to the Limitless standings.

The overview Meta Table **is** the day-window field analysis itself (`GET /api/meta/field-analysis?days&online&bo1`): share, win rate, record **and** a sortable **Feld-Score** column per archetype, so the best-positioned deck — not merely the most-played one — is visible at a glance, and the day/online controls genuinely drive the metashare (not just the score).

**Cold start:** before the first server sync there are no persisted standings — the drilldown and the overview table show explicit empty states pointing to "Sync Live Meta".

---

## 16. Local-Meta Prediction

**Page:** `MetaPage` → "Prediction" section (`PredictionPanel` component)

Answers "what should I play at *my* local event?". The user builds the field they expect at their local Bo1 tournament — **seedable in one click from the current online meta** (the whole premise: online Bo1 ≈ local Bo1), then editable (add/remove archetypes, adjust weights). Weights are normalised to shares and fed into the **same** `computeFieldScores` engine (`@pokekon/shared`) as the online field analysis, so every deck in the field gets an expected win rate **against that custom field** (share × matchup WR, mirror 50 %, coverage shown). Decks are ranked best-first; selecting one shows its field-score and weighted threats/free-wins panels.

Runs **entirely client-side** over the fetched matchup matrix (`GET /api/matchups`) — no server round-trip, no new table — and the field persists in `localStorage` (`tcg-local-meta-field-v1`). The matchup matrix is external TrainerHill data (mixed Bo1/Bo3), flagged as approximate in the field-score source note.
