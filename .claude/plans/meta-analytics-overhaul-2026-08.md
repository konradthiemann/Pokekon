# Ablaufplan — Meta-Analyse-Überarbeitung (2026-08)

> **Status:** Entwurf zur Freigabe · Stand 2026-08-04
> **Umfang:** 8 zusammenhängende Workstreams aus dem User-Briefing (Icons, Voll-Ingest,
> echte Matchup-Matrix, Tage-Bug, Deck-Detailansicht, Local-Meta-Empfehlung, Tipp-Redesign,
> Design/Mobile).
> **Grundregel (CLAUDE.md §2.1):** Jede Aussage unten ist mit `datei:zeile` belegt oder
> ausdrücklich als ⚠️ Hypothese / ❌ zu verifizieren markiert.

---

## 0. Kernerkenntnisse aus der Code- & API-Analyse

Fünf Erkundungs-Agenten + drei Live-API-Prüfungen an `play.limitlesstcg.com` haben ergeben:

| # | Erkenntnis | Beleg | Konsequenz |
|---|-----------|-------|-----------|
| K1 | **Limitless liefert Icons** pro Deck: `deck.icons: string[]` (z. B. `["grimmsnarl","froslass"]`) | Live-Probe `/api/tournaments/{id}/standings` | Icons datengetrieben ziehen statt hardcoded → fixt Festival Lead **und** Mega Excadrill in einem Zug |
| K2 | **`/pairings`-Endpoint existiert** & liefert Runde-für-Runde: `{round, phase, winner, player1, player2}` (`winner`=Username \| `0`=Tie \| `-1`=offen) | Live-Probe `/api/tournaments/{id}/pairings` | Echte Matchup-Matrix aus Online-Bo1-Matches berechenbar (Join Standings-`player`→`deck.id`) |
| K3 | Standings prunen Icons weg — nur `deck.id` + `deck.name` bleiben | `packages/shared/src/meta.ts:4-8`, `pruneDecklist` `:38-69` | Persistenz muss `icons` mitschreiben |
| K4 | Sync **kappt bei `maxTournaments=20`** (Default), `maxProbes=40`, Liste `limit=100` | `apps/api/src/jobs/syncMeta.ts:109,122,123,129` | „Alle Decks" ⇒ Cap heben + Delta-Ingest über mehrere Läufe |
| K5 | Matchup-Matrix kommt **extern von TrainerHill** (mixed Bo1/Bo3), **nicht** aus Turnierdaten — bewusste Entscheidung 2026-08 | `apps/api/src/jobs/importMatchups.ts`, memory `meta-online-bo1-focus` | ⚠️ **Richtungsänderung nötig** (siehe §1 Entscheidung D1) |
| K6 | Icons sind **100 % hardcoded**: `festival-lead → ['ogerpon-teal-mask']` (falsch), Mega Excadrill fehlt | `apps/web/src/components/shared/pokemonSprites.ts:35,59` | Fallback-Map bleibt, aber API-Icons haben Vorrang |
| K7 | Tage-Filter (`days`) technisch verdrahtet: `windowStartDays(days)` → `gte(tournaments.date, …)` | `apps/api/src/routes/meta.ts:54`, `apps/api/src/lib/timeWindow.ts:3-8` | Filter **existiert** — „tut nichts" ist wahrscheinlich Daten-Coverage (K4), nicht Filter-Bug → ❌ verifizieren |
| K8 | Tipps = **15 hartcodierte** `TECH_SUGGESTIONS` (Anzeigename→Karte), Begründung = i18n-Template, **kein** Datenbezug, **kein** LLM | `apps/web/src/hooks/useRecommendations.ts:25-45,185-207`; `de/recommendations.json:70-93` | „Random"-Gefühl bestätigt; Redesign daten-geerdet |
| K9 | „Archetyp-Slug"-Eingabe = **Freitext**, versteckt hinter Stift-Icon im DeckSwitcher — gehört zum *Deck-Vergleich*, **nicht** zu den Tipps | `apps/web/src/components/deck/DeckSwitcher.tsx:284-306` | Picker statt Freitext; zwei „Archetyp"-Konzepte entwirren |
| K10 | Deck-Detail existiert bereits (`ArchetypeDetail`) mit `ThreatsPanel` (gut/schlecht gewichtet) + Decklisten | `apps/web/src/components/meta/ArchetypeDetail.tsx`, `ThreatsPanel.tsx` | Detailansicht **erweitern**, nicht neu bauen |
| K11 | Local-Meta-Prediction existiert (`PredictionPanel`): rankt Decks per `computeFieldScores` gegen lokales Feld (= Top 1/2/3) | `apps/web/src/components/meta/PredictionPanel.tsx`, `packages/shared/src/fieldWinRate.ts:70-147` | „Beste Liste gegen Local Meta" **großteils vorhanden** — sichtbarer machen + „Deck→Top-Listen" ergänzen |

**Wichtigste Folge:** Der Großteil ist **Erweiterung + Bugfix + Redesign**, nicht Greenfield.
Die einzige echte Neu-Architektur ist die **eigene Matchup-Matrix aus `/pairings`** (K2) — und die
ist dank vorhandener Endpoints gut machbar.

---

## 1. Zu treffende Entscheidungen (blockierend)

> **✅ Entschieden (2026-08, vom User):** **D1 = Option A** (eigene Online-Bo1-Matrix aus `/pairings`
> + TrainerHill als gekennzeichneter Fallback) · **D2 = komplett, Phase für Phase**.
> **Umsetzungsstand:** Phasen 0–4 umgesetzt & grün (typecheck/lint/test über shared+api+web);
> Phase 5 (Doku/Memory/Gates) läuft. Preview-Verifikation gegen die *alte* lokale Proxy-API →
> UI rendert + degradiert sauber; die neuen Daten-Features erscheinen nach dem API-Deploy.

### D1 — Datenquelle der Win/Loss-Matchups *(muss der User entscheiden)*
Der Wunsch („Win/Loss ermitteln, indem der Archetyp gegen andere Decks antritt, mit allen Decks
der Online-Meta") widerspricht der **dokumentierten Entscheidung K5** („bei TrainerHill bleiben").
Der `/pairings`-Weg (K2) war 2026-08 nicht bekannt. Optionen:

- **(A, empfohlen) Eigene Online-Bo1-Matrix aus `/pairings`** + TrainerHill als **gekennzeichneter Fallback**
  bei dünner Coverage. Beste Passung zum Local-Bo1-Fokus, echte Daten, tag-fensterbar.
- **(B) Nur eigene Matrix**, TrainerHill ganz raus. Schlanker, aber Cold-Start/Coverage-Lücken sichtbar.
- **(C) Bei TrainerHill bleiben** (Entscheidung nicht umkehren). Kein `/pairings`, Win/Loss-Wunsch bleibt Näherung.

### D2 — Umfang/Reihenfolge dieses Durchlaufs
8 Workstreams sind zu groß für einen einzigen grünen Durchlauf. Vorschlag: Phasen 0→4 der Reihe nach,
Quick Wins (Icons, Detail-Matchup-Tabelle) früh sichtbar. Der User bestätigt Priorität/Reihenfolge.

---

## 2. Phasenplan

### Phase 0 — Daten-Fundament (Backend/Sync)  · *löst „alle Decks", Icons-Daten, Matchup-Rohdaten*

**0.1 Voll-Ingest aller Online-Bo1-Turniere (K4)**
- `syncMeta.ts`: `maxTournaments`/`maxProbes` deutlich anheben bzw. entkoppeln; Liste ggf. paginieren
  (Limitless `limit` > 100 prüfen, sonst über `date`-Cursor blättern). `apps/api/src/jobs/syncMeta.ts:109,122,123,129`
- **Delta-Ingest Ebene 1:** Turniere, deren `id` bereits in `tournaments` liegt und `fetchedAt` gesetzt ist,
  überspringen (kein `/details`/`/standings` erneut). ⇒ pro Lauf nur **neue** Turniere, Kosten gedeckelt,
  Coverage wächst über Läufe. `persistTournament` `:59-102`
- Ergebnis: Historie akkumuliert → Tag-Fenster (Phase 1/D-Bug) wird endlich wirksam.

**0.2 Icons persistieren (K1/K3)**
- `pruneDecklist`/Standings-Mapping um `icons: string[]` erweitern. `packages/shared/src/meta.ts:4-8,38-69`
- Schema: `tournament_standings.icons jsonb` **oder** (schlanker) `meta_snapshots`/Archetyp-Ebene ein
  `icons`-Feld, da Icons pro Archetyp konstant sind. `apps/api/src/db/schema.ts:237-317`
- Drizzle-Migration generieren (`db:generate`).

**0.3 Echte Matchup-Matrix aus `/pairings` (K2) — nur bei D1=A/B**
- Neuer Sync-Schritt: pro Turnier `/api/tournaments/{id}/pairings` holen.
- **Delta-Ingest Ebene 2:** `tournaments.pairings_synced_at` (nullable). Nur Turniere ohne diesen Stempel
  verarbeiten (abgeschlossene Turniere sind immutabel ⇒ echtes Delta).
- Auflösen: `player1`/`player2`/`winner` (Username) → Archetyp über Standings-`player`→`deck.id`.
  `winner=0`→Tie, `winner=-1`→ignorieren.
- Aggregieren pro Turnier in neue Tabelle **`tournament_matchups (tournamentId, date, deckA, deckB,
  winsA, winsB, ties)`** (kanonisch `deckA<deckB`). Lesezeit summiert über Tag-Fenster → **tag-fensterbare,
  richtungsabhängige WR** (etwas, das TrainerHill nie konnte).
- Bündeln in `packages/shared` (`computeMatchupsFromPairings`) mit Unit-Tests.

**Gates Phase 0:** `typecheck`/`lint`/`test` grün · Migration eingecheckt · Sync idempotent · `security-agent`
für neuen externen Fetch (`/pairings`) + Username-Mapping (kein Injection/Trust-Issue).

---

### Phase 1 — Analyse-API  · *löst Tage-Bug, macht Matrix nutzbar, Icons an die API*

**1.1 Tage-Bug diagnostizieren & fixen (K7) — ❌ zuerst verifizieren, dann fixen**
- Reproduktion: `/api/meta/field-analysis?days=7` vs `?days=60` gegen echte DB vergleichen.
- Hypothesen: (a) Coverage — nach Phase 0.1 behoben; (b) Overview-Seite liest **wochenbasierte**
  `metaSnapshots` (tagesunabhängig) statt Field-Analysis. `docs/features.md` §1 vs §15.
- Fix je nach Befund: Filter korrigieren **oder** Overview an Field-Analysis koppeln **oder** klarstellen,
  welche Ansicht tag-fenstert. Kein „Fix" ohne belegte Ursache.

**1.2 Matchup-API auf eigene Quelle umstellen (D1=A/B)**
- `GET /api/matchups` um `source`/Tag-Fenster erweitern; Field-Score (`fieldWinRate.ts`) liest eigene Matrix.
  `apps/api/src/routes/meta.ts`, `packages/shared/src/fieldWinRate.ts`
- Coverage/Fallback-Kennzeichnung im Response (welche Zellen aus Online-Bo1 vs TrainerHill vs unbekannt).

**1.3 Icons an Field-Analysis/Archetyp-Endpoints durchreichen (K1)**
- `archetypeId` + `icons` in `/api/meta/field-analysis` & `/archetypes/:id/analysis`. `meta.ts:191-205`

**Gates Phase 1:** wie Phase 0 · API-Verträge (Zod) aktualisiert · Tage-Bug mit Vorher/Nachher belegt.

---

### Phase 2 — Meta-UI: Analyse-Detail + Icons + Design  · *löst Detailansicht, Icons-Render, Mobile/Design*

**2.1 Datengetriebene Icons (K1/K6)**
- `PokemonIcon` bekommt optionales `icons?: string[]`; wenn gesetzt → direkt rendern, sonst
  Hardcoded-Map als Fallback. `apps/web/src/components/shared/PokemonIcon.tsx:44,66`
- Fallback-Map trotzdem korrigieren: Festival Lead richtig, `mega-excadrill` ergänzen. `pokemonSprites.ts:35,59`
  (Sprite-Dateiname gegen `raw.githubusercontent.com/.../regular/<name>.png` verifizieren.)

**2.2 Archetyp-Detail: echte Matchup-Tabelle (K10)**
- In `ArchetypeDetail` unter den KPIs eine **sortierbare Matchup-Tabelle** „dieser Archetyp vs. Feld":
  Gegner-Archetyp (mit Icon), WR, Bilanz (S-N-U), Sample-Größe, Farbcodierung — Quelle = eigene Matrix.
  Reuse `WinRateBadge`, `winRateColor`, Zeilenlogik aus `MatchupMatrix.tsx`.
- Klare Trennung „gute/schlechte Matchups" (WR-Sortierung, Schwellen 45/55 %). Decklisten wie bisher darunter.

**2.3 Design-Pass „analytisch/finanz/kantiger" + Mobile (User-Wunsch)**
- Tokens evolvieren: kleinerer Radius (`rounded-2xl`→`rounded-lg/md`), **`tabular-nums`** + ggf. Mono für
  Zahlen, dichtere Tabellen, kräftigere Trennlinien. `index.css:5-12,49-106`, `tailwind.config.js:19-40`
- Mobile-first: Matchup-Tabelle auf Mobile als gestapelte Zeilen/Cards; `overflow-x-auto` beibehalten,
  Zahlenspalten rechtsbündig, Sticky-Header. `docs/design-system.md` gegenprüfen (WCAG-AA halten).
- `ui-ux-agent` für Konsistenz-Review.

**Gates Phase 2:** Preview-Verifikation (Desktop + Mobile-Resize) · WCAG-AA gehalten · Screenshots als Beleg.

---

### Phase 3 — Local-Meta-Empfehlung  · *löst „beste Liste gegen Local Meta"*

**3.1 Top-1/2/3-Decks gegen Local Meta sichtbar machen (K11)**
- `PredictionPanel`-Ranking prominent als „Beste Decks gegen dein lokales Meta" heraus­stellen.
- Zwei Modi (User-Wunsch): (i) globale Top-1/2/3-Rangliste vs. Feld; (ii) Deck wählen → dessen
  beste **Decklisten** gegen das Feld (Join Field-Score + `tournament_standings.decklist` via
  `/api/meta/archetypes/:id/lists`). `apps/web/src/lib/api.ts:534-545`

**Gates Phase 3:** grün · Cold-Start (leeres Local Meta) sauber · Coverage/Näherung gekennzeichnet.

---

### Phase 4 — Tipp-Redesign  · *löst „Slug-Menü fehlt" + „Tipps random/ungeerdet"*

**4.1 Archetyp-Picker statt Freitext (K9)**
- Dropdown aus `KNOWN_ARCHETYPES` + aktuellen Meta-Archetypen überall dort, wo heute Freitext steht
  (AddLogModal, LocalMetaPanel, Deck-Slug). Kein Vertippen, kein Slug-Raten.
  `constants/archetypes.ts`, `AddLogModal.tsx`, `LocalMetaPanel.tsx`, `DeckSwitcher.tsx:284-306`

**4.2 Tipps daten-erden (K8) — adressiert die „woher nimmt die App die Annahme?"-Kritik**
- Hartcodierte `TECH_SUGGESTIONS`-Behauptungen ersetzen/ergänzen durch **belegbare** Logik:
  - Tech-Karten aus **erfolgreichen Anti-X-Listen** ableiten (Inklusionsrate in gut platzierten Listen
    gegen Archetyp X, aus `tournament_standings.decklist`) statt aus Meinung.
  - Jeden Tipp **kennzeichnen**: „datenbelegt (n=…)" vs. „Heuristik". Wo keine Datenbasis existiert,
    Behauptung **weglassen** statt erfinden (z. B. den strittigen „Early-Disrupt gegen Dragapult"-Claim
    nur zeigen, wenn Daten ihn stützen).
  - Anti-Halluzination sinngemäß wie in `battleLogAnalysis` (CLAUDE.md §2.6): keine unbelegten Aussagen.

**Gates Phase 4:** grün · `security-agent` (neuer User-Input via Picker) · Tipps ohne Datenbasis klar als Heuristik markiert.

---

### Phase 5 — Doku & Abschluss
- `docs/features.md` (§2 Sync-Cap/Delta, §13 Matrix-Quelle, §15 Detail-Matchup-Tabelle, §16 Empfehlung),
  `docs/architecture.md`, `docs/design-system.md` nachziehen (CLAUDE.md §2.7).
- Memory aktualisieren: `meta-online-bo1-focus` (Matrix-Quelle bei D1=A/B umgekehrt), neue Delta-Import-Notiz.
- Volle Gate-Prüfung `typecheck`/`lint`/`test`.

---

## 3. Risiken & offene Verifikationen

- ❌ **Limitless-Ratelimit/Blockierung** bei Voll-Ingest + `/pairings` (deutlich mehr Calls). Mitigation:
  Delta-Ingest, sequentiell mit Backoff, serverseitig (kein CORS-Proxy).
- ❌ **Username-Join Standings↔Pairings** unvollständig (Drops, Namensabweichungen). Verifizieren an echtem
  Turnier; unauflösbare Paarungen zählen nicht mit (Coverage ausweisen).
- ⚠️ **Tage-Bug-Ursache** (Coverage vs. Filter) erst nach Phase 0 belegbar — kein Fix ohne Reproduktion.
- ⚠️ **`limit>100`** auf dem Listen-Endpoint unbestätigt — ggf. `date`-Cursor-Pagination.
- ⚠️ **Design-Umfang** (kantiger/finanz) kann viele Komponenten berühren; auf Meta-Bereich fokussieren,
  globale Tokens vorsichtig ändern (WCAG-AA nicht brechen).

## 4. Quality-Gates (jede Phase, CLAUDE.md §4)
Betroffene Dateien gelesen · `typecheck` grün · `lint`/Prettier grün · `test` grün (neue Logik getestet) ·
keine Secrets/kostenpflichtigen Dienste · Cold-/Empty-State bedacht · Doku aktualisiert ·
bei neuem Input/externem Call `security-agent`.
