# Plan: Demo-Modus — anonymer Gast-Login + geseedete Meta-Daten + KI ohne fremde Token

**Stand:** 2026-06-24 · **Branch-Vorschlag:** `feat/demo-mode`
**Entscheidungen (vom User bestätigt):** anonymer Gast-Account (better-auth `anonymous`-Plugin) · vorgefertigte KI-Analysen + optional eigener Token nur im localStorage.

---

## Ziel

Ein **„Demo testen"-Button** auf dem WelcomeScreen, der ohne Registrierung in die App führt. Der Gast bekommt automatisch eine eigene Sandbox mit **mehreren Meta-Decks**, **dokumentierten + simulierten Matches** (echte deutsche Battle-Logs) und **vorgefertigten KI-Analysen**, sodass die **Vorschlagsfunktion** (`useRecommendations`) und die **Battle-Log-Analyse** sofort vorführbar sind — **ohne** dass dabei der Anthropic/GitHub-Models-Token des Eigentümers verbraucht wird.

---

## Belegte Fakten (Code gelesen)

- **Kein Gast-Login:** `user`-Tabelle hat kein `isAnonymous` (`apps/api/src/db/schema.ts:17-28`). App gated alles hinter Session (`App.tsx:77-102`); Backend 401t jede `/api`-Route außer `/api/auth/*` (`middleware/session.ts`).
- **Vorschläge sind rein heuristisch, kein LLM** (`hooks/useRecommendations.ts`). Trigger:
  - Versionsvergleich: `deckSnapshots.length >= 2 && opponentLogs.length >= 4`, WR-Swing ≥15 auf Archetyp mit ≥3 Encounters (`:121-183`).
  - Tech-Vorschlag: `winRate <= 50 && encounters >= 5` und Tech-Karte nicht im Deck (`:186-207`). Keys sind **Anzeigenamen** (`"Dragapult ex"`).
  - Zero-Win / Blind-Spot / Boss / Balls (`:209-281`).
  - Gesamt-Decline: `deckSnapshots >= 2 && opponentLogs >= 6` (`:284-326`).
  - Battle-Log-Performance (Low-Play-Rate, WR-Outlier, Turn-1, Brick, Prize-dominated, Tempo): `deckStats.totalGamesAnalyzed >= 3` (`:364-476`).
- **`archetypeStats[].archetype === opponentLog.archetype`** (`db/queries.ts:238-239`). → Demo muss Archetyp als **Anzeigename** aus `constants/archetypes.ts` speichern, nicht als Slug.
- **KI = GitHub Models** (gpt-4.1), Key server-seitig verschlüsselt pro User (`routes/analysis.ts`, `userAiSettings`). Analyse persistiert als JSON in `opponentLogs.analysis`.
- **Analyse-Validierung strikt:** jede `evidence` muss in den ersten 60 Zeichen wörtlich im Log stehen (`battleAnalysis.ts:70-74`, `validateAnalysis` :159-169).
- **Parse-on-Write:** `POST /api/logs` ruft `syncParsedLog()` → `match_log_parsed` (`routes/logs.ts`, `lib/matchLogPipeline.ts`). Parser ist deutsch & formatsensibel (`Zug von `-Blöcke, `• `-Bullets, exakte Verben — `battleLogParser.ts`).
- **Vorhandenes Seed-Skript** (`scripts/seed-test-matches.mjs`) läuft von außen über die API mit Test-Account; es speichert **Slugs** als Archetyp → für Tech-Vorschläge ungeeignet, dient nur als Vorlage.

---

## Umsetzung

### Teil 1 — Backend: anonymer Gast-Login
1. **Schema:** `isAnonymous: boolean('is_anonymous').default(false).notNull()` in `user` (`schema.ts`). Drizzle-Migration generieren (`npm run db:generate` o.ä. — Befehl verifizieren) + lokal anwenden.
2. **auth.ts:** `anonymous()`-Plugin aus `better-auth/plugins` zur `plugins`-Liste hinzufügen. (Kein neuer Dependency — Teil von `better-auth`.) Optional `onLinkAccount` (s. Risiken).
3. **authClient.ts:** `anonymousClient()` aus `better-auth/client/plugins` registrieren → `authClient.signIn.anonymous()` verfügbar.

### Teil 2 — Backend: In-Process Demo-Seed
4. **`apps/api/src/lib/demoSeed.ts` → `seedDemoData(db, userId)`** (idempotent: no-op wenn User schon Decks hat). Erzeugt:
   - **2 Decks (aktuelle Mega-Meta, aus dem User-Beispiel):**
     - Deck A *„Mega-Kangama-ex / Ogerpon-Toolbox"* (gtmap-Deck) — volle `deckCards`-Liste. **Boss's Orders bewusst weglassen** → triggert Boss-Vorschlag.
     - Deck B *„N's Zoroark ex"* (Premiox-Deck) — volle Liste, mit Ball-Suche → andere Rec-Mischung.
   - **2 DeckSnapshots für Deck A:** `„v1 – League Cup"` und `„v2 – Regional Build"` (jsonb `SnapshotCard[]`, `totalCards`).
   - **~18 opponentLogs** (Archetyp = **Anzeigename**), so verteilt, dass alle Trigger feuern:
     - **6–8 mit vollem Battle-Log** (deutsch, Mega-Meta) → geparst via `syncParsedLog` → `deckStats.totalGamesAnalyzed >= 3`. Davon je nach Snapshot getaggt (`deckSnapshotId`) für den Versionsvergleich (WR-Swing ≥15).
     - **~10 reine Ergebnis-Logs** (ohne `battleLog`) zum Auffüllen der Encounter-Zähler: u. a. **≥5× vs. ein Bad-Matchup** das in `TECH_SUGGESTIONS` **und** `KNOWN_ARCHETYPES` ist (Kandidaten: `"Dragapult ex"`→Eri, `"Mega Venusaur"`→Briar, `"Raging Bolt Ogerpon"`→Hero's Cape) mit ≤50% WR.
   - Pro geloggtem Match ein **vorgefertigtes `BattleAnalysis`-JSON** in `analysis` (jede `evidence` = wörtliche Logzeile).
5. **Route `POST /api/demo/seed`** (hinter `sessionMiddleware`): nur für `isAnonymous`-User (sonst no-op/403), ruft `seedDemoData`. In `app.ts` registrieren.

### Teil 3 — Frontend: Demo-Flow
6. **WelcomeScreen.tsx:** Button *„Ohne Anmeldung testen (Demo)"* → `signIn.anonymous()` → `api.seedDemo()` (`POST /api/demo/seed`) → `dashboardStore.refresh()`. Lade-/Fehlerzustand.
7. **Demo-Banner:** kleine Komponente, sichtbar wenn `session.user.isAnonymous` — Hinweis „Demo-Modus, Daten gehen bei Account-Erstellung verloren" + CTA „Account erstellen" (öffnet AuthModal).

### Teil 4 — KI in der Demo
8. **Vorgefertigt:** durch Teil 2 zeigen alle geloggten Demo-Matches sofort eine echte Analyse (0 Token).
9. **Optional eigener Token (nur localStorage):**
   - **Backend:** `analyzeLogSchema` + `POST /api/analysis/log` um **optionales** `apiKey` (+`provider`/`model`) im Body erweitern; wenn gesetzt → direkt verwenden, **nie speichern**; sonst bestehender Pfad (server-gespeicherter Key).
   - **Frontend:** im Demo-Modus schreibt das Token-Input in `localStorage` (`pokekon-demo-ai-token`); `analyzeBattleLogViaApi` hängt es an den Request-Body. Hinweistext „nur in deinem Browser, nicht auf dem Server".
   - Reguläre User bleiben unverändert auf dem server-gespeicherten Pfad.

### Teil 5 — Content + Verifikation
10. Battle-Logs mit aktuellen Mega-Meta-Karten verfassen (Basis: das User-Beispiel). Jede Datei: erkennbarer `… hat gewonnen!`, Prize-/Damage-Verlauf, ≥1 KO, `• `-Handkarten für zitierbare Evidence.
11. Pre-baked `BattleAnalysis` je Match — Evidence wörtlich.
12. **Verifikations-Test** (`*.test.ts` in `packages/shared` oder `apps/api`): `parseBattleLog` + `validateAnalysis` über jeden Seed-Match; Assert: `winner !== null`, `totalTurns > 0`, **kein** Analyse-Item wird verworfen (Evidence hält). Schützt vor Format-Drift.

### Teil 6 — Gates
13. `npm run typecheck`, `npm run lint`, `npm run test` grün. Migration lokal angewandt. Kurzer Doku-Eintrag (Demo-Modus) in `docs/`.

---

## Risiken / offene Punkte (explizit)

- ⚠️ **Account-Linking:** better-auth `anonymous` löscht per Default den Gast-User beim Sign-up → Demo-Daten weg. Für Demo akzeptabel; optional `onLinkAccount` zum Migrieren. **Banner kommuniziert das.**
- ⚠️ **Anon-User-Akkumulation** in Postgres (Free-Tier). Follow-up: Cleanup-Cron für alte anonyme User ohne Aktivität. Nicht blockierend.
- ⚠️ **Archetyp-Format**: AddLogModal-Speicherformat (Anzeigename vs. Slug) bei Implementierung final verifizieren; TECH_SUGGESTIONS-Kommentar sagt Anzeigename.
- ✅ Keine kostenpflichtigen Deps. better-auth-Plugins sind enthalten. Free-Tier bleibt.

---

## Reihenfolge der PRs (Vorschlag)
1. Schema+Auth (Teil 1) → 2. Seed-Modul+Route+Content (Teil 2+5) → 3. Frontend-Button+Banner (Teil 3) → 4. Optionaler Demo-Token (Teil 4 Punkt 9).
