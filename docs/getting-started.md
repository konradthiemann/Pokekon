# Getting Started

## Prerequisites

- **Node.js** 18 or later (LTS recommended)
- **npm** 9 or later (comes with Node)
- A modern browser (Chrome, Firefox, Edge, Safari) — IndexedDB support required

No backend server, no database server, no Docker. The app runs entirely in the browser.

---

## Installation

```bash
cd /Users/konrad.thiemann/tcg/tcg-dashboard
npm install
```

---

## Development

```bash
npm run dev
```

Starts Vite's dev server. Open [http://localhost:5173](http://localhost:5173) in your browser.

The first time the app loads in a fresh browser profile, it seeds IndexedDB with a demo deck and some example data so the UI is not empty.

**Hot module replacement (HMR) is active** — saving any file in `src/` immediately reflects in the browser without a full page reload. IndexedDB state is preserved across HMR updates.

---

## Available Scripts

| Script | Command | What it does |
|--------|---------|-------------|
| Dev server | `npm run dev` | Start Vite dev server on port 5173 |
| Build | `npm run build` | TypeScript compile + Vite production build → `dist/` |
| Preview | `npm run preview` | Serve the production build locally for final checks |
| Lint | `npm run lint` | ESLint with TypeScript rules |

---

## Production Build

```bash
npm run build
```

Output is written to `tcg-dashboard/dist/`. The output is a fully static site — a single `index.html` with bundled JS and CSS assets. No server needed.

To verify the build works correctly before deploying:
```bash
npm run preview
```
This serves `dist/` via Vite's preview server (default: [http://localhost:4173](http://localhost:4173)).

---

## Deployment

Because the app is entirely static (no backend), it can be deployed to any static file host:

**Option A — Netlify / Vercel / GitHub Pages:**
```bash
npm run build
# Then deploy the dist/ folder via the platform's CLI or drag-and-drop
```

For Netlify, add a `netlify.toml` with a redirect rule to handle single-page app routing:
```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

**Option B — Any web server (nginx, Apache, Caddy):**
Copy the contents of `dist/` to your web root. Configure the server to serve `index.html` for all routes.

**Option C — Local file:**
Opening `dist/index.html` directly from the filesystem (`file://` protocol) does not work reliably because browsers restrict IndexedDB on `file://` origins. Use a local server (`npm run preview` or `npx serve dist`).

---

## First Use

1. Open the app — a demo deck is seeded automatically on first load.
2. Go to **Deck** → replace the demo cards with your real deck via "Import" (paste your PTCG export list).
3. Set your archetype in **Deck Settings**: enter the display name (e.g., "N's Zoroark") and the Limitless slug (e.g., `n-zoroark`).
4. Go to **Sidebar** and click **Sync Live Meta** to fetch current tournament data.
5. Start logging matches in the **Match Log** section.

---

## Using the Battle Log Analysis

The AI analysis feature requires an Anthropic API key. The key is **never stored** — you enter it each time you trigger an analysis:

1. Export a battle log from Pokemon TCG Live (in-game menu → Battle Log → Copy)
2. In the Match Log, open a match and paste the log text into the "Battle Log" field
3. Click "Analyze with AI", enter your Anthropic API key
4. The analysis is saved to the match record in IndexedDB

Note: TCG Live exports battle logs in **German** regardless of the UI language setting. The parser is built for German protocol text.

---

## Resetting Data

All data is in the browser's IndexedDB. To reset:

**Option A — Clear via DevTools:**
1. Open DevTools → Application → Storage → IndexedDB
2. Find `TCGMetaDashboard`
3. Delete the database

**Option B — Clear via JavaScript console:**
```javascript
indexedDB.deleteDatabase('TCGMetaDashboard');
```

After clearing, reload the page — the demo seed data will be re-inserted.

---

## Project Structure

```
tcg-dashboard/
├── src/
│   ├── App.tsx                    # App shell: layout + page routing
│   ├── main.tsx                   # React entry point
│   ├── index.css                  # Tailwind base styles
│   ├── components/
│   │   ├── deck/                  # Deck management UI components
│   │   ├── layout/                # Sidebar, BottomNav, StatCard, CollapsibleSection
│   │   ├── meta/                  # Meta charts and tables
│   │   ├── opponent/              # Match log, detail modal, stats tab
│   │   └── recommendations/       # Recommendations panel, deck comparison panel
│   ├── data/
│   │   └── seedMeta.ts            # Demo meta snapshot data for seeding
│   ├── db/
│   │   ├── database.ts            # Dexie TCGDatabase class and schema
│   │   ├── queries.ts             # All database read/write operations
│   │   └── seed.ts                # First-run seed logic
│   ├── hooks/
│   │   └── useRecommendations.ts  # Recommendation engine hook (useMemo)
│   ├── lib/
│   │   ├── battleLogAnalysis.ts   # Claude API integration for match analysis
│   │   ├── battleLogParser.ts     # German battle log text parser
│   │   ├── deckComparison.ts      # Tournament list diff against user deck
│   │   ├── deckImport.ts          # Decklist text parser + card type inference
│   │   ├── deckPerformanceStats.ts# Aggregates parsed logs into performance stats
│   │   ├── metaFetch.ts           # Limitless TCG API integration
│   │   └── preferences.ts         # localStorage wrapper (active deck, local meta, slug)
│   ├── pages/
│   │   ├── DeckPage.tsx
│   │   ├── MetaPage.tsx
│   │   ├── OpponentsPage.tsx
│   │   ├── OverviewPage.tsx
│   │   └── RecommendationsPage.tsx
│   ├── store/
│   │   └── dashboardStore.ts      # Zustand store — single source of UI state
│   └── types/
│       └── index.ts               # All shared TypeScript interfaces
├── .claude/
│   ├── agents/                    # Claude agent definition files
│   └── agent-memory/              # Persistent memory for each agent
├── docs/                          # This documentation directory
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## TypeScript Configuration

The project uses `TypeScript ~6.0.2` in strict mode. Key compiler options:
- `"strict": true` — enables all strict type checks
- `"moduleResolution": "bundler"` — Vite-compatible module resolution
- `"jsx": "react-jsx"` — React 19 JSX transform (no `import React` needed)

Type errors will cause `npm run build` to fail. During development, Vite allows type-error-free HMR (types are checked separately by `tsc`).

---

## Troubleshooting

**"No meta data yet" on Overview page:**
Click "Sync Live Meta" in the sidebar. This requires an internet connection to reach Limitless TCG.

**Battle log parsing produces wrong player names:**
Set your player name in localStorage: open the browser console and run:
```javascript
localStorage.setItem('tcg-player-name', 'YourTCGLiveUsername');
```
Then re-open the match detail.

**Deck comparison returns "No public decklists found":**
Check that the Limitless slug in Deck Settings exactly matches the format used on Limitless (e.g., `"n-zoroark"`, not `"N's Zoroark"` or `"nzoroark"`). You can verify by searching the archetype on [play.limitlesstcg.com](https://play.limitlesstcg.com) and checking the deck ID in the URL.

**App is slow after logging many matches:**
All data is loaded into memory on `refresh()`. This is rarely a problem in practice since typical usage involves hundreds, not thousands, of logs. If needed, `getArchetypeStats()` in `queries.ts` is the most expensive operation and could be memoized.
