# Vision: Pokekon als Archetyp-Coach

> **Status:** Rahmen-/Konzeptdokument, kein Implementierungs-Spec. Grundlage für die
> Einzel-Specs in Abschnitt 5 (alle als Entwurf ausformuliert). **Noch nicht von Konrad final
> bestätigt.**
> **Grundregel (CLAUDE.md §2.1):** Aussagen über bestehenden Code sind mit `datei:zeile`
> belegt (Stand `main` = `baebcc5`) oder ausdrücklich als **Vermutung**/**Unbekannt** markiert.
> **Verhältnis zu `specs/deck-improvement-hub-vision.md`:** Diese Vision baut darauf auf und
> verschiebt den Fokus vom *Meta-Hub* zum *Coach für einen gewählten Archetyp*.

## 1. Problem/Ziel

**Bisher:** Pokekon ist in erster Linie ein Meta-Dashboard über alle Archetypen
(`apps/web/src/store/dashboardStore.ts:64`: Tabs `overview | meta | deck`). Allgemeine
Meta-Übersichten gibt es aber schon bei Limitless und Trainer Hub, dort ist Pokekon nicht
besser. Die „beste Liste" eines Archetyps ist heute die erste zufällige Liste des am
besten bewerteten Clusters (siehe Spec 1) und keine echte Empfehlung.

**Ziel:** Pokekon wird zum **Coach für genau einen Archetyp, den der Spieler gewählt hat**
(Dogfooding-Fall: N's Zoroark ex). Die App soll drei Dinge leisten:

1. aus aktuellen Turnierdaten eine **Meta-Liste** für diesen Archetyp ableiten, gewichtet nach
   Aktualität, Event-Größe und Platzierung und optimiert gegen das erwartete Feld;
2. im **Lab-Modus** eigene Ideen weiterentwickeln (Key-Karten sperren, Kandidaten aus
   *allen* legalen Karten des Formats), ohne dass die Liste Richtung Konsens konvergiert;
3. den Spieler über seine **TCG-Live-Logs coachen**, wobei jedes Spiel wieder in Liste und
   Experimente zurückfließt.

Die Meta-Analyse bleibt erhalten, aber nur noch als **Werkzeug, gefiltert auf den gewählten
Archetyp**.

## 2. Kern-Loop

```
Archetyp wählen → Liste wählen (Meta-Liste | eigene Version | Lab-Experiment)
  → Export im TCG-Live-Format → spielen → Log einfügen
  → Match-Log automatisch + Coaching → Liste/Experiment wird neu bewertet → …
```

Die UI führt diesen Loop sichtbar. Jede Seite beantwortet eine Frage aus diesem Loop.

## 3. Leitprinzipien

1. **Statistik entscheidet, das LLM erklärt.** Kartenzahlen, Rankings und Wahrscheinlichkeiten
   berechnet deterministischer Code in `@pokekon/shared`. Das LLM formuliert Begründungen auf
   Basis berechneter Fakten (bestehendes Muster: `packages/shared/src/deckSynthesis.ts`,
   Fakten-IDs + Validierung) und schlägt im Lab höchstens *Kandidaten* vor.
2. **Kein klassisches Deep Learning.** Pro Archetyp und Format gibt es zu wenige Listen, und
   Ergebnisse sind durch Spielerstärke verzerrt. Wir setzen auf gewichtete Statistik,
   Shrinkage und Optimierung unter Nebenbedingungen, alles in TypeScript
   (CLAUDE.md §6: ein Python-ML-Service kommt frühestens in Phase 4).
3. **Unsicherheit ist sichtbar.** Karten ohne Turnierdaten werden nie als „besser" empfohlen,
   sondern als **Experiment** vorgeschlagen und über eigene Spiele gemessen.
4. **Nur legale Listen.** Jede erzeugte oder angezeigte Liste läuft durch einen Regel-Validator.
5. **Kostenlos bleiben** (CLAUDE.md §2.2). Datenquellen und Dependencies nur Free-Tier.
6. **Zwei Hebel getrennt** (CLAUDE.md §5): *Liste* (Karte tauschen) vs. *Spiel* (Zug anders
   spielen). Meta-Liste und Lab betreffen die Liste, das Coaching das Spiel.

## 4. Datenlage heute (belegt)

- **Online-Turniere, Runde für Runde: vorhanden.** `apps/api/src/jobs/syncMeta.ts:43`
  (`LIMITLESS_BASE = 'https://play.limitlesstcg.com'`), Standings `:323-324`, Pairings `:334`,
  daraus `matchResults` pro Standing (`:170`).
- **In-Person- und Bo3-Events: nur klassifiziert, nicht importiert** (`syncMeta.ts:350-378`,
  `persistClassificationOnly`). Meta-Reads filtern auf `isOnline AND swissMode = 'BO1'`
  (`apps/api/src/db/schema.ts:303-309`).
- **Limitless Labs** (Regionals, ICs, Worlds): **kein Verweis im Code.** Große Events fehlen.
- **Event-Tier:** `tournaments` hat kein Tier-Feld. `eventTypeValues` (`schema.ts:144`) gilt nur
  für persönliche Logs.
- **Rotation:** `ROTATION_DATE = '2026-03-26'` (`packages/shared/src/season.ts:6`). Set-Release-
  Grenzen innerhalb des Formats gibt es nicht.
- **Kartendatenbank / Regelprüfung:** **nicht vorhanden** (kein Treffer für Regulation Mark,
  ACE SPEC, TCGdex, pokemontcg.io in `apps/` und `packages/`).
- **Export ins TCG-Live-Format:** **nicht vorhanden**. Es gibt nur einen Import
  (`apps/web/src/lib/deckImport.ts`).
- **Optimierung:** Es gibt einen LP-Löser (`packages/shared/src/simplex.ts:89`,
  `solveStandardFormLp`), aber keine Ganzzahl-Optimierung.

## 5. Einzel-Specs

Jede Spec hat eine eigene Datei in `specs/`. Danach folgt jeweils ein Plan in `.claude/plans/`.

| # | Spec | Datei | Kern |
|---|---|---|---|
| 1 | Fundament-Fixes am Cluster-Ranking | `archetype-list-foundation.md` | deterministisch, Medoid, Prior-Bug |
| 2 | Kartenkatalog, Validator, TCG-Live-Export | `card-catalog-and-validator.md` | alle Karten (EN/DE), Regeln, Funktions-Tags; **Export bereits umgesetzt** |
| 3 | Große Events über Limitless Labs | `major-events-import.md` | Regionals/ICs/Worlds, **zurückgestellt** |
| 4 | Gewichtungsmodell | `weighting-model.md` | Aktualität × Tier × Platzierung × Set, effektive Stichprobe |
| 5 | Meta-Liste | `meta-list-optimizer.md` | gewichteter Konsens, Flex-Optimierung, Backtest |
| 6 | Lab-Modus | `lab-mode.md` | Sperren, Kandidaten aus allen Karten, Experimente |
| 7 | UI/UX „Archetyp zuerst" | `archetype-first-ui.md` + Wireframe | Navigation, Screens, Umzugsplan, Leerzustände, Demo |
| 8 | Coaching-Loop | `coaching-loop.md` | ein Einfügen, Kontext, wiederkehrende Fehler |

## 6. Reihenfolge und Abhängigkeiten

```
Spec 1 ──► Spec 2 ──► Spec 4 ──► Spec 5 ──► Spec 6
             │          ▲            │
             │          │            └──────────► Spec 8 (braucht nur Spec 2)
             └► Spec 3 ─┘  (optional, blockiert durch Limitless-Freigabe)

Spec 7 Scheibe 1–2 (Navigation, Rückbau) parallel ab sofort;
Scheiben 3–6 docken an Spec 2, 5, 6, 8 an
```

**Empfohlene Reihenfolge der Umsetzung:** 1 → 7 (Scheibe 1–2) → 2 → 8 → 4 → 5 → 6.
Spec 3 ist zurückgestellt. Der TCG-Live-Export aus Spec 2 ist vorgezogen und fertig.
Begründung: Nach Spec 1, dem UI-Gerüst, dem Katalog und dem Coaching-Loop ist der Kern-Loop
bereits benutzbar (spielen, Log einfügen, lernen). Meta-Liste und Lab machen ihn danach klüger.

## 7. Querschnittsthemen

### 7.1 Betrieb: Jobs und Caching
Heute gibt es die Jobs `sync-meta`, `backfill-winrates`, `compute-card-stats` und
`compute-equilibrium` (`apps/api/package.json:17-20`) sowie einen manuellen Sync über
`POST /api/meta/sync` (`apps/api/src/routes/meta.ts:320`). Ob ein Railway-Cron sie
automatisch startet, ist im Repo **nicht belegt** (`railway.json` enthält keinen Cron).

Ziel-Kette:

```
täglich:            syncCards (Spec 2)
nach Turnierende:   syncMeta → computeCardStats → computeEquilibrium → computeMetaLists (Spec 5)
wöchentlich:        Backtest (Spec 5 §8); syncMajors nur falls Spec 3 wieder aufgenommen wird
bei Bedarf:         Meta-Liste mit lokalem Feld (Cache nach Feld-Hash)
```

- **Auslöser:** Cron alle 6 Stunden über die offene Play-API, ohne Key. Ein Webhook „Turnier
  beendet" wäre mit einem Limitless-Key möglich (Spec 3 §8), ist aber nicht nötig.
- **Kosten:** alles im bestehenden Railway-Setup, keine neuen Dienste (CLAUDE.md §2.2).
- **Datenstand sichtbar:** Jede berechnete Ansicht zeigt ihren Stand. Älter als 3 Tage gibt
  einen Hinweis (Spec 7 §7).

### 7.2 i18n
Alle neuen Texte in DE und EN im selben PR. Neue Namespaces siehe Spec 7 §10. Kartennamen
kommen aus dem Katalog in der Sprache der Oberfläche, soweit vorhanden.

### 7.3 Sicherheit
Pflicht-Durchlauf des `security-agent` (CLAUDE.md §3) für: Katalog-Sync (Spec 2), Labs-Import
(Spec 3), LLM-Ideengeber im Lab (Spec 6), Coaching-Endpunkt (Spec 8).

### 7.4 Doku
Jede Spec aktualisiert `docs/` im selben Zug (CLAUDE.md §2.7, Docs-Gate). Zusätzlich:
`docs/features.md` bekommt mit Spec 7 eine neue Gliederung nach dem Kern-Loop.

### 7.5 Demo-Modus
Jede Spec mit sichtbarer Funktion ergänzt den Demo-Seed (`apps/api/src/lib/demoSeed.ts`),
Details in Spec 7 §8.

## 8. Offene Fragen – Stand der Klärung

| # | Frage | Stand |
|---|---|---|
| 1 | Kartendaten-Quelle | **Empfehlung TCGdex:** quelloffen (MIT), ohne Key, mehrsprachig inklusive Deutsch. Noch zu prüfen: TCG-Live-Set-Kürzel (Spec 2 §3) |
| 2 | Limitless-Labs-Zugriff | **Zurückgestellt.** Keine Anfrage nötig: Die Play-API braucht für Turnierdaten keinen Key, Spec 3 ist optional. Ohne Webhook läuft der Sync per Cron (§7.1) |
| 3 | Startwerte der Gewichtung | **Entschieden** nach kritischer Prüfung (Spec 4 §3.1): Tier-Faktoren gesenkt, Platzierung nicht für Performance-Werte, neue Spieler-Dämpfung |
| 4 | Ein oder mehrere Archetypen | **Vorschlag:** ein aktiver Archetyp plus Wechsler. Daten pro Archetyp bleiben erhalten (Spec 7 §5.1) |
| 5 | Funktions-Tags | **Vorschlag:** v1 regelbasiert plus manuell, LLM höchstens als einmalige Vorschlagsrunde mit Freigabe (Spec 2 §4.3) |
| 6 | Manueller Match-Log | **Vorschlag:** bleibt als Fallback am ＋-Knopf (Spec 8 §3) |

Alle Einzel-Specs enden mit **Entscheidungen (Default 2026-09-23, überschreibbar)** statt mit
offenen Fragen. Kein Agent muss raten.

## 9. Umsetzung mit Agenten (Leitfaden)

Geprüft gegen den Workflow in `CLAUDE.md` §3 und die Agenten in `.claude/agents/`.

### 9.1 Pro Spec
```
Spec lesen → plan-agent (Plan in .claude/plans/<slug>.md, Belege neu verifizieren)
  → Konrad gibt den Plan frei
  → pro Scheibe: Tests aus den ACs zuerst → Implementierung → Gates grün → Commit
  → code-review-agent (+ security-agent, wo die Spec es verlangt) → docs-agent → PR
```

### 9.2 Regeln, die das Ergebnis mit Agenten verbessern
1. **Eine Spec = ein Branch = ein PR.** Große Specs werden über ihre Umsetzungsscheiben in
   mehrere Commits geteilt, jede Scheibe ist für sich grün. Kleine, prüfbare Schritte halten
   den Kontext des Agenten klein und Fehler früh sichtbar.
2. **Akzeptanzkriterien sind der Vertrag.** Jede Scheibe nennt ihre ACs. Der Test-Agent
   schreibt daraus zuerst fehlschlagende Tests, der Implementierer macht sie grün. Kein AC ohne
   Test, außer ausdrücklich manuelle Abnahme.
3. **Belege veralten.** Alle `datei:zeile`-Angaben gelten für `baebcc5`. Der Plan verifiziert
   jede Angabe neu, bevor er sie übernimmt (steht jetzt auch im `plan-agent`).
4. **Keine offenen Fragen im Plan.** Specs haben Default-Entscheidungen. Weicht der Code davon
   ab, stoppt der Agent und fragt, statt zu raten.
5. **Reine Logik zuerst.** Statistik und Optimierung (Spec 1, 4, 5 S1–S3, 6 S2–S4) liegen als
   reine Funktionen in `packages/shared`. Dort funktioniert testgetriebenes Arbeiten am besten:
   synthetische Daten, deterministische Ergebnisse, schnelle Tests.
6. **Kontext frisch halten.** Pro Spec eine neue Claude-Code-Sitzung. Übergaben laufen über
   Spec, Plan und Commits, nicht über lange Chat-Verläufe.
7. **Parallelisieren nur ohne Überschneidung.** Spec 1 (shared/api) und Spec 7 Scheibe 1
   (web) berühren kaum dieselben Dateien und können in getrennten Git-Worktrees parallel
   laufen. Alles andere nacheinander.
8. **Mensch am Ende jeder Spec:** Konrad prüft den PR und die UI auf dem Handy. Manuelle
   Abnahmen (z. B. TCG-Live-Import) stehen in den ACs.

### 9.3 Aktualisierte Agenten (im selben Commit wie diese Specs)
`plan-agent`, `code-review-agent`, `security-agent`, `data-analyst-agent` und
`tcg-meta-project-head` beschrieben noch die alte Architektur (reine Client-App mit Dexie). Der
`security-agent` hätte serverseitige Risiken (Autorisierung, SSRF, Secrets, LLM-Ausgaben)
übersehen. Sie sind jetzt auf Hono, PostgreSQL und Drizzle ausgerichtet. Die hartkodierten
Pfade `/Users/konrad.thiemann/tcg/...` (Plan-Ablage, Agent-Memory) sind **unverändert**, weil
nur Konrad weiß, ob sie auf seinem Rechner stimmen. **Bitte prüfen.**

