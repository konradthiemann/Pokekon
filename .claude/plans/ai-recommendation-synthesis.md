# Plan — Spec 8: KI-Textsynthese über strukturierten Analyseergebnissen

> **Bindende Grundlage:** [`specs/ai-recommendation-synthesis.md`](../../specs/ai-recommendation-synthesis.md).
> Kontext: Teil 8 von 9 aus [`specs/deck-improvement-hub-vision.md`](../../specs/deck-improvement-hub-vision.md).
> **Baut auf Spec 3, 5, 6 und 7 auf** (alle in `main`): `packages/shared/src/wilsonInterval.ts`,
> `packages/shared/src/cardPerformance.ts`, `packages/shared/src/nashEquilibrium.ts`,
> `apps/web/src/components/deck/DeckTipsSection.tsx`.
> **Branch:** `feat/ai-recommendation-synthesis`, abzweigen von `main` (`7d2a2bf`).
> Vorgehen: Zwei-Agenten-TDD (`tester` → `implementer`) nach `~/.claude/rules/tdd.md`,
> Scheibe für Scheibe in der Reihenfolge aus §4.
> **Architektur-Voraussetzung gelesen** (CLAUDE.md §1): `docs/backend-evolution-plan.md` §6.3
> — dieses Feature ist dort wörtlich als **Phase B** vorgesehen ("LLM bekommt nicht einen Log,
> sondern die aggregierten Kennzahlen", `:269`).

---

## 0. Belegte Fakten (gelesen, `datei:zeile`, Stand `main` = `7d2a2bf`)

Alles hier ist aus dem Code gelesen. Wo etwas nicht belegt werden konnte, steht
**Vermutung** oder **Unbekannt** (CLAUDE.md §2.1).

### 0.1 Die drei bindenden Entscheidungen der Spec

`specs/ai-recommendation-synthesis.md:76-93` ("Offene Fragen (entschieden, 2026-09-03)",
auf `main` gemergt mit `7d2a2bf`):

1. **Auslöser:** nutzergetriggert per Button, kein Auto-Lauf beim Seitenaufruf.
2. **Caching:** Text wird wiederverwendet, bis sich die zugrunde liegenden Zahlen ändern.
   *Die Invalidierungs-Mechanik ist ausdrücklich Teil dieses Plans, nicht der Spec.*
3. **Validierungstiefe:** strukturell **+ Richtung** (Vorzeichen der Aussage muss zum
   Vorzeichen der referenzierten Zahl passen).

### 0.2 Die bestehende KI-Integration (wird erweitert, nicht dupliziert)

- `apps/api/src/ai/provider.ts:4-16` — `AnalysisInput { log, playerName }` und
  `AnalysisProvider { analyze(input): Promise<BattleAnalysis> }`. `:19-29` `AnalysisError`
  mit `status`/`detail`.
- `apps/api/src/ai/index.ts:13-23` — `getAnalysisProvider(provider, { apiKey, model })`,
  `switch` über `AiProvider`; **einziger** Auflösungspunkt.
- `apps/api/src/ai/githubModels.ts:10-12` — `ENDPOINT`, `API_VERSION = '2026-03-10'`,
  `DEFAULT_MODEL = 'openai/gpt-4.1'`. `:41-51` — `temperature: 0`, `max_tokens: 4096`,
  `response_format: { type: 'json_object' }`. `:56-62` — 401/403/429 werden durchgereicht,
  alles andere 502. `:69` `JSON.parse(stripJsonFences(...))`, `:75` `validateAnalysis`.
  **Der HTTP-Aufruf steckt heute inline in `analyze` und ist noch nicht wiederverwendbar.**
- `packages/shared/src/battleAnalysis.ts:159-169` — `validateAnalysis(analysis, log)` filtert
  jedes Item ohne auffindbares Zitat; `:70-74` `evidenceExistsInLog` (60-Zeichen-Präfix,
  Whitespace normalisiert); `:172-178` `stripJsonFences` (wiederverwendbar).
- `apps/api/src/routes/analysis.ts:78-130` — `POST /api/analysis/log`: Zod-Validierung
  (`analyzeLogSchema`), **ephemerer** `body.apiKey` (einmal genutzt, nie gespeichert), sonst
  `user_ai_settings.encryptedApiKey` → `decryptSecret` (`:109`), Fehler-Mapping `:125-128`.
  **Kein Rate-Limit auf dieser Route** — `rateLimit` existiert (`apps/api/src/lib/rateLimit.ts:13`)
  und wird bisher nur von `POST /api/meta/sync` genutzt (`routes/meta.ts:320`).
- `apps/api/src/db/schema.ts:640-652` — `user_ai_settings` (PK `userId`, `provider` Enum
  `aiProviderValues`, `model`, `encryptedApiKey`). **Genau eine Schlüssel-Ablage** — das
  sechste AC verlangt, dass keine zweite entsteht.
- `apps/api/src/validation.ts:250-256` — `analyzeLogSchema` inkl. `apiKey: z.string().max(400)`.

### 0.3 Die Datenquellen, die als Input dienen

- **Field-Score (Spec 3):** `apps/api/src/routes/meta.ts:259-282` — `loadFieldScores(db, window)`
  liefert `{ window, scores, matchup }`; `scores` ist `FieldScore[]` aus
  `packages/shared/src/fieldWinRate.ts:107`. **Die Funktion ist heute `async function`, nicht
  exportiert** — sie muss exportiert werden (Präzedenz: `windowConditions` wurde in Spec 5
  genau so exportiert statt dupliziert, `meta.ts:74`).
  `FieldScore` (`fieldWinRate.ts:47-75`) trägt `fieldWinRatePct`, `fieldWinRateLowPct`,
  `fieldWinRateHighPct`, `coveragePct`, `mirrorSharePct`, `rank`, `threats[]`, `freeWins[]`.
  `WeightedMatchup` (`:30-44`) trägt `archetypeId`, `archetypeName`, `sharePct`, `winRatePct`,
  `games`, `weightPct`, `lowPct`, `highPct`, **`significant`** ("Band schließt 50 % aus").
- **Prognose-Deltas (Spec 5):** `apps/api/src/lib/cardStatsData.ts:18` — `loadCardStats(db,
  archetypeId, windowDays)` → `CardStatsBatch { windowDays, computedAt, listsAnalyzed, cards }`,
  `cards: ArchetypeCardStat[]` (`packages/shared/src/cardPerformance.ts:228-245`) mit
  `delta: CardPerformanceDelta | null` (`:113-137`, u. a. `deltaPp`, `lowPct`, `highPct`,
  `widthPct`, **`significant`**, `effectiveN`) und `tier: CardSignalTier` (`:210-226`).
  **Die "Mindest-Konfidenz" aus Spec 5 ist genau dieses Paar:** `tier !== 'insufficient'`
  (Band ≤ `MAX_USABLE_BAND_PP = 40`, `:40`) **und** `delta.significant`.
- **Gleichgewicht (Spec 6):** `apps/api/src/lib/equilibriumData.ts:54` — `loadEquilibrium(db,
  windowDays)` → `EquilibriumBatch { windowDays, computedAt, run, archetypes }`. Zeilen-Felder
  in `apps/api/src/db/schema.ts:530-576` bzw. `apps/web/src/lib/api.ts:687-711`:
  `weightPct`, `equilibriumPayoffPct`, `paradoxGapPp` (= `sharePct - weightPct`), `inSupport`,
  `excludedCertain`, `exclusionRatePct`, `fitnessDeltaPp`, `direction`
  (`'rising'|'falling'|'stable'|'unknown'`).
- **Fenster:** `apps/api/src/validation.ts:175` `CARD_STATS_WINDOWS = [7,14,21,28]`,
  `:211` `EQUILIBRIUM_WINDOWS = [7,14,21,28]`, `:189` `snapToWindow`, `:203`/`:223` die beiden
  Snapper. `META_WINDOW_DEFAULT_DAYS = 30` schnappt damit auf **28**.
  Web-Default: `apps/web/src/components/meta/metaWindow.ts:7` `META_DEFAULT_DAYS = 30`.

### 0.4 Wo der Trigger im UI sitzt (verifiziert, nicht angenommen)

- `apps/web/src/pages/DeckPage.tsx:174-178` — `SECTIONS = [{id:'deck'}, {id:'analytics'},
  {id:'tips', labelKey:'page.tabs.tips', Icon: Lightbulb}]`; `:313` rendert
  `{deckSection === 'tips' && <DeckTipsSection />}`.
- `apps/web/src/components/deck/DeckTipsSection.tsx:16-27` — props-frei, liest alles aus dem
  Store (`deckCards`, `archetypeStats`, `opponentLogs`, `deckSnapshots`, `localMeta`,
  `activeDeckId`, `cardStats`, `setActiveTab`). `:130` `<RecommendationsPanel …/>`,
  `:133-136` Trennlinie + `<DeckComparisonPanel />`.
- → **Der Trigger gehört genau hierher.** Die Prognosen/Empfehlungen, die der Text übersetzt,
  leben bereits in diesem Abschnitt; ein zweiter Ort wäre eine dritte Anlaufstelle für
  dieselbe Frage.
- `apps/web/src/store/dashboardStore.ts:83-84,157-158,409-430` — `cardStats`,
  `cardStatsSource`, `loadCardStats(archetypeSlug)` mit Request-Sequenz-Guard; `:67` `activeDeck`,
  `:91` `deckSection`. Muster für den neuen Store-State.
- Bestehender Test-Harness: `apps/web/src/components/deck/DeckTipsSection.test.tsx:31-50`
  mockt `useDashboardStore` mit einem flachen Objekt — **der neue State muss dort ergänzt
  werden, sonst brechen die bestehenden Tests** (`undefined` statt Wert).

### 0.5 Der Demo-Modus (Muster, dem gefolgt wird)

- `docs/demo-mode.md:50-59` — "Pre-baked analyses: every logged demo match ships with a stored
  `analysis` JSON (evidence-grounded), so the Match Detail → Analyse tab shows a real analysis
  with **zero** API calls" + optionaler eigener Token nur in `localStorage`.
- `apps/api/src/lib/demoSeed.ts:387-573` — fünf handgeschriebene `BattleAnalysis`-Konstanten
  (deutsch); `:900` werden sie als `JSON.stringify(match.analysis)` in `opponent_logs.analysis`
  geschrieben. `:785-793` `seedDemoData(db, userId)` ist idempotent über "besitzt schon ein Deck".
- `apps/api/src/lib/demoSeed.test.ts:26-42` — **jede** vorberechnete Analyse muss
  `validateAnalysis` unbeschadet überstehen, sonst schlägt der Build fehl. Genau dieses
  Schutzmuster bekommt die neue Synthese.
- `apps/api/src/routes/demo.ts:17-24` — nur `user.isAnonymous`.
- Demo-Decks: `demoSeed.ts:800-818` — `mega-kangaskhan-ex` (primär) und `n-zoroark`.
- `apps/web/src/lib/demo.ts:18` `DEMO_AI_TOKEN_KEY = 'pokekon-demo-ai-token'`;
  `apps/web/src/components/opponent/MatchDetailModal.tsx:332-375` — der komplette
  Demo-vs-Regulär-BYOK-Ablauf, dem der neue Panel folgt.

### 0.6 Infrastruktur

- Gates (Root `package.json:14-25`): `npm run typecheck`, `npm run lint`, `npm run test`
  (baut vorher `@pokekon/shared`).
- Migrationen: `apps/api/drizzle/0000…0014`; generieren mit
  `npm run db:generate -w @pokekon/api`. **Nächste Nummer: `0015`.**
- API-Test-Harness: `apps/api/src/api.test.ts:57-80` — PGlite + echte Migrations-SQL aus
  `drizzle/meta/_journal.json`, Sessions über `x-test-user`. LLM-Tests stubben `fetch`
  (`api.test.ts:1001-1024`: `vi.stubGlobal('fetch', fetchMock)`, danach Assertion auf URL und
  `Authorization: Bearer …`). **Das ist die Naht, an der die neue Route getestet wird.**
- Web-Tests: vitest + jsdom + Testing Library; reine Helfer-Tests als Präzedenz
  (`components/meta/confidence.test.ts`, `equilibriumFraming.test.ts`).
- i18n-Namespaces: `apps/web/src/i18n/locales/{de,en}/*.json` — `recommendations.json` ist der
  Namespace von `DeckTipsSection`.
- **`packages/shared` ist browserfähig** — es importiert nirgends `node:*`. Das bleibt so
  (§3.7: der Hash lebt deshalb in `apps/api`, nicht in `shared`).

---

## 1. Summary

Ein zweiter Analyse-Typ neben der Battle-Log-Analyse: statt eines Rohlogs bekommt das LLM eine
serverseitig zusammengestellte, geschlossene Liste von **Fakten** (Field-Score mit Band,
gewichtete Matchups, Karten-Deltas aus Spec 5, Gleichgewichts-Signale aus Spec 6) und schreibt
daraus kurze Sätze. Die Grounding-Mechanik ist bewusst **anders** als beim Log und dabei
schärfer:

- **(a) strukturell** — jede Aussage nennt genau eine `factId` aus der mitgelieferten Liste;
  gibt es sie nicht, fliegt die Aussage raus.
- **(b) Richtung** — jede Aussage deklariert `positive`/`negative`/`neutral` und muss zur
  **aus dem Konfidenzband abgeleiteten** Richtung der Zahl passen (zweite Spec-Entscheidung).
- **(c) keine Zahlen vom Modell** — das LLM schreibt Platzhalter (`{value}`, `{low}`, `{high}`,
  `{label}`), die der Server deterministisch aus dem Fakt füllt. Eine falsche Zahl im Text ist
  damit strukturell unmöglich statt nur unwahrscheinlich. Das ist **keine** Ausweitung der
  beschlossenen Prüftiefe, sondern ihre billigere und stärkere Form: der Fall "Zahl erfunden"
  entsteht gar nicht erst, statt hinterher geprüft werden zu müssen.
- **(d) Beweisschwelle** — eine Aussage vom Typ `recommendation` darf nur auf Fakten zeigen,
  die die Schwelle von Spec 3/5 selbst bestehen (`significant` bzw. `tier !== 'insufficient'`).
  Die KI-Schicht senkt den Standard nicht (viertes AC).

Der finale Text ist **keine zweite LLM-Ausgabe**, sondern die deterministische Montage der
überlebenden Sätze in feste Sektionen — die "JSON-strukturierte Zwischenausgabe vor dem finalen
Text" (zweites AC) ist damit wörtlich erfüllt, ohne einen zweiten Token-Aufruf.

Der Aufruf ist nutzergetriggert (Button im **Tipps**-Abschnitt von "Mein Deck", dem Ort aus
Spec 7, an dem Prognosen und Empfehlungen schon leben) und läuft über dieselbe
`AnalysisProvider`-Abstraktion und dieselbe BYOK-Schlüsselablage wie `POST /api/analysis/log`:
der GitHub-Models-Adapter bekommt eine zweite Methode und einen gemeinsamen privaten
`chatJson`-Aufruf, keine zweite Integration. Das Ergebnis wird zusammen mit dem
**Fakten-Schnappschuss**, aus dem es entstand, in einer neuen Tabelle `deck_synthesis`
gecacht; Cache-Schlüssel ist ein **Inhalts-Hash über genau diese Fakten** plus Sprache und
Prompt-Version. Ändern sich die Zahlen, wird der Text nicht gelöscht, sondern als "Stand von …"
mit Neu-erzeugen-Hinweis angezeigt — gerendert werden immer die Zahlen aus dem Schnappschuss,
nie live gemischte.

Der Demo-Modus bekommt eine handgeschriebene, vorberechnete Synthese im Seed (Muster: die fünf
`BattleAnalysis`-Konstanten in `demoSeed.ts`), abgesichert durch denselben Test-Riegel wie dort:
jede Demo-Aussage muss die echte Validierung gegen ihren Fakten-Schnappschuss überstehen.

---

## 2. Betroffene Schichten

**`packages/shared` (neue reine Logik + Wire-Typen — Single Source of Truth)**
- [ ] `packages/shared/src/deckSynthesis.ts` **(neu)** — Fakt-/Claim-Typen,
      `deriveFactDirection`, `sanitizeFactLabel`, `factIdForCard`, `factsFromFieldScore`,
      `factsFromCardStats`, `factsFromEquilibrium`, `selectFacts`, `buildSynthesisPrompts`,
      `validateSynthesis`, `renderClaimText`, `sectionForClaim`, `assembleSynthesis`,
      `canonicalizeFacts`, Konstanten (§3)
- [ ] `packages/shared/src/deckSynthesis.test.ts` **(neu)**
- [ ] `packages/shared/src/index.ts` — **ein** neuer Re-Export

**KI-Adapter (`apps/api/src/ai`)**
- [ ] `apps/api/src/ai/provider.ts` — `SynthesisInput`, zweite Methode `synthesize` auf
      `AnalysisProvider`
- [ ] `apps/api/src/ai/githubModels.ts` — privater `chatJson(...)` (der heutige Inline-Fetch),
      `analyze` im Verhalten unverändert, neues `synthesize`
- [ ] `apps/api/src/ai/index.ts` — Re-Export der neuen Typen

**Datenmodell / Migration (`apps/api`)**
- [ ] `apps/api/src/db/schema.ts` — neue Tabelle `deckSynthesis` (§3.7)
- [ ] `apps/api/drizzle/0015_*.sql` **(generiert, nicht handgeschrieben)** + `drizzle/meta/*`

**API**
- [ ] `apps/api/src/routes/meta.ts` — `loadFieldScores` **exportieren** (keine Logikänderung)
- [ ] `apps/api/src/lib/synthesisFacts.ts` **(neu)** — I/O-Seite: `buildSynthesisFactSet(db, …)`
      + `synthesisInputHash(...)` (nutzt `node:crypto`, deshalb hier und nicht in `shared`)
- [ ] `apps/api/src/lib/deckSynthesisStore.ts` **(neu)** — `loadDeckSynthesis`,
      `saveDeckSynthesis` (Muster: `lib/cardStatsData.ts`)
- [ ] `apps/api/src/routes/analysis.ts` — `GET /deck/:deckId` (Lesepfad, kein LLM) und
      `POST /deck/:deckId` (Erzeugen, rate-limited)
- [ ] `apps/api/src/validation.ts` — `deckSynthesisQuerySchema`, `deckSynthesisPostSchema`,
      `SYNTHESIS_LANGUAGES`
- [ ] `apps/api/src/lib/demoSeed.ts` — vorberechnete Synthese + Insert im Seed
- [ ] `apps/api/src/lib/demoSeed.test.ts` — neuer Riegel (jede Demo-Aussage überlebt)
- [ ] `apps/api/src/api.test.ts` — neue `describe`-Blöcke (Lesepfad, Erzeugen, Cache,
      Ownership, Rate-Limit)

**Web**
- [ ] `apps/web/src/lib/api.ts` — `getDeckSynthesis`, `generateDeckSynthesis`
- [ ] `apps/web/src/lib/api.test.ts` — zwei neue Fälle
- [ ] `apps/web/src/store/dashboardStore.ts` — `deckSynthesis`, `isSynthesizing`,
      `synthesisError`, `loadDeckSynthesis`, `runDeckSynthesis` (Sequenz-Guard wie
      `loadCardStats`, `dashboardStore.ts:410-417`)
- [ ] `apps/web/src/components/recommendations/DeckSynthesisPanel.tsx` **(neu)**
- [ ] `apps/web/src/components/recommendations/DeckSynthesisPanel.test.tsx` **(neu)**
- [ ] `apps/web/src/components/deck/DeckTipsSection.tsx` — Panel einhängen
- [ ] `apps/web/src/components/deck/DeckTipsSection.test.tsx` — Store-Mock um die neuen Felder
      ergänzen (**sonst rot**, siehe §0.4)
- [ ] `apps/web/src/i18n/locales/{de,en}/recommendations.json` — neue Keys (§3.10)

**Doku (CLAUDE.md §2.7 — Pflicht im selben Zug)**
- [ ] `docs/features.md` — neuer §19 "Deck-Synthese (KI-Text über Kennzahlen)", Querverweise
      aus §8, §17, §18
- [ ] `docs/database.md` — `deck_synthesis` (Migration `0015`) im serverseitigen Abschnitt
- [ ] `docs/data-types.md` — `SynthesisFact`, `SynthesisClaim`, `DeckSynthesis`
- [ ] `docs/data-flow.md` — Fakten → Prompt → Validierung → Montage → Cache → UI
- [ ] `docs/ai-system.md` — zweiter Analyse-Typ, Abgrenzung der beiden Grounding-Prinzipien
- [ ] `docs/demo-mode.md` — vorberechnete Synthese
- [ ] `docs/backend-evolution-plan.md` §6.3 — Phase B als umgesetzt markieren (Muster: die
      ✅-Zeile bei Phase A, `:268`)

---

## 3. Interfaces & Contracts

Verbindlich für `tester` (schreibt daraus die roten Tests) und `implementer` (macht sie grün).
Signaturen, Regeln und nachrechenbare Tabellen — keine Implementierungsvorgaben darüber hinaus.

### 3.0 Warum das Log-Grounding hier nicht funktioniert — und was stattdessen gilt

`evidenceExistsInLog` (`battleAnalysis.ts:70-74`) prüft `log.includes(snippet)`. Ein Field-Score
von 52,3 % ist kein Textkorpus; es gibt kein "Zitat", das darin vorkommen könnte. Die
äquivalente Frage bei strukturierten Eingaben ist eine andere: *"Zeigt die Aussage auf einen
Datenpunkt, den ich mitgeliefert habe — und behauptet sie dieselbe Richtung, die dieser
Datenpunkt hergibt?"*

Drei Bausteine, in dieser Reihenfolge zwingend:

1. **Geschlossene Fakten-Liste.** Der Prompt enthält *ausschließlich* die Fakten, über die
   geschrieben werden darf, jeder mit einer stabilen `id`. Das entspricht "der volle Rohlog ist
   im Prompt" aus `docs/features.md:262`, nur eben für Zahlen.
2. **Richtung aus dem Band, nicht aus dem Punkt.** Die Richtung eines Fakts wird **nicht** aus
   `value > neutral` abgeleitet, sondern aus dem Konfidenzband: schließt das Band den
   Neutralwert aus und liegt darüber → `positive`, darunter → `negative`, enthält es den
   Neutralwert → `neutral`. Damit ist die Richtungsprüfung selbst konfidenzbewusst und erbt
   direkt die Semantik von Spec 3 (`WeightedMatchup.significant` = "Band schließt 50 % aus",
   `fieldWinRate.ts:42-43`). Ein Matchup mit 8-2 aus 10 Spielen ist damit `neutral`, und eine
   Aussage "du bist hier stark" wird verworfen — genau das Lehrstück von Spec 3, jetzt auch für
   den KI-Text.
3. **Zahlen kommen nie vom Modell.** Claim-Texte enthalten Platzhalter; der Server rendert.

**Warum nicht "prüfe, ob die Zahl im Text zum Fakt passt"?** Das wäre die naive Umsetzung von
Entscheidung 3 und braucht eine Zahlen-Extraktion aus Prosa (Rundung, Prozent vs.
Prozentpunkte, "gut die Hälfte"). Fehleranfällig und nie vollständig. Der Platzhalter-Ansatz
löst dasselbe Problem konstruktiv statt prüfend. Als Restsicherung bleibt eine harte Regel:
**enthält der Claim-Text nach dem Entfernen der Platzhalter noch eine Ziffer, die nicht im
`label` des referenzierten Fakts vorkommt, wird der Claim verworfen** (`foreignNumber`). Damit
ist "das Modell schreibt Zahlen trotzdem hin" abgedeckt, ohne Prosa-Parsing.

### 3.1 Fakten (`packages/shared/src/deckSynthesis.ts`)

```ts
/** Prompt- und Validierungs-Version. Teil des Cache-Schlüssels: ändert sich die
 *  Prompt- oder Validierungs-Logik, sind alte Texte automatisch veraltet.
 *  Bei JEDER Änderung an buildSynthesisPrompts/validateSynthesis erhöhen. */
export const SYNTHESIS_PROMPT_VERSION = 1;

/** Maximum an Fakten im Prompt — Token-Kosten und Auswahl-Determinismus. */
export const MAX_SYNTHESIS_FACTS = 24;

/** Maximum an Claims, die aus einer Modellantwort übernommen werden. */
export const MAX_SYNTHESIS_CLAIMS = 12;

/** Maximale Zeichenlänge eines Claim-Textes; längere werden verworfen. */
export const MAX_CLAIM_TEXT_CHARS = 240;

/** |value - neutralValue| unterhalb dieser Schwelle gilt als neutral, wenn der
 *  Fakt KEIN Band hat (bandlos: Meta-Share, Coverage). */
export const NEUTRAL_EPSILON = 1;

export const SYNTHESIS_FACT_KINDS = [
  'fieldScore',        // Field-Win-Rate des eigenen Archetyps, neutral = 50
  'coverage',          // Abdeckung der Matchup-Daten, neutral = 100 (bandlos)
  'matchup',           // gewichtetes Einzel-Matchup, neutral = 50
  'metaShare',         // Feldanteil eines Archetyps, bandlos
  'cardDelta',         // Karten-Performance-Delta (Spec 5), neutral = 0
  'equilibriumWeight', // Nash-Gewicht des eigenen Archetyps, neutral = sharePct
  'equilibriumGap',    // paradoxGapPp, neutral = 0, INVERTIERT
  'equilibriumTrend',  // fitnessDeltaPp, neutral = 0
] as const;
export type SynthesisFactKind = (typeof SYNTHESIS_FACT_KINDS)[number];

export type FactDirection = 'positive' | 'negative' | 'neutral';

export const SYNTHESIS_LANGUAGE_VALUES = ['de', 'en'] as const;
export type SynthesisLanguage = (typeof SYNTHESIS_LANGUAGE_VALUES)[number];

export interface SynthesisFact {
  /** Stabile, im Prompt zitierbare id. Grammatik (bindend):
   *  'field.winRate' | 'field.coverage' | 'meta.share.self'
   *  | 'matchup.<archetypeId>' | 'meta.share.<archetypeId>'
   *  | 'card.<factIdForCard(name)>'
   *  | 'equilibrium.weight' | 'equilibrium.gap' | 'equilibrium.trend'
   *  | 'equilibrium.trend.<archetypeId>' */
  id: string;
  kind: SynthesisFactKind;
  /** Menschenlesbare Entität ("Dragapult ex", "Ultra Ball").
   *  IMMER durch sanitizeFactLabel() gelaufen. */
  label: string;
  /** Die Kennzahl, über die geschrieben werden darf. */
  value: number;
  unit: 'pct' | 'pp' | 'games' | 'copies';
  /** Wert, an dem die Richtung kippt. */
  neutralValue: number;
  /** Bandgrenzen auf derselben Achse wie `value`; null = bandloser Fakt. */
  lowPct: number | null;
  highPct: number | null;
  /** Abgeleitet (deriveFactDirection), NIE vom Modell geliefert. */
  direction: FactDirection;
  /** Band schließt neutralValue aus. Bei bandlosen Fakten immer false. */
  significant: boolean;
  /** false ⇒ darf als Kontext erwähnt, aber NIE Grundlage einer
   *  'recommendation' sein (viertes AC). */
  usableForRecommendation: boolean;
  /** Zusätzlich erlaubte Ziffern-Literale für die foreignNumber-Prüfung
   *  (z. B. Kartennamen mit Zahl). Immer sanitisiert. */
  entityNames: string[];
  /** Nur für cardDelta. */
  inUserDeck?: boolean;
  userCount?: number;
}

/** Deck-/Meta-Kontext, der die Sätze rahmt (keine Aussagen daraus). */
export interface SynthesisContext {
  deckId: number;
  archetypeId: string;
  archetypeName: string; // sanitizeFactLabel()-behandelt
  variant: string;       // sanitizeFactLabel()-behandelt
  windowDays: number;
  language: SynthesisLanguage;
  /** ISO-Zeitpunkte der Vorberechnungen, für den Quellen-Hinweis in der UI. */
  cardStatsComputedAt: string | null;
  equilibriumComputedAt: string | null;
  matchupImportedAt: string | null;
}

export interface SynthesisFactSet {
  facts: SynthesisFact[];
  context: SynthesisContext;
}
```

**`deriveFactDirection` — die Kernfunktion der dritten Spec-Entscheidung.**

```ts
/**
 * Direction of a fact, derived from its confidence band when it has one and
 * from the point estimate otherwise. `invert` flips the meaning for facts
 * where "higher" is worse (equilibriumGap: played MORE than the equilibrium
 * justifies is a warning, not a strength).
 */
export function deriveFactDirection(args: {
  value: number;
  neutralValue: number;
  lowPct: number | null;
  highPct: number | null;
  invert?: boolean;
}): FactDirection;
```

Bindende Regeln (Reihenfolge zählt, erste Übereinstimmung gewinnt):

| # | Bedingung | Ergebnis (vor `invert`) |
|---|---|---|
| 1 | Band vorhanden und `lowPct > neutralValue` | `positive` |
| 2 | Band vorhanden und `highPct < neutralValue` | `negative` |
| 3 | Band vorhanden, 1/2 nicht erfüllt | `neutral` |
| 4 | kein Band und `value - neutralValue > NEUTRAL_EPSILON` | `positive` |
| 5 | kein Band und `neutralValue - value > NEUTRAL_EPSILON` | `negative` |
| 6 | sonst | `neutral` |

"Band vorhanden" = `lowPct !== null && highPct !== null`.
`invert: true` tauscht `positive` ↔ `negative`, lässt `neutral` unberührt.

Verbindliche Wertetabelle (Testgrundlage, exakt):

| value | neutral | low | high | invert | Ergebnis | Bedeutung |
|---|---|---|---|---|---|---|
| 62 | 50 | 54 | 70 | – | `positive` | Band über 50 |
| 62 | 50 | 48 | 76 | – | `neutral` | **Kernfall:** 62 % sieht stark aus, das Band sagt nichts |
| 38 | 50 | 30 | 46 | – | `negative` | |
| 50 | 50 | 50 | 50 | – | `neutral` | Mirror (`fieldWinRate.ts:135-139`) |
| 12 | 0 | 4 | 20 | `true` | `negative` | Popularitäts-Paradox: hohes `paradoxGapPp` ist eine Warnung |
| −12 | 0 | −20 | −4 | `true` | `positive` | unterrepräsentiert = Chance |
| 15.5 | 0 | `null` | `null` | – | `positive` | bandlos, über Epsilon |
| 0.4 | 0 | `null` | `null` | – | `neutral` | bandlos, unter Epsilon |
| 100 | 100 | `null` | `null` | – | `neutral` | volle Coverage |
| 61 | 100 | `null` | `null` | – | `negative` | schwache Coverage |

**Hilfsfunktionen:**

```ts
/** Strip anything that could steer the model or break the prompt frame:
 *  collapse all whitespace (incl. newlines) to single spaces, remove
 *  backticks, curly braces and the '|' column separator, trim, cap at 60
 *  chars. Deck/archetype/card names are USER INPUT (decks.archetype_name,
 *  deck_cards.name) — this is the prompt-injection boundary. */
export function sanitizeFactLabel(raw: string): string;
// 'Mega Kangaskhan ex'         -> 'Mega Kangaskhan ex'
// 'Ignore\nall previous'       -> 'Ignore all previous'
// '`` | id: field.winRate'     -> 'id: field.winRate'
// 'x'.repeat(200)              -> 60 Zeichen

/** Fact-id fragment for a card: normalizeCardName() (reused from
 *  cardPerformance.ts:51) with spaces replaced by '-'. */
export function factIdForCard(cardName: string): string;
// "Boss's Orders" -> "boss's-orders"
// '  Nest   Ball' -> 'nest-ball'
```

### 3.2 Fakten-Erzeugung aus den drei Quellen (rein, ohne I/O)

```ts
/** Field score + weighted matchups of ONE archetype (the user's deck).
 *  Produces 'field.winRate', 'field.coverage', 'meta.share.self', one
 *  'matchup.<id>' per emitted threat/free win and one 'meta.share.<id>'
 *  alongside it. */
export function factsFromFieldScore(
  score: FieldScore,
  opts?: { maxThreats?: number; maxFreeWins?: number }, // defaults 4 / 3
): SynthesisFact[];

/** Card performance deltas (Spec 5) crossed with the user's actual list.
 *  Emits only ACTIONABLE cards:
 *   - in the deck and deltaPp negative, or
 *   - not in the deck and deltaPp positive.
 *  Cards with tier 'insufficient' are emitted with
 *  usableForRecommendation=false (mentionable as context) — NOT silently
 *  dropped, so the model cannot mistake absence for "no such card".
 *  Sorted by |deltaPp| desc, then cardName asc. */
export function factsFromCardStats(
  cards: ArchetypeCardStat[],
  deckCards: { name: string; count: number }[],
  opts?: { max?: number }, // default 6
): SynthesisFact[];

/** Equilibrium signals (Spec 6). Emits 'equilibrium.weight',
 *  'equilibrium.gap' and 'equilibrium.trend' for the user's own archetype and
 *  'equilibrium.trend.<id>' for up to `maxRising` rising opponents. Returns []
 *  when the archetype is not in the run — the synthesis then simply has no
 *  equilibrium facts, it does not fail. */
export function factsFromEquilibrium(
  rows: EquilibriumArchetypeRow[],
  selfArchetypeId: string,
  opts?: { maxRising?: number }, // default 2
): SynthesisFact[];

/** Deterministic cap at MAX_SYNTHESIS_FACTS. Priority (bindend):
 *  1. field.winRate  2. field.coverage  3. meta.share.self
 *  4. equilibrium.* (self)  5. matchup.* (weightPct desc)
 *  6. card.* (|deltaPp| desc)  7. rest (id asc).
 *  Stable: same input -> same output, always. */
export function selectFacts(facts: SynthesisFact[]): SynthesisFact[];
```

Verbindliche Ableitungsregeln je Quelle:

| Fakt | `value` | `neutralValue` | Band | `usableForRecommendation` |
|---|---|---|---|---|
| `field.winRate` | `fieldWinRatePct` | 50 | `fieldWinRateLowPct` / `fieldWinRateHighPct` | `direction !== 'neutral'` |
| `field.coverage` | `coveragePct` | 100 | – | **immer `false`** (Metadatum, nie eine Empfehlung) |
| `meta.share.*` | `sharePct` | 0 | – | **immer `false`** |
| `matchup.<id>` | `winRatePct` | 50 | `lowPct` / `highPct` | `significant` |
| `card.<key>` | `delta.deltaPp` | 0 | `delta.lowPct − 50` / `delta.highPct − 50` | `tier !== 'insufficient' && delta.significant` |
| `equilibrium.weight` | `weightPct` | `sharePct` | `weightP05Pct` / `weightP95Pct` | `direction !== 'neutral'` |
| `equilibrium.gap` (invert) | `paradoxGapPp` | 0 | – | `exclusionRatePct >= 70` **oder** `inSupport` |
| `equilibrium.trend*` | `fitnessDeltaPp` | 0 | – | `fitnessDeltaPp != null && direction !== 'neutral'` |

Anmerkung zum Karten-Band: `CardPerformanceDelta.lowPct/highPct` liegen auf der
`superiorityPct`-Achse (Neutral 50, `cardPerformance.ts:124-125`), `deltaPp` auf der 0-Achse
(`:120-122`). Die Verschiebung um −50 ist die einzig zulässige Umrechnung; sie ist als eigener
Test zu pinnen: `delta.significant === true` genau dann, wenn das verschobene Band 0 ausschließt.

Fakten mit `value === null` (z. B. `fieldWinRatePct === null` bei fehlender Abdeckung,
`fieldWinRate.ts:56`) werden **nicht erzeugt**. Ist die Fakten-Liste leer, gibt es nichts zu
übersetzen: die Route antwortet mit 409 statt einen leeren LLM-Aufruf zu bezahlen (§3.8).

### 3.3 Claims und Validierung

```ts
export const SYNTHESIS_CLAIM_KINDS = ['observation', 'recommendation'] as const;
export type SynthesisClaimKind = (typeof SYNTHESIS_CLAIM_KINDS)[number];

export interface SynthesisClaim {
  /** Must match a SynthesisFact.id exactly (case-sensitive). */
  factId: string;
  kind: SynthesisClaimKind;
  /** The model's own reading of the number. Must equal fact.direction. */
  direction: FactDirection;
  /** Prose WITHOUT numbers. Placeholders: {value} {low} {high} {label}. */
  text: string;
}

export const CLAIM_REJECTION_REASONS = [
  'malformed',              // wrong shape / unknown kind or direction value
  'emptyText',              // empty, whitespace, or longer than MAX_CLAIM_TEXT_CHARS
  'unknownFact',            // factId not in the supplied facts
  'duplicate',              // second claim on the same factId
  'unknownPlaceholder',     // a placeholder that is not one of the four allowed
  'missingBandPlaceholder', // {low}/{high} used on a bandless fact
  'directionMismatch',      // claim.direction !== fact.direction
  'insufficientEvidence',   // recommendation on a fact below the Spec 3/5 bar
  'foreignNumber',          // digit in text that no referenced label contains
] as const;
export type ClaimRejectionReason = (typeof CLAIM_REJECTION_REASONS)[number];

export interface RejectedClaim {
  claim: SynthesisClaim;
  reason: ClaimRejectionReason;
}

export interface ValidatedSynthesis {
  accepted: SynthesisClaim[];
  rejected: RejectedClaim[];
}

/**
 * The provider-independent grounding gate for structured input — the
 * counterpart to validateAnalysis() for battle logs. Never throws: unusable
 * input yields { accepted: [], rejected: [] }. `accepted` keeps the model's
 * order; the first claim per factId wins.
 */
export function validateSynthesis(
  claims: unknown,
  facts: SynthesisFact[],
): ValidatedSynthesis;
```

**Bindende Prüfreihenfolge je Claim** — die Reihenfolge der Liste
`CLAIM_REJECTION_REASONS` oben ist zugleich die Prüfreihenfolge; die erste Verletzung gewinnt
und bestimmt `reason`. Claims jenseits von `MAX_SYNTHESIS_CLAIMS` werden abgeschnitten (nicht
als `rejected` gezählt).

**Fremde-Ziffer-Regel (exakt).** Platzhalter entfernen, dann alle Treffer von
`/\d+(?:[.,]\d+)?/g` sammeln. Ein Treffer ist erlaubt, wenn er als Teilstring in `fact.label`
oder in einem Eintrag von `fact.entityNames` vorkommt. Ein einziger unerlaubter Treffer
verwirft den Claim.

**Verbindliche Testtabelle für `validateSynthesis`.** Fakten-Fixture:

| id | value | neutral | low | high | ⇒ direction | usable |
|---|---|---|---|---|---|---|
| `field.winRate` | 55.2 | 50 | 51.1 | 59.3 | `positive` | `true` |
| `matchup.dragapult-ex` (label `Dragapult ex`) | 41.0 | 50 | 33.0 | 49.4 | `negative` | `true` |
| `matchup.gholdengo` (label `Gholdengo`) | 62.0 | 50 | 44.0 | 78.0 | `neutral` | `false` |
| `meta.share.self` | 8.4 | 0 | `null` | `null` | `positive` | `false` |

| # | Claim | Erwartung |
|---|---|---|
| 1 | `field.winRate`, `observation`, `positive`, `'Dein Deck steht mit {value} % gegen das aktuelle Feld solide da.'` | akzeptiert |
| 2 | wie 1, aber `direction: 'negative'` | `directionMismatch` |
| 3 | wie 1, aber `factId: 'field.winrate'` | `unknownFact` |
| 4 | `matchup.gholdengo`, `recommendation`, `neutral` | `insufficientEvidence` |
| 5 | `matchup.gholdengo`, `observation`, `neutral` | akzeptiert — Kontext ja, Empfehlung nein |
| 6 | `matchup.gholdengo`, `observation`, `positive` | `directionMismatch` — **der eigentliche Zweck der dritten Entscheidung** |
| 7 | `field.winRate`, Text `'Dein Field-Score von 71 % ist stark.'` | `foreignNumber` |
| 8 | `matchup.dragapult-ex`, `negative`, Text `'{label} liegt bei {value} %.'` | akzeptiert |
| 9 | `meta.share.self`, Text `'{value} % ({low}–{high} %)'` | `missingBandPlaceholder` |
| 10 | zwei Claims auf `field.winRate` | erster akzeptiert, zweiter `duplicate` |
| 11 | `claims` = `null` / `'nope'` / `{}` / `[undefined]` | `{ accepted: [], rejected: [] }` bzw. `malformed`, **kein Wurf** |
| 12 | Text `'{summary}'` | `unknownPlaceholder` |
| 13 | `matchup.dragapult-ex`, Text `'Karte 4 von 60'` | `foreignNumber` |
| 14 | Fakt mit `entityNames: ['Dragapult ex 2']`, Text `'Dragapult ex 2 hilft hier.'` | akzeptiert (Ziffer steht im entityName) |
| 15 | 20 gültige Claims | genau `MAX_SYNTHESIS_CLAIMS` akzeptiert, Rest abgeschnitten |

### 3.4 Rendering und Montage (deterministisch, keine zweite LLM-Runde)

```ts
export const SYNTHESIS_SECTIONS = [
  'headline', 'strengths', 'risks', 'listLevers', 'context',
] as const;
export type SynthesisSection = (typeof SYNTHESIS_SECTIONS)[number];

/** Section for a claim — derived, never chosen by the model:
 *  1. kind === 'recommendation'   -> 'listLevers'
 *  2. fact.kind === 'fieldScore'  -> 'headline'
 *  3. fact.direction 'positive'   -> 'strengths'
 *  4. fact.direction 'negative'   -> 'risks'
 *  5. else                        -> 'context' */
export function sectionForClaim(claim: SynthesisClaim, fact: SynthesisFact): SynthesisSection;

/** Substitute the four placeholders from the fact. Numbers use ONE decimal and
 *  a DOT as decimal separator in both languages — consistent with the existing
 *  formatWithInterval (apps/web/src/components/meta/confidence.ts:27-37).
 *  {value}/{low}/{high} render the bare number WITHOUT a unit (the model writes
 *  the unit in its prose); {label} renders fact.label. */
export function renderClaimText(claim: SynthesisClaim, fact: SynthesisFact): string;

export interface SynthesisSectionBlock {
  section: SynthesisSection;
  sentences: string[];
}

export type DeckSynthesisSource = 'llm' | 'demo-seed';
export const DECK_SYNTHESIS_SOURCE_VALUES = ['llm', 'demo-seed'] as const;

export interface DeckSynthesis {
  deckId: number;
  archetypeId: string;
  archetypeName: string;
  windowDays: number;
  language: SynthesisLanguage;
  promptVersion: number;
  /** Rendered, ready to display. Empty sections omitted; section order is
   *  SYNTHESIS_SECTIONS order; max 3 sentences per section (model order). */
  sections: SynthesisSectionBlock[];
  /** The surviving claims, for the "worauf beruht das?" disclosure. */
  claims: SynthesisClaim[];
  /** Snapshot the text was generated from — the UI renders THESE numbers. */
  facts: SynthesisFact[];
  context: SynthesisContext;
  /** How many model claims the gate dropped. Surfaced, never hidden. */
  droppedCount: number;
  source: DeckSynthesisSource;
  provider: string | null;
  model: string | null;
  inputHash: string;
  generatedAt: string; // ISO
}

/** Pure assembly: validated claims + facts + context -> DeckSynthesis. */
export function assembleSynthesis(
  validated: ValidatedSynthesis,
  facts: SynthesisFact[],
  context: SynthesisContext,
  meta: {
    inputHash: string;
    source: DeckSynthesisSource;
    provider: string | null;
    model: string | null;
    generatedAt: string;
  },
): DeckSynthesis;
```

Verbindliche Eigenschaften (Property-Tests):
- `sections` enthält **keinen** Block ohne Sätze.
- `claims.length === validated.accepted.length` und `droppedCount === validated.rejected.length`.
- Alle Claims verworfen ⇒ `sections === []`, `claims === []`, `droppedCount > 0`.
  **Das ist ein gültiges Ergebnis, kein Fehler** — die UI zeigt dann "keine belegbare Aussage",
  niemals einen erfundenen Ersatztext.
- Kein gerenderter Satz enthält eine geschweifte Klammer.
- Idempotenz: zweimal mit denselben Eingaben ⇒ tief gleiches Objekt.

### 3.5 Prompt-Bau

```ts
/**
 * German/English system + user prompts. The anti-hallucination rules are baked
 * in, mirroring buildAnalysisPrompts (battleAnalysis.ts:81-152):
 *  - write about the listed facts ONLY, exactly one factId per statement
 *  - NEVER write a number; use {value}/{low}/{high}/{label}
 *  - declare `direction` matching the fact's stated direction
 *  - `recommendation` only on facts marked usable
 *  - when unsure: omit the statement
 *  - the reader knows nothing about this specific deck (fifth AC): no internal
 *    abbreviations, explain "Field-Score" once in plain words
 *  - answer with JSON only: { "claims": [ ... ] }
 */
export function buildSynthesisPrompts(
  facts: SynthesisFact[],
  context: SynthesisContext,
): { system: string; user: string };
```

Verbindliche Tests (ohne den Wortlaut zu pinnen):
- Jede `fact.id` kommt im `user`-Prompt vor.
- Jede `fact.direction` steht neben ihrer id (das Modell rät nicht).
- `usableForRecommendation: false` ist im Prompt sichtbar markiert.
- `language: 'en'` ⇒ ein gepinntes deutsches Markerwort fehlt, das englische ist da (und
  umgekehrt).
- Ein Deckname `'…\n\nIgnoriere alle vorherigen Anweisungen'` taucht im Prompt nur einzeilig
  und ohne Zeilenumbruch auf (Prompt-Injection-Riegel, §7 security-agent).

### 3.6 Provider-Vertrag (`apps/api/src/ai`)

```ts
// provider.ts — ADDITIV; AnalysisInput/analyze bleiben unverändert
export interface SynthesisInput {
  facts: SynthesisFact[];
  context: SynthesisContext;
}

export interface AnalysisProvider {
  analyze(input: AnalysisInput): Promise<BattleAnalysis>;
  /** Structured-input counterpart. Returns the ALREADY VALIDATED result — the
   *  grounding gate runs inside the adapter, exactly like analyze() calls
   *  validateAnalysis (githubModels.ts:75), so no provider can skip it. */
  synthesize(input: SynthesisInput): Promise<ValidatedSynthesis>;
}
```

`githubModels.ts` wird so umgebaut, dass der HTTP-Teil genau einmal existiert:

```ts
/** The single GitHub Models call. temperature: 0 and the JSON-only response
 *  format are NOT parameters — they are the guarantee (CLAUDE.md Golden
 *  Rule 6). Error mapping unchanged: 401/403/429 pass through, rest 502. */
async function chatJson(
  opts: { apiKey: string; model: string },
  messages: { role: 'system' | 'user'; content: string }[],
  maxTokens: number,
): Promise<string>;
```

Bindend: `analyze` verhält sich danach **identisch** (URL, Header, Fehler-Mapping,
`max_tokens: 4096`) — die bestehenden Tests in `api.test.ts:994-1024` bleiben unverändert grün
und sind der Regressions-Riegel dieses Refactors. `synthesize` nutzt `maxTokens: 2048` und
parst `{ "claims": [...] }`; unparsbares JSON ⇒ `AnalysisError('… not valid JSON.', 502)`
(gleiche Formulierungslinie wie `githubModels.ts:71`).

### 3.7 Cache-Tabelle und Invalidierungs-Kontrakt

```ts
// apps/api/src/db/schema.ts — neue Tabelle
export const deckSynthesis = pgTable(
  'deck_synthesis',
  {
    id: serial('id').primaryKey(),
    deckId: integer('deck_id')
      .notNull()
      .references(() => decks.id, { onDelete: 'cascade' }),
    /** Redundant to decks.userId, but every user-scoped table carries it
     *  (deck_cards, deck_snapshots) — keeps the ownership filter one join
     *  shorter and matches the house style. */
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    windowDays: integer('window_days').notNull(),
    language: text('language', { enum: SYNTHESIS_LANGUAGE_VALUES }).notNull(),
    promptVersion: integer('prompt_version').notNull(),
    /** sha256 over canonicalizeFacts(...) — THE cache key (below). */
    inputHash: text('input_hash').notNull(),
    /** The fact snapshot the text was generated from. The UI renders these
     *  numbers, never live ones — text and numbers never drift apart. */
    facts: jsonb('facts').$type<SynthesisFact[]>().notNull(),
    context: jsonb('context').$type<SynthesisContext>().notNull(),
    claims: jsonb('claims').$type<SynthesisClaim[]>().notNull(),
    droppedCount: integer('dropped_count').notNull().default(0),
    source: text('source', { enum: DECK_SYNTHESIS_SOURCE_VALUES }).notNull(),
    provider: text('provider'),
    model: text('model'),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('deck_synthesis_uq').on(table.deckId, table.windowDays, table.language),
    index('deck_synthesis_userId_idx').on(table.userId),
    // Defence in depth, same pattern as archetype_card_stats_tier_chk
    // (schema.ts:478): a CHECK on `source` limited to 'llm' / 'demo-seed'.
  ],
);
```

Migration `apps/api/drizzle/0015_*.sql` — **generiert** mit
`npm run db:generate -w @pokekon/api`. Rein additiv: neue Tabelle, kein `ALTER`, kein Drop,
kein Backfill. Auf Railway gefahrlos vor dem Code-Deploy anwendbar.

**Größenordnung:** eine Zeile je (Deck × Fenster × Sprache); der Unique-Index erzwingt
Ersetzen statt Wachsen (`onConflictDoUpdate`, Muster `routes/analysis.ts:69-72`).

**Cache-Schlüssel — Entscheidung und Begründung.**

```ts
// apps/api/src/lib/synthesisFacts.ts — server-only (node:crypto)
export function synthesisInputHash(
  facts: SynthesisFact[],
  meta: {
    archetypeId: string;
    windowDays: number;
    language: SynthesisLanguage;
    promptVersion: number;
  },
): string; // sha256 hex, 64 Zeichen
```

Der Hash geht über `canonicalizeFacts(facts, meta)` — rein und in `shared`, damit er testbar
ist und `demoSeed` denselben Weg nimmt:

```ts
/** Deterministic string over exactly what goes into the prompt:
 *  - facts sorted by id asc
 *  - per fact: id | kind | label | value | unit | neutralValue | lowPct |
 *    highPct | direction | significant | usableForRecommendation
 *  - EVERY number rounded to one decimal before serialising
 *  - meta appended as archetypeId | windowDays | language | promptVersion
 *  Deliberately NOT included: entityNames, inUserDeck/userCount (derived),
 *  and the computedAt timestamps — a job re-run producing identical numbers
 *  must NOT invalidate a text, that would burn tokens for nothing. */
export function canonicalizeFacts(
  facts: SynthesisFact[],
  meta: {
    archetypeId: string;
    windowDays: number;
    language: SynthesisLanguage;
    promptVersion: number;
  },
): string;
```

**Warum ein Inhalts-Hash und kein Zeitstempel?** Die Eingabe stammt aus vier unabhängigen
Quellen mit je eigener Aktualisierung — `tournament_standings`/`tournaments` (Meta-Sync),
`matchup_matrix.importedAt`, `archetype_card_stats.computedAt`,
`meta_equilibrium_runs.computedAt` — **plus** der Kartenliste des Nutzers (`deck_cards`, die
gar keinen Zeitstempel hat). Ein Zeitstempel-Vergleich müsste alle fünf abbilden und würde bei
jedem nächtlichen Job-Lauf invalidieren, auch wenn sich keine einzige Zahl bewegt hat. Der Hash
über die gerundeten Fakten bedeutet exakt das, was Spec-Entscheidung 2 verlangt: *"bis sich die
zugrunde liegenden Zahlen ändern"* — nicht "bis irgendetwas neu berechnet wurde". Die Rundung
auf eine Dezimale vor dem Hashen verhindert, dass Float-Rauschen aus der Wilson-/Nash-Rechnung
den Cache grundlos wegwirft.

`promptVersion` im Hash sorgt dafür, dass eine Prompt- oder Validierungsänderung alte Texte
automatisch als veraltet markiert — ohne Migration, ohne manuelles Leeren.

Verbindliche Tests für `canonicalizeFacts`:

| Fall | Erwartung |
|---|---|
| gleiche Fakten in anderer Reihenfolge | identischer String |
| `value` 55.24 vs. 55.23 | identischer String (beide runden auf 55.2) |
| `value` 55.24 vs. 55.26 | **verschiedener** String |
| `entityNames` unterschiedlich, sonst gleich | identischer String |
| `language` `'de'` vs. `'en'` | verschiedener String |
| `promptVersion` 1 vs. 2 | verschiedener String |
| ein zusätzlicher Fakt | verschiedener String |

**Serve-Regel (bindend):**

| Zustand | Verhalten |
|---|---|
| keine Zeile | `synthesis: null`, `stale: false` |
| `row.inputHash === currentHash` | Zeile ausliefern, `stale: false` |
| Hash abweichend, `source === 'llm'` | Zeile ausliefern, `stale: true` — UI zeigt "Stand von …" + Neu-erzeugen |
| Hash abweichend, `source === 'demo-seed'` | Zeile ausliefern, **`stale: false`** — der Demo-Text ist ein kuratiertes Beispiel und wird nicht als veraltet angeprangert (Muster: die vorberechneten Battle-Log-Analysen beschreiben die geseedeten Logs, nicht das Live-Meta) |

Eine veraltete Zeile wird **nie automatisch gelöscht und nie automatisch neu erzeugt** — beides
würde Entscheidung 1 (nutzergetriggert) unterlaufen.

### 3.8 Routen (`apps/api/src/routes/analysis.ts`)

Beide Routen hängen unter dem bestehenden, session-geschützten `/api`-Sub-App
(`apps/api/src/app.ts:48-58`) — keine zusätzliche Auth-Schicht, aber **Ownership-Prüfung** auf
`decks.userId === c.get('user').id`; ein fremdes oder unbekanntes Deck ergibt **404**
(nicht 403 — kein Existenz-Orakel).

```ts
// GET /api/analysis/deck/:deckId?days=&language=
export interface DeckSynthesisReadResponse {
  deckId: number;
  archetypeId: string;
  windowDays: number;          // bereits gesnappt (snapCardStatsWindow)
  language: SynthesisLanguage;
  /** null = noch nie erzeugt (Kaltstart). Kein 404. */
  synthesis: DeckSynthesis | null;
  /** true, wenn der gespeicherte Text auf anderen Zahlen beruht (Serve-Regel 3.7). */
  stale: boolean;
  /** Hash der AKTUELLEN Zahlen — die UI braucht ihn nicht, der Test schon. */
  currentInputHash: string;
  /** Wie viele Fakten es aktuell überhaupt gäbe. 0 ⇒ Button deaktiviert. */
  availableFactCount: number;
  /** Spiegelt GET /api/analysis/settings, damit der Panel nicht zwei Aufrufe braucht. */
  hasApiKey: boolean;
}

// POST /api/analysis/deck/:deckId
// Body: { days?: number; language?: 'de'|'en'; force?: boolean;
//         apiKey?: string; provider?: AiProvider; model?: string|null }
export interface DeckSynthesisWriteResponse {
  synthesis: DeckSynthesis;
  stale: false;
  /** true, wenn der Cache getroffen hat und KEIN LLM-Aufruf stattfand. */
  cached: boolean;
}
```

Verbindlicher Ablauf `POST`:

1. Zod (`deckSynthesisPostSchema`) — `apiKey: z.string().max(400).optional()` wie
   `analyzeLogSchema:253`.
2. Deck laden + Ownership (404).
3. `windowDays = snapCardStatsWindow(days ?? META_WINDOW_DEFAULT_DAYS)`.
4. `buildSynthesisFactSet(...)`; `facts.length === 0` ⇒ **409**
   `{ error: 'Not enough meta data to synthesise yet.' }` — kein Token verbraucht.
5. `currentHash = synthesisInputHash(...)`.
6. Ohne `force`: existiert eine Zeile mit gleichem Hash ⇒ **sofort** zurück mit `cached: true`,
   **ohne** `fetch`. (Test: `fetchMock` wurde nicht aufgerufen.)
7. Schlüssel auflösen: ephemerer `body.apiKey`, sonst `user_ai_settings` — **wörtlich derselbe
   Block wie `analysis.ts:92-115`**, in eine private Helferfunktion gezogen statt kopiert.
   Kein Schlüssel ⇒ 400 mit derselben Meldung wie `analysis.ts:106`.
8. `getAnalysisProvider(...).synthesize({ facts, context })`.
9. `assembleSynthesis(...)` → `saveDeckSynthesis(...)` (Upsert auf dem Unique-Index) → 200.
10. `AnalysisError` ⇒ Status durchreichen (Muster `analysis.ts:125-128`).

**Rate-Limit:** `rateLimit({ windowMs: 60 * 60_000, max: 20 })` **nur** auf `POST`.
Begründung: der Battle-Log-Pfad hat heute keins, aber diese Route ist teurer (mehrere
Aggregat-Queries **vor** dem LLM-Aufruf) und pro Klick auslösbar. `GET` bleibt ungedrosselt,
weil es kein Token kostet. Der Wert 20/h ist bewusst großzügig und in §6 als offene Frage
markiert.

**`GET` und Kosten:** `GET` berechnet die aktuellen Fakten (drei DB-Lesevorgänge:
`loadFieldScores`, `loadCardStats`, `loadEquilibrium`), um `stale` bestimmen zu können. Das
entspricht ungefähr einem `GET /api/meta/field-analysis` und wird pro Öffnen des Tipps-Tabs
einmal fällig. Alternative (nur bei vorhandener Zeile rechnen) ist eine Optimierung, keine
Notwendigkeit — siehe §6 Risiko 4.

### 3.9 Fakten-Beschaffung serverseitig (`apps/api/src/lib/synthesisFacts.ts`)

```ts
export interface BuildFactSetInput {
  deck: { id: number; archetype: string; archetypeName: string; variant: string };
  deckCards: { name: string; count: number }[];
  windowDays: number;
  language: SynthesisLanguage;
}

/** The ONLY I/O in the synthesis path. Reads:
 *   - loadFieldScores(db, { days: windowDays, online: true, bo1: true })
 *     (routes/meta.ts:259 — exported by this plan, not duplicated)
 *   - loadCardStats(db, deck.archetype, windowDays)   (lib/cardStatsData.ts:18)
 *   - loadEquilibrium(db, windowDays)                 (lib/equilibriumData.ts:54)
 *  Scope is always the default online-Bo1 scope, matching the card-stats and
 *  equilibrium readers (routes/meta.ts:566, :601). */
export async function buildSynthesisFactSet(
  db: Db,
  input: BuildFactSetInput,
): Promise<SynthesisFactSet>;
```

Verbindliches Verhalten (Tests gegen PGlite, Muster `api.test.ts`):
- Archetyp nicht im Field-Score-Ergebnis ⇒ `facts: []` (kein Wurf), `context` trotzdem gefüllt.
- Kaltstart bei `archetype_card_stats` / `meta_equilibrium_runs` (beide Reader liefern leere
  Batches, `routes/meta.ts:566-573`, `:601-608`) ⇒ nur Field-Score-Fakten, kein Fehler.
- Jede `label`-Quelle (Archetypname, Kartenname, Deck-Variante) läuft durch
  `sanitizeFactLabel`.
- `selectFacts` wurde angewendet: `facts.length <= MAX_SYNTHESIS_FACTS`.

### 3.10 Web-Verträge

```ts
// apps/web/src/lib/api.ts
export async function getDeckSynthesis(
  deckId: number,
  opts?: { days?: number; language?: SynthesisLanguage },
): Promise<DeckSynthesisReadResponse>;

/** Trigger a generation. `apiKey` is the demo-mode ephemeral token path —
 *  identical to analyzeBattleLogViaApi (api.ts:413-435). */
export async function generateDeckSynthesis(
  deckId: number,
  opts?: {
    days?: number;
    language?: SynthesisLanguage;
    force?: boolean;
    apiKey?: string;
    provider?: string;
    model?: string | null;
  },
): Promise<DeckSynthesisWriteResponse>;
```

Store (`apps/web/src/store/dashboardStore.ts`, Muster `loadCardStats`, `:409-430`):

```ts
deckSynthesis: DeckSynthesisReadResponse | null;
isLoadingSynthesis: boolean;
isSynthesizing: boolean;
synthesisError: string | null;
/** Read-only, no token cost — safe to call on mount / deck switch. */
loadDeckSynthesis: (deckId: number) => Promise<void>;
/** User-triggered generation (spec decision 1). */
runDeckSynthesis: (opts?: { force?: boolean; apiKey?: string }) => Promise<void>;
```

Beide mit demselben Request-Sequenz-Guard wie `loadCardStats` (`dashboardStore.ts:410,417`),
damit ein Deckwechsel während eines laufenden Aufrufs kein fremdes Ergebnis einblendet.

**Komponente** `apps/web/src/components/recommendations/DeckSynthesisPanel.tsx`, eingehängt in
`DeckTipsSection.tsx` **direkt über** `<RecommendationsPanel />` (also unterhalb des
Datenquellen-Hinweises, `DeckTipsSection.tsx:61-111`, oberhalb von `:130`). Begründung: der
Fließtext ist die Zusammenfassung dessen, was darunter im Detail steht — er gehört an den
Anfang, nicht ans Ende.

Zustände der Komponente (alle testbar, jeder braucht einen i18n-Key):

| Zustand | Anzeige |
|---|---|
| `synthesis === null`, `hasApiKey`, `availableFactCount > 0` | Erklärtext + Button "Text erzeugen" |
| `synthesis === null`, `availableFactCount === 0` | Hinweis "noch zu wenig Meta-Daten", Button deaktiviert |
| `synthesis === null`, kein Schlüssel, regulärer Nutzer | Hinweis + Verweis auf die KI-Einstellungen (Muster `MatchDetailModal.tsx`) |
| `synthesis === null`, kein Schlüssel, Demo-Gast | Feld für den ephemeren Token (`DEMO_AI_TOKEN_KEY`, `demo.ts:18`) |
| `synthesis` vorhanden | Sektionen als Absätze, darunter Erzeugungsdatum + Quellen-Hinweis |
| `stale === true` | zusätzlich Badge "Zahlen haben sich geändert" + "Neu erzeugen" |
| `synthesis.claims.length === 0 && droppedCount > 0` | ehrlicher Leertext: "keine belegbare Aussage — bitte erneut versuchen" |
| `isSynthesizing` | Button im Ladezustand, disabled |
| `synthesisError` | Fehlerzeile, Button bleibt bedienbar |

Neue i18n-Keys unter `recommendations.synthesis.*` in **beiden** Sprachdateien:
`title`, `intro`, `generate`, `regenerate`, `generating`, `stale`, `noFacts`, `noKey`,
`noKeyDemo`, `empty`, `error`, `generatedAt`, `sections.headline`, `sections.strengths`,
`sections.risks`, `sections.listLevers`, `sections.context`, `disclosure`.

**Bindend für den `tester`:** `DeckTipsSection.test.tsx:31-50` mockt den Store als flaches
Objekt. Der Mock muss um `deckSynthesis: null`, `isLoadingSynthesis: false`,
`isSynthesizing: false`, `synthesisError: null`, `loadDeckSynthesis: vi.fn()`,
`runDeckSynthesis: vi.fn()` ergänzt werden — sonst schlagen die bestehenden Tests aus einem
falschen Grund fehl.

### 3.11 Demo-Modus

`apps/api/src/lib/demoSeed.ts` bekommt — nach dem Muster der fünf `BattleAnalysis`-Konstanten
(`:387-573`) — einen handgeschriebenen Fakten-Schnappschuss plus Claims für **Deck A**
(`mega-kangaskhan-ex`):

```ts
/** Fact snapshot the pre-baked demo synthesis was written against. Fixed
 *  numbers, so the demo text is internally consistent regardless of the live
 *  meta — exactly like the pre-baked battle-log analyses describe the seeded
 *  logs, not the live meta. */
export const DEMO_SYNTHESIS_FACTS: SynthesisFact[];

/** One claim list per language. Every claim MUST survive validateSynthesis
 *  against DEMO_SYNTHESIS_FACTS — guarded by demoSeed.test.ts. */
export const DEMO_SYNTHESIS_CLAIMS: Record<SynthesisLanguage, SynthesisClaim[]>;
```

`seedDemoData` schreibt daraus zwei `deck_synthesis`-Zeilen (`de` und `en`) für Deck A mit
`source: 'demo-seed'`, `windowDays: 28`, `provider: null`, `model: null` und dem über
`synthesisInputHash(DEMO_SYNTHESIS_FACTS, …)` berechneten `inputHash`. Deck B bekommt bewusst
**keine** Synthese — so ist im Demo auch der Kaltstart-/Button-Zustand sichtbar, ohne dass ein
Token fließt.

Neuer Riegel in `apps/api/src/lib/demoSeed.test.ts` (Muster `:26-42`):
- für **jede** Sprache: `validateSynthesis(DEMO_SYNTHESIS_CLAIMS[lang], DEMO_SYNTHESIS_FACTS)`
  liefert `rejected.length === 0` und `accepted.length === claims.length`;
- `assembleSynthesis(...)` erzeugt mindestens die Sektionen `headline` und `listLevers`;
- kein gerenderter Satz enthält `{` oder `}`;
- fünftes AC maschinell so weit prüfbar wie sinnvoll: kein Satz enthält eines der internen
  Kürzel aus einer kleinen Verbotsliste (`Bo1`, `Bo3`, `pp`, `Wilson`, `Nash`, `θ`,
  `MIN_MATCHUP_GAMES`) — die inhaltliche Verständlichkeit bleibt Konrads Review-Gate.

**Sprachen — bewusste Entscheidung:** der Demo-Text wird in **beiden** Sprachen vorberechnet.
Die bestehenden Demo-Analysen sind nur deutsch, aber sie stehen in einem Modal hinter einem
deutschen Rohlog; die Synthese steht dagegen prominent im Tipps-Abschnitt, und ein englischer
Demo-Besucher bekäme sonst als Einziges an dieser Stelle deutschen Text. Kosten: ein zweiter
handgeschriebener Claim-Satz (~8 Sätze). Billigere Alternative in §6, offene Frage 1.

### 3.12 Was ausdrücklich NICHT gebaut wird

- Keine Änderung an `analyzeBattleLog`, `validateAnalysis`, `buildAnalysisPrompts` (Spec
  "Out of Scope"). Der Refactor in `githubModels.ts` ändert die HTTP-Mechanik, nicht das
  Verhalten — abgesichert durch die unveränderten Bestandstests.
- Kein Chat, kein Mehrfach-Turn (Spec "Out of Scope").
- Kein neuer LLM-Provider (Spec "Out of Scope"). `getAnalysisProvider` bleibt einarmig.
- Keine Synthese auf der Meta-Seite oder auf der Landing-Page — ein Ort, einer.
- Kein Auto-Lauf, kein Hintergrund-Job (Entscheidung 1).

---

## 4. Umsetzungsreihenfolge (test-first, Scheibe für Scheibe)

Jede Scheibe ist **erst rot** (`tester`), **dann grün** (`implementer`). Der `implementer`
bestätigt vor dem Grün-Machen den gemeldeten Rot-Grund (`~/.claude/rules/tdd.md`, Schritt 2).
Scheiben A–D sind unabhängig von der DB und können parallel zur Scheibe E vorbereitet werden;
alles ab F hängt an E.

**Scheibe 0 — Vorbereitung (kein neues Verhalten, kein neuer Test).**
`git switch -c feat/ai-recommendation-synthesis`; `loadFieldScores` in
`apps/api/src/routes/meta.ts:259` mit `export` versehen (Muster `windowConditions`, `:74`).
Reiner Sichtbarkeits-Change; bestehende Tests bleiben grün.

**Scheibe A — Richtung, Sanitizing, Ids.**
1. `packages/shared/src/deckSynthesis.test.ts`: Wertetabelle `deriveFactDirection` (§3.1),
   `sanitizeFactLabel`-Fälle, `factIdForCard`-Fälle. Rot: Modul existiert nicht.
2. `packages/shared/src/deckSynthesis.ts` (Konstanten, Typen, die drei Funktionen) +
   Re-Export in `packages/shared/src/index.ts`. Grün.

**Scheibe B — Der Grounding-Gate.**
3. Tests: die 15 Zeilen aus §3.3 gegen `validateSynthesis`. Rot.
4. `validateSynthesis` implementieren. Grün.

**Scheibe C — Montage.**
5. Tests: `sectionForClaim`-Regeltabelle, `renderClaimText`-Platzhalter,
   `assembleSynthesis`-Eigenschaften (§3.4). Rot.
6. Implementieren. Grün.

**Scheibe D — Fakten-Erzeugung, Kanonisierung, Prompt.**
7. Tests: `factsFromFieldScore`/`factsFromCardStats`/`factsFromEquilibrium` (Ableitungstabelle
   §3.2, inkl. der −50-Verschiebung beim Karten-Band), `selectFacts`-Prioritäten,
   `canonicalizeFacts`-Tabelle (§3.7), Prompt-Zusicherungen (§3.5). Rot.
8. Implementieren. Grün.

**Scheibe E — Schema + Migration.**
9. Test in `apps/api/src/api.test.ts`: Insert in `schema.deckSynthesis` und Rücklesen über
   PGlite (der Harness spielt die echten Migrations-SQL ein, `api.test.ts:59-68`). Rot:
   Tabelle existiert nicht.
10. `apps/api/src/db/schema.ts` erweitern, dann
    `npm run db:generate -w @pokekon/api` → `apps/api/drizzle/0015_*.sql`. **Generiertes SQL
    gegen §3.7 prüfen:** `CREATE TABLE` + Unique-Index + userId-Index + CHECK, **kein**
    `ALTER`/`DROP` an Bestandstabellen. Grün.

**Scheibe F — Provider-Erweiterung.**
11. Tests: `synthesize` ruft denselben Endpunkt mit `temperature: 0`,
    `response_format: json_object` und `Authorization: Bearer …` auf; unparsbares JSON ⇒
    `AnalysisError` mit 502; ein ungültiger Claim aus der Modellantwort landet in `rejected`.
    Die **bestehenden** `analyze`-Tests (`api.test.ts:994-1024`) bleiben unverändert. Rot.
12. `provider.ts` + `githubModels.ts` (`chatJson` extrahieren, `synthesize` ergänzen). Grün.

**Scheibe G — Fakten-Beschaffung serverseitig.**
13. Tests: `buildSynthesisFactSet` gegen geseedete `tournaments`/`tournament_standings`/
    `matchup_matrix`/`archetype_card_stats`/`meta_equilibrium_*` (Muster: die bestehenden
    Meta-/Job-Tests in `api.test.ts`); Kaltstart-Fälle aus §3.9. Rot.
14. `apps/api/src/lib/synthesisFacts.ts` + `deckSynthesisStore.ts`. Grün.

**Scheibe H — Lesepfad `GET /api/analysis/deck/:deckId`.**
15. Tests: Kaltstart ⇒ 200 `synthesis: null`; fremdes Deck ⇒ 404; unbekanntes Deck ⇒ 404;
    `hasApiKey` spiegelt `user_ai_settings`; gespeicherte Zeile mit passendem Hash ⇒
    `stale: false`; mit abweichendem Hash und `source: 'llm'` ⇒ `stale: true`; mit
    `source: 'demo-seed'` ⇒ `stale: false`. **Kein `fetch` in irgendeinem dieser Tests.** Rot.
16. Route implementieren. Grün.

**Scheibe I — Schreibpfad `POST /api/analysis/deck/:deckId`.**
17. Tests: ohne Schlüssel ⇒ 400; leere Faktenlage ⇒ 409 **ohne** `fetch`-Aufruf;
    erfolgreicher Lauf ⇒ 200, Zeile in `deck_synthesis`, ungegroundeter Claim verworfen und in
    `droppedCount` gezählt; zweiter Aufruf ohne `force` ⇒ `cached: true` und `fetchMock`
    **nicht** erneut aufgerufen; mit `force: true` ⇒ erneuter Aufruf; ephemerer `apiKey` wird
    **nicht** in `user_ai_settings` geschrieben; fremdes Deck ⇒ 404; 21. Aufruf in einer
    Stunde ⇒ 429. Rot.
18. Route implementieren. Grün.

**Scheibe J — Demo-Seed.**
19. Tests in `apps/api/src/lib/demoSeed.test.ts` (§3.11) + ein Route-Test: nach
    `POST /api/demo/seed` liefert `GET /api/analysis/deck/<Deck A>` eine Synthese mit
    `source: 'demo-seed'` und `stale: false`. Rot.
20. `demoSeed.ts` erweitern. Grün.

**Scheibe K — Web-Client + Store.**
21. Tests in `apps/web/src/lib/api.test.ts`: URL/Body von `getDeckSynthesis` und
    `generateDeckSynthesis` (Muster `:211-237`). Rot.
22. `apps/web/src/lib/api.ts` + Store-Slice. Grün.

**Scheibe L — Panel + Einhängen.**
23. `DeckSynthesisPanel.test.tsx`: die Zustandstabelle aus §3.10 (mindestens: Kaltstart mit
    Button, Klick ruft `runDeckSynthesis`, gerenderte Sektionen, `stale`-Badge, Leerfall,
    Kein-Schlüssel-Fall). Zusätzlich `DeckTipsSection.test.tsx` um den erweiterten Store-Mock
    ergänzen und prüfen, dass der Panel **oberhalb** der Empfehlungsliste steht. Rot.
24. `DeckSynthesisPanel.tsx`, Einhängen in `DeckTipsSection.tsx`, i18n-Keys in beiden
    Sprachdateien. Grün.

**Scheibe M — Doku (kein neuer Test, bestehende Suite bleibt grün).**
25. Die Liste aus §2 abarbeiten, inkl. der ✅-Markierung für Phase B in
    `docs/backend-evolution-plan.md:269`.

**Scheibe N — Pflicht-Gate vor dem Merge (CLAUDE.md §3).**
26. `security-agent` **muss** laufen, bevor der PR gemergt wird — dieses Feature erfüllt beide
    Auslöser ("neues User-Input-Processing" und "externer API-Call"). Vorzulegende Punkte:
    Prompt-Injection über `decks.archetype_name`/`deck_cards.name` (`sanitizeFactLabel`,
    §3.1/§3.5), IDOR auf `deckId` (404-Regel, §3.8), ephemerer BYOK-Schlüssel wird nie
    persistiert und nie geloggt, Rate-Limit auf `POST`, keine Fakten aus dem Client (der Server
    baut sie selbst — der Client könnte sonst dem Modell beliebige "Zahlen" unterschieben),
    `deck_synthesis` ist user-scoped.
27. `code-review-agent` (CLAUDE.md §3), danach `docs-agent` für den Feinschliff.

**Befehle, die dabei tatsächlich laufen:**

```bash
npm run db:generate -w @pokekon/api    # nur in Scheibe E
npm run typecheck
npm run lint
npm run test
```

Deploy-seitig passiert nichts Neues: die Migration läuft über den bestehenden
`preDeployCommand` → `npm run migrate:deploy -w @pokekon/api`.

---

## 5. Risiken & offene Fragen

**Rollout & Rückwärtskompatibilität (kurz, weil hier wenig passieren kann)**

Migration `0015` ist rein additiv: eine neue Tabelle, kein `ALTER`, kein `DROP`, kein Backfill
(§3.7). Sie kann auf Railway über den bestehenden `preDeployCommand` →
`npm run migrate:deploy -w @pokekon/api` **vor** dem Code-Swap laufen; der alte Code sieht die
Tabelle nicht. Nach dem Deploy ist sie leer — das ist der reguläre Kaltstart: `GET` liefert
`synthesis: null`, das Panel zeigt den Button. Ein alter Web-Client kennt die beiden Routen
nicht und ruft sie nie auf; ein alter Server liefert 404, weshalb `loadDeckSynthesis` jeden
Fehler abfängt und den Panel-State leer lässt (Muster `loadCardStats`,
`dashboardStore.ts:409-430`). **Rollback:** Code-Revert genügt. `deck_synthesis` enthält
ausschließlich Cache-Daten, die jederzeit neu erzeugbar sind; eine Down-Migration ist nicht
nötig und wäre ein `DROP TABLE` auf Wegwerf-Daten. Kein bestehender Datensatz wird angefasst,
kein bestehendes Feld ändert seine Bedeutung.

**Risiken**

1. **Grounding ≠ Korrektheit — das größte inhaltliche Restrisiko.**
   Das Gate aus §3.3 garantiert drei Dinge: die Aussage zeigt auf einen mitgelieferten
   Datenpunkt, sie behauptet dessen Richtung, und sie enthält keine selbst erfundene Zahl.
   Es garantiert **nicht**, dass die daraus gezogene *Schlussfolgerung* stimmt. Ein Claim
   `factId: 'card.iono'`, `direction: 'negative'`, Text „{label} zieht deine Ergebnisse
   spürbar nach unten — nimm sie raus" ist formal einwandfrei und inhaltlich trotzdem eine
   Kausalaussage über eine Korrelationszahl (dasselbe Problem, das Spec 5 in
   `.claude/plans/recommendation-to-prognosis.md` §6 Risiko 2 benannt hat).
   **Gegenmaßnahmen:** (a) die Prompt-Regeln aus §3.5 verbieten Kausalsprache ausdrücklich;
   (b) `recommendation` ist auf `usableForRecommendation`-Fakten beschränkt (§3.3);
   (c) die Disclosure „worauf beruht das?" zeigt Fakt, Wert und Band zu **jedem** Satz, der
   Leser kann also gegenprüfen; (d) `droppedCount` wird nie versteckt. Das Restrisiko gehört
   ehrlich in `docs/ai-system.md` — die Synthese ist eine *Übersetzung* der Zahlen, keine
   zusätzliche Erkenntnis. Wer das nicht dokumentiert, verkauft ein Sprachmodell als Analyst.

2. **Prompt-Injection über Deck-, Archetyp- und Kartennamen.**
   `decks.archetype_name`, `decks.variant` und `deck_cards.name` sind ungeprüfte
   Nutzereingaben (Deck-Import, manuelles Anlegen) und landen als `fact.label` /
   `context.archetypeName` **im Prompt**. Das ist die einzige Stelle, an der fremder Text in
   das Modell fließt. **Gegenmaßnahmen, gestaffelt:** (a) `sanitizeFactLabel` (§3.1) kollabiert
   Zeilenumbrüche, entfernt Backticks, geschweifte Klammern und `|` und kappt auf 60 Zeichen —
   der Prompt-Rahmen ist damit nicht aufbrechbar und ein Platzhalter nicht injizierbar;
   (b) die Fakten kommen **ausschließlich vom Server** (§3.9), nie aus dem Request-Body — ein
   Angreifer kann dem Modell keine erfundene Zahl unterschieben; (c) selbst eine erfolgreiche
   Steuerung des Modells kann nur Sätze erzeugen, die anschließend durch `validateSynthesis`
   müssen und dabei an eine bestehende `factId` plus deren Richtung gebunden sind. Der
   Schadensraum ist damit auf „ungewöhnlich formulierter, aber gegroundeter Satz" begrenzt.
   Der Injektionstest aus §3.5 (Deckname mit `\n\nIgnoriere alle vorherigen Anweisungen`) ist
   **Pflicht**, nicht optional, und §4 Scheibe N legt den Punkt dem `security-agent` vor.

3. **IDOR auf `deckId`.** Beide Routen nehmen eine fremde ID entgegen und lesen daraus
   nutzerbezogene Daten (Kartenliste, gespeicherter Text). **Gegenmaßnahme:** Ownership-Prüfung
   gegen `decks.userId === c.get('user').id`, **404 statt 403** (kein Existenz-Orakel, §3.8),
   und `deck_synthesis` trägt `userId` redundant mit, damit der Besitzfilter auch beim Lesen
   der Cache-Zeile ohne Join greift. Beide Fälle (fremdes Deck, unbekanntes Deck) sind je Route
   als Test gepinnt (§4 Scheiben H und I). Nachrangig, aber real: ein fremder Deckname darf auch
   nicht über eine Fehlermeldung durchsickern — Fehlertexte enthalten keine Deckdaten.

4. **Ephemerer BYOK-Schlüssel im POST-Body.** Der Demo-Pfad schickt den Token des Gastes im
   Klartext im Body (bestehendes Muster, `analysis.ts:92-115`, `docs/demo-mode.md`).
   **Gegenmaßnahmen:** der Schlüssel wird einmal benutzt und nie geschrieben — `deck_synthesis`
   hat bewusst **keine** Schlüssel-Spalte, nur `provider`/`model`; kein Log-, Fehler- oder
   Response-Pfad gibt den Body aus; der Test „ephemerer `apiKey` landet nicht in
   `user_ai_settings`" ist Teil von Scheibe I. Es entsteht **keine zweite Schlüssel-Ablage**
   (sechstes AC): der Auflösungsblock wird aus `analysis.ts` in eine private Helferfunktion
   gezogen und von beiden Routen aufgerufen, nicht kopiert.

5. **Cache-Invalidierung — zwei Fehlerrichtungen, beide teuer.**
   *Zu aggressiv:* jeder nächtliche Job-Lauf würde den Text wegwerfen, wenn der Schlüssel an
   Zeitstempeln oder an ungerundeten Floats hinge — reiner Token-Verbrauch ohne
   Informationsgewinn. Dagegen: Hash über gerundete Fakten, `computedAt` und abgeleitete Felder
   bewusst **nicht** im Hash (§3.7).
   *Zu träge:* `selectFacts` kappt bei `MAX_SYNTHESIS_FACTS`; ändert sich ein Fakt, der es gar
   nicht in den Prompt geschafft hat, bewegt sich der Hash nicht. Das ist **gewollt** — der Hash
   beschreibt exakt das, was im Prompt stand — muss aber in `docs/data-flow.md` stehen, damit
   niemand ihn später als „Hash über alle Meta-Daten" missversteht.
   *Sichtbare Nebenwirkung:* eine `stale`-Zeile rendert die Zahlen aus ihrem Schnappschuss,
   während `RecommendationsPanel` direkt darunter live rechnet. Für den Nutzer können dort zwei
   verschiedene Prozentwerte für dieselbe Sache stehen. Dagegen: „Stand von …" plus
   `stale`-Badge sind Pflichtanzeige (§3.10) — dieselbe Ehrlichkeitsmechanik wie der
   `computedAt`-Hinweis aus Spec 5. Alternative wäre, den Text bei Hash-Abweichung zu
   verbergen; das würde Entscheidung 1 (nutzergetriggert) faktisch aushebeln und wird bewusst
   nicht gemacht.

6. **Das Rate-Limit ist schwächer, als es aussieht.** `rateLimit` ist ein In-Memory-Sliding-
   Window pro Prozess (`apps/api/src/lib/rateLimit.ts:4-12`, im Code selbst als
   „sufficient for the single-instance Railway deployment" dokumentiert): ein Neustart setzt
   die Zähler zurück, und bei mehreren Instanzen zählt jede für sich. Es schützt hier primär
   die eigene DB/CPU (drei Aggregat-Queries **vor** dem LLM-Aufruf), nicht die Tokenkosten —
   die trägt ohnehin der Schlüsselinhaber. Bewusst akzeptiert, weil das Deployment
   single-instance ist; ein Wechsel auf mehrere Instanzen macht diesen Punkt (und den
   bestehenden bei `POST /api/meta/sync`) zu einem gemeinsamen Folge-Thema, nicht zu einem
   dieses Features. Der Wert 20/h ist geschätzt — siehe offene Frage 1.

7. **Demo-Modus: kuratierter Text neben Live-Zahlen.** Der vorberechnete Demo-Text beschreibt
   `DEMO_SYNTHESIS_FACTS` (feste Zahlen), das Meta darunter ist echt und bewegt sich. Ein
   Demo-Besucher kann also Werte im Fließtext sehen, die nicht zu den Werten im Panel darunter
   passen — und wegen der Serve-Regel (`source === 'demo-seed'` ⇒ `stale: false`, §3.7) ohne
   Veraltet-Hinweis. Das ist **dieselbe bewusste Inkonsistenz wie bei den fünf vorberechneten
   Battle-Log-Analysen** (`demoSeed.ts:387-573`), die die geseedeten Logs beschreiben, nicht das
   Live-Meta. Gegenmaßnahme: der Erzeugungs-/Quellenhinweis wird auch beim Demo-Text angezeigt,
   und der Demo-Text wird so formuliert, dass er über die geseedeten Decks spricht.
   **Zweiter, konkreterer Punkt:** `seedDemoData` ist idempotent über „besitzt schon ein Deck"
   (`demoSeed.ts:785-793`) — **bestehende** Demo-Gast-Accounts bekommen die neuen Zeilen
   dadurch nie. Siehe offene Frage 3.

8. **Refactor am produktiven Battle-Log-Pfad.** `chatJson` herauszuziehen (§3.6) verändert
   Code, der heute funktioniert und Nutzern etwas liefert. **Gegenmaßnahme:** die bestehenden
   Tests (`api.test.ts:994-1024`) bleiben **buchstäblich unverändert** und sind der
   Regressions-Riegel; `analyze` muss URL, Header, `max_tokens: 4096`, `temperature: 0`,
   `response_format` und das 401/403/429→durchreichen/sonst-502-Mapping bitgleich behalten.
   Wird auch nur einer dieser Tests „angepasst", ist der Refactor falsch (`tdd.md`: Tests nicht
   weichklopfen).

9. **Antwortlänge und 502-Rate.** `synthesize` läuft mit `max_tokens: 2048` über bis zu 24
   Fakten. Schneidet das Modell mitten im JSON ab, ist die Antwort unparsbar und die Route
   liefert 502 — für den Nutzer ein Fehlschlag ohne Ergebnis, obwohl Tokens verbraucht wurden.
   **Vermutung** (nicht gemessen): 12 Claims à ≤240 Zeichen liegen deutlich unter 2048 Tokens.
   Gegenmaßnahme: `MAX_SYNTHESIS_CLAIMS`/`MAX_CLAIM_TEXT_CHARS` stehen im Prompt, und der erste
   echte Lauf wird auf abgeschnittene Antworten geprüft. Eine Erhöhung von `max_tokens` wäre
   eine reine Implementierungsänderung, kein Vertragsbruch.

10. **Performance des Lesepfads.** `GET` rechnet die aktuellen Fakten immer (drei Lesevorgänge:
    `loadFieldScores` aggregiert zur Laufzeit, `loadCardStats`/`loadEquilibrium` lesen
    vorberechnete Tabellen), auch wenn nie eine Synthese existierte — sonst wären `stale` und
    `availableFactCount` nicht bestimmbar. Größenordnung: etwa ein
    `GET /api/meta/field-analysis` je Öffnen des Tipps-Tabs. Das ist vertretbar, aber zu
    **messen**: Response-Zeit im PGlite-Harness notieren (gleiche Praxis wie Spec 3 und 5).
    Fällt sie unangenehm aus, ist die Optimierung klar und vertragsneutral (Fakten nur rechnen,
    wenn eine Zeile existiert oder der Nutzer den Button drückt; `stale` wird dann erst beim
    zweiten Schritt bestimmt).

11. **Produktionsdaten.** Kein Risiko über die Migration hinaus (siehe Rollout oben). Die
    einzigen destruktiven Pfade sind die beiden `onDelete: 'cascade'`-Verweise auf `decks` und
    `user` — gewollt: der Text eines gelöschten Decks hat keinen Adressaten. Der Unique-Index
    bedeutet außerdem: **jede Neuerzeugung überschreibt den vorherigen Text ersatzlos.** Es gibt
    keine Historie. Bewusst (reine Cache-Daten, §3.7); wer einen Verlauf will, braucht eine
    eigene Spec.

12. **Bewusst nicht gebaut** (damit niemand es für Vergessen hält): kein Auto-Lauf und kein
    Hintergrund-Job (Entscheidung 1); kein Chat/Mehrfach-Turn und kein zweiter Provider (Spec
    „Out of Scope"); keine Synthese auf der Meta- oder Landing-Seite; keine Text-Historie; keine
    Nutzer-Rückmeldung („war der Text hilfreich?"); keine Änderung an `analyzeBattleLog`,
    `validateAnalysis` oder `buildAnalysisPrompts` (§3.12).

**Entscheidungen (in diesem Plan getroffen — verbindlich, aber umkehrbar; bitte widersprechen,
wenn eine davon nicht passt)**

1. **Platzhalter statt Zahlen-Prüfung** (§3.0). Die wörtliche Lesart von Spec-Entscheidung 3
   („prüfe, ob die Zahl im Text zum Fakt passt") bräuchte Zahlen-Extraktion aus Prosa und wäre
   nie vollständig. Der Platzhalter-Ansatz macht den Fehlerfall unmöglich statt prüfbar und
   behält mit der `foreignNumber`-Regel eine harte Restsicherung. **Das ist eine Verschärfung
   der Spec-Entscheidung, keine Aufweichung** — genau deshalb hier explizit benannt.
2. **Richtung aus dem Konfidenzband, nicht aus dem Punktwert** (§3.1). Erbt die Semantik von
   Spec 3; Nebenwirkung: ein 8-2-Matchup ist `neutral`, „du bist hier stark" wird verworfen.
   Wer das für zu streng hält, ändert damit auch Spec 3.
3. **Inhalts-Hash statt Zeitstempel als Cache-Schlüssel** (§3.7), inkl. `promptVersion` — die
   einzige Lesart, die „bis sich die zugrunde liegenden **Zahlen** ändern" wörtlich erfüllt.
4. **Veraltete Zeilen werden ausgeliefert, nicht gelöscht und nicht automatisch neu erzeugt**
   (§3.7) — alles andere unterläuft Entscheidung 1.
5. **Der Demo-Text wird in beiden Sprachen vorberechnet** (§3.11). Kosten: ein zweiter
   handgeschriebener Claim-Satz. Alternative in offener Frage 2.
6. **Das Panel steht oberhalb von `RecommendationsPanel`** (§3.10) — die Zusammenfassung gehört
   an den Anfang dessen, was sie zusammenfasst.
7. **Rate-Limit nur auf `POST`, 20/h** (§3.8); `GET` kostet keine Tokens und bleibt frei.
8. **Leere Faktenlage ⇒ 409, kein LLM-Aufruf** (§3.8) — Golden Rule 2, kein Token für nichts.
9. **`synthesize` liefert bereits Validiertes** (§3.6). Das Gate sitzt im Adapter, damit ein
   künftiger zweiter Provider es strukturell nicht überspringen kann — dasselbe Prinzip wie
   `analyze` → `validateAnalysis` (`githubModels.ts:75`).
10. **`deck_synthesis` trägt `userId` redundant** (§3.7) — Hausstil (`deck_cards`,
    `deck_snapshots`) und ein Join weniger im Besitzfilter.

**Offene Fragen (echte — an Konrad; blockieren die Scheiben A–D nicht)**

1. **Rate-Limit-Wert.** 20 Erzeugungen pro Stunde und Nutzer sind großzügig geschätzt, nicht
   gemessen. Und die Anschlussfrage: `POST /api/analysis/log` hat bis heute **kein** Limit —
   soll es im selben Zug eines bekommen? **Empfehlung: nein, eigener kleiner `fix(api)`-PR**,
   sonst wächst der Scope dieses Features in einen Bestandspfad hinein.
2. **Demo-Text in beiden Sprachen?** §3.11 entscheidet „ja" (ein englischer Demo-Besucher bekäme
   sonst ausgerechnet an der prominentesten Stelle deutschen Text). Billigere Alternative: nur
   Deutsch wie die Bestands-Analysen, Englisch zeigt den Kaltstart-Button. **Empfehlung: beide**
   — der Aufwand sind ~8 Sätze.
3. **Bestehende Demo-Gäste.** Wegen der Seed-Idempotenz (Risiko 7) sehen sie die Synthese nie.
   Optionen: (a) akzeptieren — Gast-Sessions sind wegwerfbar, ein neuer Demo-Login zeigt alles;
   (b) `seedDemoData` um einen gezielten Nachtrag ergänzen (nur fehlende `deck_synthesis`-Zeilen
   anlegen). **Empfehlung: (a)**, mit einem Satz in `docs/demo-mode.md`.
4. **Sprachquelle im Client.** `language` ist Teil von Unique-Index und Hash; ein Sprachwechsel
   erzeugt also einen zweiten Text und damit einen zweiten LLM-Aufruf. Vorschlag: die Sprache
   kommt aus `i18n.language` (`apps/web/src/i18n/index.ts:57-58`, `supportedLngs ['de','en']`,
   `fallbackLng 'en'`), der Panel lädt bei Sprachwechsel per `GET` neu und zeigt bei fehlendem
   Text wieder den Button — **niemals automatisch erzeugen**. Bitte bestätigen.
5. **`MAX_SYNTHESIS_FACTS = 24`, `MAX_SYNTHESIS_CLAIMS = 12`, `MAX_CLAIM_TEXT_CHARS = 240`,
   `NEUTRAL_EPSILON = 1`** sind gesetzt, nicht datenbelegt — dieselbe Situation wie bei den
   Tier-Grenzen aus Spec 3/5. Nach dem ersten echten Lauf einmal prüfen: wie viele Fakten
   entstehen real, wie viele Claims kommen zurück, wie viele werden verworfen. Kommt „fast alles
   verworfen" heraus, ist das ein **echtes Ergebnis** (der Prompt trägt noch nicht) und wird
   ehrlich berichtet — nicht durch Lockern des Gates wegdefiniert.
6. **Sichtbarkeit von `droppedCount`.** Immer als Zahl anzeigen (maximale Ehrlichkeit, aber
   verunsichernd: „3 Aussagen verworfen" liest sich wie ein Defekt) oder nur in der Disclosure
   „worauf beruht das?"? **Empfehlung: in der Disclosure**, plus der ehrliche Leertext, wenn
   *alle* Claims fallen (§3.4).

---

## 6. Definition of Done

Die Akzeptanzkriterien der Spec (`specs/ai-recommendation-synthesis.md:45-64`) sind wörtlich
abgebildet; jedes AC nennt den Nachweis und die Scheibe aus §4, die es erfüllt.

**Quality-Gates (CLAUDE.md §4)**
- [ ] `npm run typecheck` grün (Repo-Root), keine neuen `any`, keine ungeprüften Casts.
- [ ] `npm run lint` grün (0 Errors), `npx prettier --check .` sauber.
- [ ] `npm run test` grün — **ehrlich berichtet**, nichts geskippt, nichts weichgeklopft.
      Insbesondere unverändert grün: `api.test.ts:994-1024` (Battle-Log-Regressionsriegel für
      den `chatJson`-Refactor, §5 Risiko 8) und `DeckTipsSection.test.tsx` mit dem erweiterten
      Store-Mock (§3.10).

**Gegen die Akzeptanzkriterien der Spec**
- [ ] **AC 1** (bestehendes `AnalysisProvider`-Interface, kein zweiter KI-Integrationsweg):
      `synthesize` hängt am selben Interface (`provider.ts`), `getAnalysisProvider`
      (`ai/index.ts:13-23`) bleibt der einzige Auflösungspunkt, und ein Grep über `apps/api`
      belegt **genau einen** `fetch` auf den Models-Endpunkt (`chatJson`). Scheibe F.
- [ ] **AC 2** (`temperature: 0`, JSON-strukturierte Zwischenausgabe vor dem finalen Text):
      `chatJson` pinnt `temperature: 0` und `response_format: { type: 'json_object' }` als
      Zusicherung, nicht als Parameter; der angezeigte Text entsteht durch
      `assembleSynthesis` **aus** dem validierten JSON — deterministisch, ohne zweiten
      Modellaufruf. Tests: Scheibe F Schritt 11, Scheibe C.
- [ ] **AC 3** (neue Validierungsfunktion; unbelegte Aussagen werden verworfen, **bevor** der
      Nutzer sie sieht): alle 15 Zeilen der Tabelle aus §3.3 grün; das Gate läuft im Adapter,
      nicht in der Route (kein Aufrufpfad kann es umgehen); der Route-Test aus Scheibe I weist
      nach, dass ein ungegroundeter Modell-Claim weder in `claims` noch im gerenderten Text
      landet und in `droppedCount` gezählt wird.
- [ ] **AC 4** (Prognose-Deltas nur über der Spec-5-Mindestkonfidenz — die KI-Schicht senkt den
      Beweisstandard nicht): `usableForRecommendation` für `card.*` ist exakt
      `tier !== 'insufficient' && delta.significant` (§3.2), und ein `recommendation`-Claim auf
      einen nicht-tragfähigen Fakt wird mit `insufficientEvidence` verworfen (Testzeile 4).
      Zusätzlich gepinnt: die −50-Verschiebung des Karten-Bands (Scheibe D).
- [ ] **AC 5** (ohne Vorwissen verständlich, geprüft **am Demo-Datensatz**): der
      Kürzel-Riegel aus §3.11 ist grün (kein `Bo1`/`Bo3`/`pp`/`Wilson`/`Nash`/`θ`/
      `MIN_MATCHUP_GAMES` im Demo-Text), und Konrad hat den Text im Demo-Modus **in beiden
      Sprachen** gelesen und abgenommen (`./scripts/demo-local.sh` → Demo-Login → „Mein Deck" →
      „Tipps"). Die maschinelle Prüfung ersetzt dieses Lese-Gate nicht.
- [ ] **AC 6** (BYOK identisch zur Battle-Log-Analyse, **keine zweite Schlüssel-Ablage**):
      `user_ai_settings` bleibt die einzige Ablage — `deck_synthesis` hat keine Schlüsselspalte;
      der Auflösungsblock ist **geteilt**, nicht kopiert; Test „ephemerer `apiKey` landet nicht
      in `user_ai_settings`" grün; Grep belegt, dass `encryptedApiKey`/`decryptSecret` nur an
      der bestehenden Stelle vorkommen.
- [ ] **AC 7** (Demo zeigt eine vorberechnete Synthese, **null Tokens** des Betreibers): nach
      `POST /api/demo/seed` liefert `GET /api/analysis/deck/<Deck A>` eine Zeile mit
      `source: 'demo-seed'` und `stale: false`; **in keinem Demo-Test wird `fetch` aufgerufen**;
      Deck B bleibt bewusst ohne Synthese, damit auch der Kaltstart-Zustand sichtbar ist.

**Edge Cases / Qualität**
- [ ] Kaltstart durchgespielt: kein Deck; Archetyp nicht im Field-Score; leere
      `archetype_card_stats`; leere `meta_equilibrium_runs`; leere Faktenliste ⇒ **409 ohne
      LLM-Aufruf**; `availableFactCount === 0` ⇒ Button deaktiviert mit Erklärtext.
- [ ] Fehlerpfade je Route getestet (happy path **und** mindestens ein Fehlerfall, `tdd.md`):
      fremdes/unbekanntes Deck ⇒ 404; kein Schlüssel ⇒ 400 mit der bestehenden Meldung;
      21. Erzeugung in einer Stunde ⇒ 429; unparsbare Modellantwort ⇒ 502;
      `AnalysisError`-Status (401/403/429) wird durchgereicht.
- [ ] „Alle Claims verworfen" führt zum **ehrlichen Leertext**, nie zu einem Ersatztext und nie
      zu einem 500er (§3.4).
- [ ] Cache nachweislich wirksam: zweiter `POST` ohne `force` ⇒ `cached: true` und `fetchMock`
      **nicht erneut** aufgerufen; mit `force: true` ⇒ erneuter Aufruf; `GET` ruft nie `fetch`.
- [ ] Deckwechsel während eines laufenden Aufrufs blendet kein fremdes Ergebnis ein
      (Sequenz-Guard wie `loadCardStats`, `dashboardStore.ts:410,417`).
- [ ] Sprachwechsel erzeugt **nicht** automatisch einen neuen Text (Entscheidung 1).
- [ ] Auth & Validierung auf beiden neuen Endpunkten: Session-Middleware, Zod am Eingang,
      Ownership-Prüfung, Rate-Limit auf `POST`, **keine Fakten aus dem Client**.
- [ ] Migration `0015` **generiert** (`npm run db:generate -w @pokekon/api`), gegen §3.7
      geprüft (CREATE TABLE + Unique-Index + userId-Index + CHECK; kein `ALTER`/`DROP` an
      Bestandstabellen), im PGlite-Harness angewandt, Rollback-Weg in §5 beschrieben.
- [ ] Response-Zeit von `GET /api/analysis/deck/:deckId` im PGlite-Harness notiert (§5
      Risiko 10) und in der PR festgehalten.
- [ ] Erster echter Lauf ausgewertet: Anzahl erzeugter Fakten, zurückgelieferter und
      verworfener Claims, keine abgeschnittene Antwort — Ergebnis in der PR, auch wenn es
      unangenehm ausfällt (§5 offene Frage 5).
- [ ] Keine Secrets im Diff, keine neue Dependency, kein kostenpflichtiger Dienst
      (CLAUDE.md §2.2 — GitHub Models bleibt der einzige Provider).
- [ ] `security-agent` gelaufen (**Pflicht**: neues User-Input-Processing **und** externer
      API-Call, CLAUDE.md §3) mit den Punkten aus §4 Scheibe N; danach `code-review-agent`,
      dessen Review auch gegen die Spec-Akzeptanzkriterien läuft.
- [ ] Doku aktualisiert (CLAUDE.md §2.7): `docs/features.md` (neuer §19 + Querverweise aus §8,
      §17, §18), `docs/database.md`, `docs/data-types.md`, `docs/data-flow.md`,
      `docs/ai-system.md` (die **zwei** Grounding-Prinzipien klar abgegrenzt, inkl. des
      Restrisikos aus §5 Risiko 1), `docs/demo-mode.md`,
      `docs/backend-evolution-plan.md` §6.3 (Phase B ✅).
- [ ] Commits als Conventional Commits mit Goal/Why/How-Body; PR-Beschreibung auf Deutsch mit
      Testschritten und den in §5 getroffenen Entscheidungen 1–4 explizit benannt.

**Commit-Plan (Conventional Commits — ein logischer Schritt je Commit, Scheiben aus §4)**

```
refactor(api): export loadFieldScores for reuse                      # Scheibe 0
test(shared): add failing tests for synthesis fact direction         # A
feat(shared): derive fact direction from confidence bands            # A
test(shared): add failing tests for the synthesis grounding gate     # B
feat(shared): add validateSynthesis for structured facts             # B
test(shared): add failing tests for synthesis assembly               # C
feat(shared): assemble validated claims into rendered sections       # C
test(shared): add failing tests for fact building and prompts        # D
feat(shared): build synthesis facts, canonical hash input and prompts# D
test(api): add a failing test for the deck_synthesis table           # E
feat(api): add the deck_synthesis cache table                        # E
test(api): add failing tests for the synthesize provider method      # F
refactor(api): extract the shared GitHub Models JSON call            # F
feat(api): add structured synthesis to the analysis provider         # F
test(api): add failing tests for server-side fact collection         # G
feat(api): collect synthesis facts and hash them                     # G
test(api): add failing tests for the synthesis read route            # H
feat(api): add GET /api/analysis/deck/:deckId                        # H
test(api): add failing tests for the synthesis write route           # I
feat(api): add POST /api/analysis/deck/:deckId                       # I
test(api): add a failing test for the pre-baked demo synthesis       # J
feat(api): seed a pre-baked deck synthesis for the demo deck         # J
test(web): add failing tests for the synthesis api client            # K
feat(web): add deck synthesis client and store slice                 # K
test(web): add failing tests for the deck synthesis panel            # L
feat(web): show the generated deck synthesis in the tips section     # L
docs: describe the structured synthesis alongside log analysis       # M
```

Body-Muster für jeden nicht-trivialen Commit (`.claude/rules/git-and-commits.md`):

```
Goal: <was erreicht wird>
Why:  <warum noetig - mit Spec-/Plan-Referenz>
How:  <wie umgesetzt>

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```
