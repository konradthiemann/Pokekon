# Plan — Baustein A: Doku-Viewer (Astro Starlight → GitHub Pages)

> Quelle: `docs/prompts/implementation-prompt-evolution.md` (Baustein A) + `docs/backend-evolution-plan.md` Abschnitt 8.
> Ziel: `docs/*.md` als durchsuchbare, hierarchisch verlinkte, statisch gebaute Doku-Site auf GitHub Pages. **Kein LLM im CI-Pfad.** Free-only.

## Belegte Fakten (gelesen)
- Repo-Remote: `github.com/konradthiemann/Pokekon` → Pages-URL `https://konradthiemann.github.io/Pokekon/` → **`base: '/Pokekon/'`** (case-sensitive, = Repo-Name).
- Workspaces: `apps/*`, `packages/*` (`package.json:9-12`). Neues Paket `apps/docs` = `@pokekon/docs`.
- Node `>=22`; CI nutzt Node 22 + `npm ci` (`.github/workflows/ci.yml`).
- `ci.yml` existiert und ist generisch (lint/typecheck/test/build) → `docs.yml` MUSS getrennt sein.
- `docs/*.md` haben **keine Frontmatter**; Starlight verlangt aber `title` je Seite → Frontmatter wird im **Sync-Step** injiziert, damit `docs/` führend bleibt (keine Doppelpflege, kein Eingriff in die Quelldateien).
- `docs/architecture.md` + `docs/README.md` ("Quick orientation") beschreiben veraltet "zero-backend SPA" → A4-Pflichtfix auf Hono+Postgres-Realität.
- Mermaid: `astro-mermaid` (Integration **vor** Starlight), Client-side-Rendering → **kein Browser im Build nötig** → CI bleibt rein statisch + kostenlos. Verifiziert via Projekt-Doku.

## Architekturentscheidungen
1. **Sync statt Symlink.** Node-Skript `scripts/sync-docs.mjs` kopiert die Top-Level-`docs/*.md` nach `apps/docs/src/content/docs/`, extrahiert die erste H1 als `title`, entfernt diese H1 aus dem Body (Starlight rendert den Titel selbst) und schreibt YAML-Frontmatter davor. `README.md` → `index.md` (Landing). `prompts/` wird **nicht** synchronisiert (Meta-Inhalt). Läuft via `predev`/`prebuild`-Hooks automatisch.
2. **Generiertes Verzeichnis** `apps/docs/src/content/docs/` ist gitignored — Quelle der Wahrheit bleibt `docs/`.
3. **Sidebar explizit** (nicht autogenerate), Gruppen exakt laut A2:
   Getting Started · Architektur · Datenmodell (database, data-types, data-flow) · KI-System (ai-system, agents) · Backend-Evolution · Features.
4. **Mermaid** via `astro-mermaid` (`autoTheme`, dark-kompatibel).
5. **A5 (OpenAPI)** = optional, in diesem PR ausgelassen (API-Zod-Schemas gehören zu Baustein B). Im PR-Text als bewusst verschoben vermerkt.

## Dateien
- `apps/docs/package.json` — `@pokekon/docs`, scripts: `dev`/`build`/`preview`/`sync`/`predev`/`prebuild`/`typecheck`(astro check).
- `apps/docs/astro.config.mjs` — site/base, integrations `[mermaid(), starlight({...})]`, Sidebar.
- `apps/docs/tsconfig.json` — extends `astro/tsconfigs/strict`.
- `apps/docs/scripts/sync-docs.mjs` — Sync + Frontmatter-Injektion.
- `apps/docs/src/content.config.ts` — Starlight content collection (docsLoader/docsSchema).
- `apps/docs/.gitignore` — `dist/`, `.astro/`, `src/content/docs/`.
- `.github/workflows/docs.yml` — Pages-Deploy.
- Inhalt: `docs/architecture.md` neu, `docs/README.md` Quick-orientation korrigiert.

## Gates / Akzeptanz
- `npm run dev -w @pokekon/docs` zeigt alle Docs mit Suche, Sidebar, Cross-Links, Mermaid.
- `npm run build -w @pokekon/docs` grün; `docs.yml` baut + deployt (manueller Pages-Source-Schritt: bereits "GitHub Actions" laut User).
- Root `npm run typecheck/lint/test` bleiben grün (apps/docs ohne lint/test-Script → via `--if-present` übersprungen; `build` baut Docs mit).
- Keine bezahlten Dienste, kein LLM im CI.
