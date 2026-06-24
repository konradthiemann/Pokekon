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
| Battle log analysis (Claude AI) | Deck → Match detail | User triggers + API key |
| Deck comparison vs. tournament lists | Recommendations | User triggers |
| Data-driven recommendations | Recommendations | Auto on data change |
| Local meta priority | Deck / Recommendations | User configures |
| Recent tournaments view | Meta | User triggers |
| Matchup matrix | Meta | Auto from meta data |

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

Fetches tournament data from the Limitless TCG API and aggregates it into `metaSnapshots`.

**Process:**
1. Fetches up to 50 recent completed Standard tournaments
2. Selects the top 6 by player count (minimum 30 players each)
3. Fetches standings for each selected tournament
4. Aggregates win/loss records per archetype across all tournaments
5. Filters out archetypes with fewer than 2 total players
6. Computes `frequencyPct` (players / total players) and `winRatePct`
7. Writes results to `metaSnapshots` for the current ISO week period
8. Clears old data first — the week's period replaces previous data for that week

**CORS strategy:** Tries the Limitless API directly first. If blocked (browser CORS), falls back to `corsproxy.io`.

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

## 8. Battle Log Analysis (Claude AI)

**Page:** Match detail modal, "Analyze" button

Sends the raw battle log to the Anthropic Claude API (model: `claude-opus-4-6`, temperature: 0) for structured AI analysis.

**What is analyzed:**
- Key turning-point moments with exact evidence quotes
- Play mistakes with suggestions for improvement
- Card-level performance observations
- Deck change recommendations (add/remove/increase/decrease specific cards)

**Anti-hallucination measures:**
1. The full raw log is included in the prompt — Claude cannot invent events
2. Every analysis item must include an `evidence` field that is a verbatim quote from the log
3. After parsing the JSON response, the app validates each `evidence` field: if the quote cannot be found in the raw log, the item is silently removed
4. `temperature: 0` for deterministic output
5. The system prompt instructs Claude to only reference cards that appear explicitly in the log (via bullet-point card listings)
6. Deck suggestions are restricted to cards already visible in the log

**Requirements:** User must supply their own Anthropic API key. The key is sent directly from the browser — it is never stored in IndexedDB or localStorage.

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

**Page:** `MetaPage` (collapsible) and `DeckPage` — Analytics section

A cross-table showing personal win rates for each pair of opponent archetypes encountered. Rows represent opponent archetypes; columns represent context or deck variants. Cells are color-coded: green for favorable, red for unfavorable, gray for insufficient data.

Data comes from `archetypeStats` which is derived from `opponentLogs` cross-referenced with `metaSnapshots`.
