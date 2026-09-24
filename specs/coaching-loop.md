# Spec 8: Coaching-Loop über TCG-Live-Logs

> **Status:** Entwurf, wartet auf Freigabe durch Konrad.
> Kontext: Teil 8 von 8 aus [`specs/archetype-coach-vision.md`](./archetype-coach-vision.md).
> Belege: Stand `main` = `baebcc5`.
> **Voraussetzung:** Spec 2 (deutsche Kartennamen). Nutzt Spec 5/6, falls vorhanden, funktioniert
> aber auch ohne.

## 1. Problem

Die Bausteine für Coaching existieren, sind aber nicht zu einem Ablauf verbunden:

- Parser für deutsche TCG-Live-Logs: `parseBattleLog(log, myPlayerName)`
  (`packages/shared/src/battleLogParser.ts:363`).
- Vorbefüllung aus dem Log: Gegner-Archetyp raten, Ergebnis ablesen
  (`packages/shared/src/battleLogPrefill.ts:149`, `:198`, `:209`).
- LLM-Analyse mit Evidence-Pflicht: `POST /api/analysis/log`
  (`apps/api/src/routes/analysis.ts:171-198`), Validierung `battleAnalysis.ts:159`.
- Persistenz: `opponent_logs.battleLog`/`.analysis` (`apps/api/src/db/schema.ts:242-243`),
  geparste Züge in `match_log_parsed` (`schema.ts:417`).

Lücken:
1. Die Analyse kennt **weder die eigene Liste noch das Matchup**. Sie bekommt nur Log und
   Spielernamen (`analysis.ts:185-188`).
2. Log einfügen, Match anlegen und Analyse starten sind getrennte Schritte.
3. Es gibt **keine Auswertung über mehrere Spiele**. Jede Analyse steht für sich.
4. Der Spielername liegt im `localStorage` (`tcg-player-name`,
   `apps/web/src/components/deck/DeckTipsSection.tsx:29`), außerhalb der `KEYS`-Map in
   `preferences.ts` und nicht serverseitig. Auf einem zweiten Gerät fehlt er.
5. Die Analyse liefert `deckSuggestions` (`battleAnalysis.ts:24-29`). Das sind
   **Listen**-Vorschläge aus einem einzelnen Spiel. Sie konkurrieren mit Meta-Liste und Lab, die
   auf viel mehr Daten beruhen.

## 2. Ziel

**Ein Einfügen, alles erledigt:** Log einfügen → Match angelegt (Gegner, Ergebnis, aktive
Version, Experiment) → Analyse mit Kontext → wiederkehrende Fehler über viele Spiele →
Rückfluss in Matchups, Meta-Liste und Lab.

## User Stories

- Als Spieler will ich **ein Log einfügen**, und alles andere passiert automatisch.
- Als Spieler will ich wissen, welche Fehler ich **immer wieder** mache, nicht nur in einem Spiel.
- Als Spieler will ich, dass die Analyse **meine Liste und das Matchup kennt**.

## 3. Ablauf

```
[Log einfügen]
  → Duplikat-Prüfung (Hash des Logs)
  → parseBattleLog mit gespeichertem Spielernamen
  → prefill: Ergebnis, Gegner-Archetyp (+ Konfidenz)
      · 'unique'    → direkt übernehmen
      · 'ambiguous' → Auswahl aus den Kandidaten (ein Tap)
      · 'none'      → Archetyp-Auswahl
  → opponent_log anlegen: aktive Version (deckSnapshotId), Experiment, eventType 'Online',
    bestOf 'BO1' (Default für TCG-Live-Ladder, änderbar), Datum heute
  → match_log_parsed speichern (parserVersion, CLAUDE.md §5)
  → Analyse starten (asynchron, nur mit LLM-Key)
  → Ergebnis-Karte: Ergebnis, 3 wichtigste Momente, Fehler, Link zum Detail
```

- **Neue Route** `POST /api/coaching/games` fasst die Schritte serverseitig zusammen. Die
  bestehende Route `/api/analysis/log` bleibt für Rückwärtskompatibilität bestehen.
- **Ohne LLM-Key** funktioniert alles außer der Textanalyse: Match-Log, Zugstatistik,
  Prize-Verlauf und Matchup-Rückfluss.
- **Manueller Match-Log** bleibt als Fallback erhalten (Spiele ohne Log, z. B. am Tisch).

## 4. Analyse mit Kontext

Der Prompt (`buildAnalysisPrompts`, `battleAnalysis.ts:81`) bekommt zusätzlich:
- die gespielte Liste (Namen und Anzahl, EN und DE über den Katalog aus Spec 2),
- das Matchup: gewichtete Feld-WR und Band gegen diesen Gegner, falls vorhanden,
- ein laufendes Experiment: die Hypothese und die getauschten Karten.

**Unverändert (CLAUDE.md §2.6):** wörtliche Evidence aus dem Log für jede Aussage,
`temperature = 0`, keine Karten, die nicht im Log sichtbar waren. Die Liste im Kontext dient
dem **Verständnis** („Konrad hatte noch 2 Boss's Orders im Deck"), nicht als Quelle für neue
Kartenvorschläge.

**Rollentrennung für Listenvorschläge:** `deckSuggestions` aus Einzelspielen werden nicht mehr
als Empfehlung angezeigt. Sie werden als **Signal** gespeichert und fließen gebündelt in den
Lab-Modus ein („in 4 von 10 Spielen gegen X fehlte dir Y"). Listenentscheidungen trifft die
Statistik (CLAUDE.md §5: Hebel *Liste* vs. *Spiel* sauber trennen).

## 5. Wiederkehrende Fehler

- `BattleAnalysisPlay` (`battleAnalysis.ts:8-14`) bekommt ein Pflichtfeld `category`:
  `sequencing` | `resource_management` | `prize_mapping` | `gust_timing` | `energy_attachment` |
  `bench_management` | `hand_disruption` | `tempo` | `other`
- Das LLM wählt die Kategorie, die Validierung verwirft unbekannte Werte (dann `other`).
- **Aggregation deterministisch**, ohne LLM: pro Nutzer und Archetyp die Häufigkeit je
  Kategorie über die letzten N Spiele (Default 20), getrennt nach Matchup, jeweils mit 1–2
  Beispiel-Zitaten aus den Logs.
- Anzeige: „Deine Top 3 Baustellen" mit Trend (häufiger oder seltener als in den 20 Spielen
  davor).
- Alte Analysen ohne `category` zählen als `other` oder werden auf Wunsch neu analysiert.

## 6. Rückfluss

- **Matchups:** eigene Bilanz pro Gegner, geblendet mit den Meta-Daten über
  `blendWithPersonalPrior` (`packages/shared/src/personalPriorBlend.ts:55`, Mindestspiele
  `DEFAULT_MIN_OWN_GAMES = 5`, `:12`).
- **Lab:** Die Experiment-Auswertung (Spec 6 §8) liest die Logs der Versionen.
- **Meta-Liste mit lokalem Feld:** Der Prior kann optional einfließen (bestehender Schalter
  `usePersonalPrior`).

## 7. Einstellungen

- TCG-Live-Spielername serverseitig (neues Feld in den Nutzereinstellungen), einmalig im
  Onboarding abgefragt. Einmalige Migration aus `localStorage['tcg-player-name']`.
- Spielernamen des Gegners im gespeicherten Log: kein neues Risiko, weil das Log schon heute
  gespeichert wird. Der `security-agent` prüft trotzdem den neuen Endpunkt (CLAUDE.md §3).

## Umsetzungsscheiben

| Scheibe | Inhalt | ACs |
|---|---|---|
| S1 | TCG-Live-Spielername serverseitig + einmalige Migration aus localStorage | 8 |
| S2 | `POST /api/coaching/games`: Parsen, Vorbefüllung, Duplikat-Prüfung, Match-Log | 1, 2, 3, 4 |
| S3 | Kontext (Liste, Matchup, Experiment) im Analyse-Prompt | 5 |
| S4 | Pflichtfeld `category` + Validierung | 6 |
| S5 | Aggregation „Top-3-Baustellen" | 7 |
| S6 | UI; erfolgt in Spec 7 Scheibe 6 | – |

S2 und S3 brauchen den `security-agent` (neuer Endpunkt mit Nutzer-Input, LLM-Kontext).
Für S2 und S3 werden **echte deutsche Logs** als Test-Fixtures gebraucht (CLAUDE.md §5).

## 8. Akzeptanzkriterien

1. Ein echter deutscher TCG-Live-Log (von Konrad) ergibt mit einem Einfügen: Match-Log mit
   Ergebnis, Gegner-Archetyp, aktiver Version und Datum.
2. Zweimal derselbe Log → kein zweiter Match-Log, Hinweis „bereits importiert".
3. Bei mehrdeutigem Gegner-Archetyp: Auswahl mit höchstens 3 Kandidaten.
4. Ohne LLM-Key: Match-Log und Zugstatistik werden angelegt, die Textanalyse ist als „nicht
   verfügbar" markiert, nicht als Fehler.
5. Die Analyse enthält keinen Kartennamen, der nicht im Log vorkommt (bestehender Test bleibt
   grün, neuer Test mit Listen-Kontext).
6. Jede `play` hat eine gültige `category`.
7. „Top 3 Baustellen" rechnet deterministisch aus gespeicherten Analysen (Test mit Fixture).
8. Spielername ist nach Login auf einem zweiten Gerät vorhanden.
9. Gates grün, `security-agent` durchlaufen, Doku aktualisiert.

## 9. Out of Scope

- Kein automatischer Import aus TCG Live (es gibt keine offizielle Schnittstelle, bleibt
  Copy & Paste).
- Keine Englisch-Unterstützung des Parsers in dieser Spec (eigene Spec, falls gewünscht).
- Keine Replay-Visualisierung.

## 10. Entscheidungen (Default 2026-09-23, überschreibbar)

1. **Bo1** ist der Default für eingefügte Logs, änderbar direkt auf der Ergebnis-Karte.
2. Alte Logs werden **nicht automatisch** neu analysiert (würde den eigenen LLM-Key belasten).
   Sie zählen als `other`, bis der Nutzer sie einzeln neu analysieren lässt.
