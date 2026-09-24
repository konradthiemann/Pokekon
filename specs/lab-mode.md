# Spec 6: Lab-Modus – eigene Ideen weiterentwickeln

> **Status:** Entwurf, wartet auf Freigabe durch Konrad.
> Kontext: Teil 6 von 8 aus [`specs/archetype-coach-vision.md`](./archetype-coach-vision.md).
> Belege: Stand `main` = `baebcc5`.
> **Voraussetzung:** Spec 2 (Katalog, Tags, Validator), Spec 4 (Gewichte), Spec 5 (Scoring und
> Löser werden wiederverwendet).

## 1. Problem

Konrad will N's Zoroark ex auch **anders** spielen als das Meta, z. B. mit einer 2-2
Darmanitan-Line, 4 N's PP Up und Power Glass, und dazu Ideen wie Explorer's Guidance prüfen.
Dafür gibt es heute nichts:

- Alle Empfehlungen ziehen Richtung Turnier-Konsens (Deck-Vergleich:
  `apps/web/src/components/recommendations/DeckComparisonPanel.tsx`).
- Es kommen nur Karten in Frage, die im Archetyp gespielt werden. Karten, die niemand in
  Zoroark spielt, tauchen nie auf.
- Die LLM-Regel „keine Karten vorschlagen, die nicht im Log sichtbar waren" (CLAUDE.md §2.6)
  verbietet zu Recht, dass die Battle-Log-Analyse Karten erfindet. Einen erlaubten Ort für
  Kartenideen gibt es aber nicht.

## 2. Ziel

Ein Modus, in dem der Nutzer **seine eigene Idee** schrittweise verbessert:

- Key-Karten werden **gesperrt**.
- Vorschläge dürfen aus **allen legalen Karten** kommen.
- Die Liste bleibt nah an der Idee. Sie konvergiert **nicht** zur Meta-Liste.
- Jeder Vorschlag ist nach Beweislage gekennzeichnet. Vorschläge ohne Daten werden als
  **Experiment** getestet und mit eigenen Spielen gemessen.

## User Stories

- Als Spieler will ich meine eigene Deck-Idee **weiterentwickeln**, ohne dass sie zur
  Meta-Liste wird.
- Als Spieler will ich **Key-Karten sperren**, die nie angetastet werden.
- Als Spieler will ich Vorschläge auch aus Karten bekommen, **die im Meta niemand spielt**.
- Als Spieler will ich jeden Vorschlag **als Experiment testen** und sehen, ob er mir wirklich hilft.

## 3. Begriffe

- **Lab-Projekt:** eine Idee, z. B. „Zoroark Darmanitan". Gehört zu einem Archetyp und startet
  von einer Liste (Import, eigene Version oder Kopie der Meta-Liste).
- **Sperre:** pro Karte `exakt n` oder `mindestens n`.
- **Vorschlag:** ein Tausch (maximal k Karten rein, k raus), mit Beweisstufe.
- **Experiment:** ein angenommener Vorschlag. Es ist eine neue Deck-Version plus Hypothese und
  wird über eigene Spiele gemessen.

## 4. Datenmodell

Neue Tabellen, jeweils `user_id`-scoped wie alle Domänentabellen:

- `lab_projects`: `id`, `user_id`, `archetype_id`, `name`, `idea` (Freitext, optional),
  `deck_id` (verweist auf `decks`, `apps/api/src/db/schema.ts:165`), `created_at`, `archived_at`
- `lab_locks`: `project_id`, `name_key`, `mode` (`exact` | `min`), `count`
- `lab_experiments`: `id`, `project_id`, `from_snapshot_id`, `to_snapshot_id` (beide auf
  `deck_snapshots`, `schema.ts:201`), `changes` (JSONB), `hypothesis`, `evidence_tier`,
  `status` (`active` | `concluded` | `abandoned`), `started_at`, `concluded_at`, `verdict`

Versionen nutzen die bestehenden Snapshots. Match-Logs hängen schon heute über
`deckSnapshotId` an einer Version (`schema.ts:239`). Die Messung eines Experiments braucht
also kein neues Log-Feld.

## 5. Kandidaten und Beweisstufen

Kandidat ist jede legale Karte (Spec 2), die nicht gesperrt ist. Bewertet wird in drei Stufen:

| Stufe | Quelle | Aussagekraft |
|---|---|---|
| **A – Archetyp-Daten** | Karte wird im Archetyp gespielt: Score aus Spec 5 §5 | belastbar (mit Band) |
| **B – Verwandte Decks** | Co-Occurrence über **alle** Archetypen im Fenster, gewichtet mit `w_konsens` (Spec 4 §3.2): `lift(k) = P(k \| Liste enthält eine der gesperrten Nicht-Kern-Karten) / P(k)`. Beispiel: Welche Karten spielen Decks, die auch Power Glass oder Darmanitan spielen? | Hinweis |
| **C – Hypothese** | Funktions-Tags (Spec 2 §4.3) oder LLM-Ideengeber (§6) | ungeprüft |

**Tag-Lücke:** Das Tag-Profil der eigenen Liste (Summe der Tags, gewichtet mit der Anzahl) wird
mit dem gewichteten Profil erfolgreicher Listen des Archetyps verglichen. Fehlt z. B.
`search_pokemon` im Vergleich deutlich, werden Karten mit diesem Tag Kandidaten der Stufe C.
Das ist eine grobe Heuristik und wird so gekennzeichnet.

## 6. LLM als Ideengeber (eigener Pfad)

- **Getrennt von der Battle-Log-Analyse:** eigener Prompt, eigenes Modul
  (`packages/shared/src/labIdeas.ts`), eigener Validierungsvertrag. CLAUDE.md §2.6 bleibt für
  die Log-Analyse **unverändert**. Die CLAUDE.md bekommt einen Satz, der diese Trennung festhält.
- **Eingabe:** aktuelle Liste, gesperrte Karten mit Kartentext (EN), Tag-Lücken, das Ziel aus
  `idea`, Top-Matchups im Feld.
- **Ausgabe (JSON):** bis zu 8 Kandidaten `{ name, count, replaces[], rationale }`.
- **Validierung, bevor irgendetwas angezeigt wird:**
  1. Der Name muss im Katalog existieren (`name_key`) und legal sein. Sonst wird er verworfen.
  2. Die resultierende Liste muss den Validator bestehen.
  3. Sperren dürfen nicht verletzt werden.
  4. `rationale` darf keine Zahlen enthalten (Muster aus `deckSynthesis.ts`, foreignNumber-Prüfung).
- `temperature = 0`, BYOK wie bestehend (`apps/api/src/ai/provider.ts`). Ohne Key entfällt nur
  diese Quelle. Stufe A und B funktionieren weiter.
- Alle LLM-Kandidaten sind immer **Stufe C** und werden nie als „besser" bezeichnet.

## 7. Optimierung im Lab

Wiederverwendung des Lösers aus Spec 5 §6 mit anderem Ziel:

```
maximiere  Σ score(k,c) × x(k,c)  −  λ × Abstand(neue Liste, eigene Liste)
unter      Sperren, Validator, höchstens k Änderungen pro Runde
```

- **Abstand zur eigenen Liste**, nicht zum Konsens. Das ist der Kern des Unterschieds zur
  Meta-Liste.
- `k` ist einstellbar (Default 2, max. 4). `λ` ist intern.
- Stufe-C-Kandidaten bekommen einen neutralen Score. Sie erscheinen als eigene Liste
  „Ideen zum Testen", nicht als Ergebnis der Optimierung.
- Die Ausgabe sind **höchstens 3 Vorschläge** pro Runde, jeweils mit Beweisstufe und
  Begründung. Keine komplett neue Liste.

## 8. Experimente messen

- Nimmt der Nutzer einen Vorschlag an, entsteht ein neuer Snapshot plus Experiment
  (`status = active`). Diese Version wird zur aktiven Liste für den Export (Spec 7) und für
  neue Logs (Spec 8).
- **Vergleich:** Win-Rate der neuen Version vs. der Ausgangsversion, **je Matchup** und auf das
  aktuelle Feld umgewichtet (`computeFieldScores`, `packages/shared/src/fieldWinRate.ts:107`).
  So verfälscht ein zufällig anderes Gegnerfeld den Vergleich weniger.
- **Ehrlichkeit über Stichproben:** Die UI zeigt das Wilson-Band und eine Schätzung, wie viele
  Spiele noch nötig sind, um einen Unterschied von 5 bzw. 10 Prozentpunkten zu erkennen.
  Unter 15 Spielen pro Version gibt es kein Urteil, nur „läuft".
- **Abschluss:** Der Nutzer schließt ein Experiment mit `verdict`: `keep` | `revert` |
  `inconclusive`. Bei `revert` wird die Ausgangsversion wieder aktiv.

## 9. Beispiel-Durchlauf (Dogfooding)

1. Konrad legt „Zoroark Darmanitan" an, startet von seiner Liste und sperrt die
   Darmanitan-Line (2-2), 4 N's PP Up und Power Glass (je `exakt`).
2. Das Lab zeigt:
   - Stufe A: Karten aus der Zoroark-Meta-Liste, die zur Idee passen, mit Band
   - Stufe B: Karten, die in Listen mit Power Glass oder Darmanitan auffällig oft vorkommen
   - Stufe C: z. B. Explorer's Guidance als LLM-Idee, geprüft auf Legalität, mit Begründung
3. Konrad nimmt „1 Explorer's Guidance statt 1 Ultra Ball" an → Experiment startet.
4. Nach 20 Spielen zeigt das Lab den Vergleich je Matchup, Konrad entscheidet `keep`.

Ob die genannten Karten zusammen legal sind (z. B. Power Glass als ACE SPEC neben einem
anderen ACE SPEC), prüft der Validator. Das Beispiel behauptet es nicht.

## Umsetzungsscheiben

| Scheibe | Inhalt | ACs |
|---|---|---|
| S1 | Tabellen `lab_projects`, `lab_locks`, `lab_experiments` + CRUD-Routen mit Routentests | – |
| S2 | Stufe A (Scores aus Spec 5) + Löser mit Sperren, Abstand und max. k Änderungen | 1, 2 |
| S3 | Stufe B: Co-Occurrence über alle Archetypen | 3 |
| S4 | Stufe C: Tag-Lücke | 3 |
| S5 | LLM-Ideengeber als eigener Pfad + Validierung + CLAUDE.md-Satz | 4, 7, 8 |
| S6 | Experimente: Versionierung, Vergleich je Matchup, Urteil | 5, 6 |
| S7 | UI; erfolgt in Spec 7 Scheibe 5 | – |

S5 braucht den `security-agent` (neuer LLM-Pfad).

## 10. Akzeptanzkriterien

1. Sperren werden nie verletzt (Property-Test).
2. Pro Runde höchstens k Änderungen, die Liste besteht immer den Validator.
3. Ein Lab-Projekt mit gesperrten Karten, die in *keiner* Turnierliste vorkommen, liefert
   trotzdem Vorschläge (Stufe B/C). Kein leerer Zustand ohne Erklärung.
4. Ein LLM-Vorschlag mit unbekanntem Namen, illegaler Karte oder Zahl im Text wird verworfen,
   getestet mit präparierten Antworten.
5. Das Experiment verknüpft Logs automatisch über die aktive Version.
6. Der Vergleich zeigt pro Matchup n, WR und Band. Unter 15 Spielen gibt es kein Urteil.
7. Ohne LLM-Key funktionieren Stufe A und B vollständig.
8. `security-agent` für den neuen LLM-Pfad, Gates grün, Doku inkl. CLAUDE.md-Satz zu §2.6.

## 11. Out of Scope

- Keine automatisch generierten Komplettlisten „von null".
- Keine Simulation.
- Kein Teilen von Lab-Projekten mit anderen Nutzern in v1.

## 12. Entscheidungen (Default 2026-09-23, überschreibbar)

1. `k = 2` Änderungen pro Runde als Default, einstellbar bis 4.
2. Abgeschlossene Experimente werden in v1 **nicht** mit anderen Nutzern geteilt.
