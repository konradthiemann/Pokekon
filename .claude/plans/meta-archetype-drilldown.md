# Plan: Archetyp-Drilldown im Meta-Tab — Turnier-Decklisten & Feld-Performance-Score

> Stand: 2026-07-08 · Feature-Anfrage: Deck im Turniermeta-Tab auswählen → erfolgreichste
> Decklisten sehen (nachladbar) → USP: welcher Archetyp ist gegen das aktuelle Feld am
> performantesten (Meta-Anteil × Erfolgsrate kombiniert).

## Entscheidungen (vom User bestätigt, 2026-07-08)

1. **Varianten = Archetyp-Ebene** (Limitless-Archetypen wie „Dragapult Dusknoir" sind die
   Vergleichseinheit; kein Build-Clustering innerhalb eines Archetyps).
2. **Score = meta-gewichtete Feld-Win-Rate** (Plan §3.4):
   `FieldWR(A) = Σ_B share(B) × MatchupWR(A vs B)`, Mirror zählt mit 50 %,
   normalisiert über die abgedeckte Share-Summe; Coverage wird transparent ausgewiesen.
3. **Server persistiert Rohdaten** (Plan §5.2): neue Tabellen `tournaments` +
   `tournament_standings` (inkl. `decklist` jsonb); Sync-Job schreibt sie.
4. **UI = Drilldown** im Meta-Tab (Zustand-basiert, kein Router).

## Belegte Fakten (Code gelesen)

- Limitless-Standings liefern `deck {id,name}`, `placing`, `record`, `decklist`
  (apps/web/src/lib/deckComparison.ts:84-93) — Decklisten sind verfügbar, `decklist` optional.
- TrainerHill-CSV (apps/web/public/matchup-matrix.csv) nutzt **dieselben Slugs** wie
  Limitless `deck.id` (z. B. `n-zoroark`, `dragapult-dusknoir`) → direktes Matching.
- `meta_snapshots` speichert nur den Display-Namen, **keinen Slug** → Spalte `archetype_id`
  ergänzen (nullable für Altdaten; Sync-Upsert füllt sie nach).
- Alle `/api/*`-Routen laufen hinter `sessionMiddleware` (apps/api/src/app.ts:47-60).
- API-Tests: PGlite + echte Drizzle-Migrationen + `x-test-user`-Seam (api.test.ts).
- Zeitfenster-Muster: `weeks 1..4`-zod-Schema + `windowCutoff()` (routes/analytics.ts).
- MatchupMatrix lädt heute statisches CSV aus /public → wird auf `GET /api/matchups`
  umgestellt (sonst Datendoppelung, CLAUDE.md Regel 4).

## Umsetzung

### A. packages/shared
- `fieldWinRate.ts` (neu, pure): Typen `MatchupCell`, `ArchetypeShare`,
  `computeFieldScores(shares, matchups, {minGamesPerPair=10})` →
  pro Archetyp: `fieldWinRatePct`, `coveragePct`, `mirrorSharePct`,
  `threats[]` (share × (50−WR), nur WR<50), `freeWins[]` (share × (WR−50), nur WR>50),
  Fallback-Kennzeichnung wenn keine Matchup-Daten. Tests daneben.
- `meta.ts`: `StandingLite` + `computeMetaSnapshots` um `archetypeId` (deck.id) erweitern;
  `MetaSnapshotData.archetypeId` ergänzen. Tests anpassen.
- `isLikelyOnline`-Heuristik aus apps/web/src/lib/metaFetch.ts nach shared ziehen
  (Sync-Job braucht sie für `tournaments.is_online`); Web re-importiert aus shared.

### B. apps/api — Schema (Migration 0005)
- `tournaments`: `id` text PK (Limitless-ID), `name`, `date` timestamptz, `players` int,
  `format` text, `isOnline` bool, `fetchedAt` timestamptz default now. Index auf `date`.
- `tournament_standings`: serial PK, `tournamentId` FK→tournaments cascade,
  `archetypeId` text, `archetypeName` text, `playerName` text null, `placing` int null,
  `wins/losses/ties` int, `decklist` jsonb null (`{pokemon|trainer|energy: [{name,count,set?,number?}]}`,
  beim Ingest auf bekannte Felder reduziert). Indizes: `(archetypeId)`, `(tournamentId)`.
- `matchup_matrix`: serial PK, `deck1`, `deck2`, `wins`, `losses`, `ties`, `total`,
  `winRate` real, `importedAt` timestamptz — Batch = gleiche `importedAt`; Index `(deck1, deck2)`.
- `meta_snapshots`: + `archetypeId` text null; Sync-Upsert setzt sie auch im Update-Pfad.

### C. apps/api — Jobs & Routen
- `jobs/syncMeta.ts`: Standings-Typ um `name`, `placing`, `decklist` erweitern; pro
  Turnier upsert `tournaments` + delete/insert `tournament_standings`; Aggregation wie
  bisher (jetzt mit archetypeId). Defaults unverändert (7 Tage, ≥30 Spieler, max 6 Turniere).
- CSV-Quelle wandert nach `apps/api/data/matchup-matrix.csv` (aus /public verschoben).
- `jobs/importMatchups.ts`: CSV → validierte Zeilen → Insert als neuer Batch.
- Routen (alle session-guarded, zod-validiert):
  - `GET /api/matchups` → neuester Batch (+`importedAt`); **lazy seed**: Tabelle leer →
    gebündelte CSV importieren (kein Ops-Schritt beim Deploy nötig).
  - `POST /api/matchups/import` (text/csv Body, strikt validiert) → neuer Batch.
  - `GET /api/meta/field-analysis?weeks=1..4` → pro Archetyp (aus tournament_standings im
    Fenster): share, turnierWR, playerCount, fieldWinRatePct, coveragePct, rank.
  - `GET /api/meta/archetypes/:archetypeId/lists?weeks&limit(≤20,default 4)&offset` →
    nur Standings mit Decklist, Sortierung: placing-Perzentil asc → players desc → date desc;
    Antwort mit `total` für „mehr laden".
  - `GET /api/meta/archetypes/:archetypeId/analysis?weeks` → Detail: Kennzahlen + Feld-Score
    + threats/freeWins/mirrorShare + Trend über ISO-Wochen (aus meta_snapshots).
- Cold-Start: leere Standings → leere Antworten mit klaren Empty-States im UI
  („erst Sync Live Meta ausführen"). Altdaten ohne archetypeId → Zeile nicht klickbar.

### D. apps/web
- `lib/api.ts`: `getMatchups`, `importMatchups`, `getFieldAnalysis`, `getArchetypeLists`,
  `getArchetypeAnalysis` + Wire-Typen.
- `MetaPage`: lokaler Drilldown-State `selected: {archetypeId, name} | null`;
  MetaTable-Zeilen klickbar (nur mit archetypeId), neue sortierbare Spalte „Feld-Score"
  (Daten aus field-analysis, gemergt über archetypeId; „—" ohne Daten).
- Neue Komponenten `components/meta/`:
  - `ArchetypeDetail.tsx` — Header (Sprites, Share, WR, Spieler), Zeitfenster 1–4 Wochen,
    Zurück-Button, Sektionen.
  - `FieldScorePanel.tsx` — Score + Rang + Coverage + Mirror-Share + Erklärung.
  - `ThreatsPanel.tsx` — „Darauf musst du vorbereitet sein": gewichtete Gefahren
    (share × Matchup-Schwäche) und Free Wins.
  - `DecklistCard.tsx` — Platzierung, Turnier, Record, Spieler; Karten gruppiert
    (Pokémon/Trainer/Energie) mit Anzahl; Link zum Turnier-Standing.
  - „Mehr Listen laden" via offset-Pagination (4er-Schritte).
- `MatchupMatrix.tsx`: Datenquelle `GET /api/matchups` statt /public-CSV; Datum aus
  `importedAt`; /public/matchup-matrix.csv entfällt.
- i18n: `meta.json` de **und** en ergänzen.

### E. Gates, Reviews, Doku
- `npm run typecheck && npm run lint && npm run test` (workspace-weit) grün.
- `code-review-agent` (neuer Code) + `security-agent` (neue externe Datenpfade:
  Decklist-Ingest, CSV-Import-Route, Rendering externer Kartennamen).
- Doku: `docs/backend-evolution-plan.md` Status (§5.2 Tabellen ✓, §6.1 matchups/field-WR ✓),
  betroffene docs/-Seiten; keine ungefragten neuen READMEs.

## Score-Semantik (transparent im UI erklärt)

- Matchup-Paare mit `total < 10` Spielen gelten als „nicht belastbar" → zählen nicht zur
  Coverage (wie MIN_GAMES_FOR_COLOR in der Matrix).
- `fieldWinRatePct` normalisiert über abgedeckte Shares; `coveragePct < 40` ⇒ UI-Badge
  „geringe Datenbasis".
- Threat-Score(B) = share(B) × (50 − WR(A vs B)) für WR < 50 — „häufig UND schlecht für dich".
- Kein LLM beteiligt; reine Arithmetik aus Turnierdaten (Anti-Halluzination irrelevant).
