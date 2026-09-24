# Spec 5: Meta-Liste (gewichteter Konsens + Optimierer)

> **Status:** Entwurf, wartet auf Freigabe durch Konrad.
> Kontext: Teil 5 von 8 aus [`specs/archetype-coach-vision.md`](./archetype-coach-vision.md).
> Belege: Stand `main` = `baebcc5`.
> **Voraussetzung:** Spec 1, 2, 4. Spec 3 optional.

## 1. Problem

Heute ist die „beste Liste" eine reale Turnierliste aus dem am besten bewerteten Cluster
(`packages/shared/src/clusterRanking.ts:51-66`). Damit sind drei Fragen unbeantwortet:

1. Welche Karten sind **Kern** des Archetyps, welche **flexibel**?
2. Welche Flex-Karten lohnen sich **gegen das aktuelle Feld**?
3. **Warum** steht eine Karte drin, und wie sicher ist das?

Die vorhandenen Kartenwerte helfen nur teilweise. `computeArchetypeCardStats`
(`packages/shared/src/cardPerformance.ts:261`) vergleicht die **Platzierungen** von Listen mit
und ohne Karte (Mann-Whitney, `:82`). Das ist ein Wert pro Karte, aber **nicht pro Matchup**
und **nicht pro Kopienzahl**.

## 2. Ziel

Pro Archetyp eine **legale 60-Karten-Liste**, die

- den gewichteten Konsens der aktuellen Listen abbildet (Kern),
- die Flex-Slots gegen das erwartete Feld optimiert,
- jede Flex-Entscheidung mit Fakten und Konfidenz begründet,
- reproduzierbar ist: gleiche Daten und Parameter ergeben dieselbe Liste.

## User Stories

- Als Spieler will ich eine Meta-Liste, die **das aktuelle Feld** berücksichtigt, nicht nur das,
  was am häufigsten gespielt wird.
- Als Spieler will ich bei jeder Flex-Karte verstehen, **warum** sie drin ist und wie sicher
  das ist.
- Als Spieler will ich sehen, **was sich seit letzter Woche geändert** hat und wo meine Liste
  abweicht.

## 3. Eingaben

- Standings des Archetyps im Fenster, mit Gewicht `w` (Spec 4) und `matchResults`
- Kartenkatalog und Validator (Spec 2)
- Feld: global (gewichtete Anteile) **oder** lokales Feld des Nutzers
  (`apps/web/src/lib/preferences.ts`, bestehende Logik in `clusterFieldScore.ts`)
- Optional: persönlicher Prior (`personalPriorBlend.ts:55`)

## 4. Schritt A: Kern und Flex

Für jede Karte (`name_key`) und jede Kopienzahl c ∈ {1…4}:

```
anteil(k, ≥c) = Σ w_konsens[Listen mit ≥ c Kopien von k] / Σ w_konsens[alle Listen]
```

- **Kern-Stufe:** `anteil(k, ≥c) ≥ KERN_SCHWELLE` (Start: 0,85). Die Kern-Kopienzahl einer
  Karte ist die höchste Stufe c, die diese Schwelle erreicht.
- **Flex-Kandidaten:** alle Stufen mit `anteil ≥ FLEX_MIN` (Start: 0,05), die keine Kern-Stufen
  sind.
- **Flex-Budget** = 60 − Summe der Kern-Kopien.
- **Struktur-Leitplanken aus den Daten:** Anzahl Pokémon, Trainer und Energie müssen im
  gewichteten 10.–90.-Perzentil der Listen liegen. So entstehen keine Listen, die formal legal,
  aber untypisch sind (z. B. 3 Energie in einem Deck, das sonst 8 spielt).

## 5. Schritt B: Wert einer Flex-Stufe

Pro Stufe (k, c) und Gegner-Archetyp g:

```
δ(k,c,g) = WR(Spiele gegen g | Liste hat ≥ c Kopien) − WR(… | < c Kopien)
```

- Beide WR sind mit `w_performance` gewichtet, also **ohne** Platzierungsfaktor (Spec 4 §3.2),
  und nutzen die `matchResults` der Standings
  (`apps/api/src/lib/archetypeSynthesisFacts.ts:112`, Feld `matchResults`).
- **Shrinkage Richtung 0:** `δ̂ = δ × n_eff / (n_eff + SHRINK_K)`, Start `SHRINK_K = 40` Spiele.
  Kleine Stichproben werden damit fast neutral statt zufällig extrem.
- **Feldwert:** `V(k,c) = Σ_g feldanteil(g) × δ̂(k,c,g)`
- **Prior aus der Spielrate:** Spieler wissen kollektiv etwas. Deshalb geht in den Score auch
  der gewichtete Anteil ein:
  `score(k,c) = α × anteil(k,≥c) + (1 − α) × normiert(V(k,c))`, mit
  `α = SHRINK_K / (SHRINK_K + n_eff)`. Bei wenigen Daten folgt die Liste also dem Konsens, bei
  vielen Daten der Performance.
- **Wichtig: Das ist Korrelation, keine Kausalität.** Starke Spieler spielen vielleicht
  bestimmte Karten. Deshalb werden die Werte nie als „Karte X bringt +3 %" formuliert, sondern
  als „Listen mit X haben gegen G besser abgeschnitten (Band …)".

## 6. Schritt C: Optimierung

Binäre Variable `x(k,c)` pro Flex-Stufe, mit `x(k,c) ≤ x(k,c−1)` (die 3. Kopie nur mit der 2.).

**Maximiere** `Σ score(k,c) × x(k,c)`
**unter:**
- `Σ x = Flex-Budget`
- Validator-Regeln aus Spec 2 (≤ 4 pro Name, ≤ 1 ACE SPEC inkl. Kern, ≤ 1 Radiant)
- Struktur-Leitplanken aus §4
- Entwicklungslinien: Stufe-2-Kopien ≤ Stufe-1-Kopien + Hilfskarten (Regel im Plan
  präzisieren, **Vermutung**, dass eine einfache Ungleichung reicht)

**Löser:** Das Problem ist klein (typisch 30–60 Kandidaten-Stufen). Zwei Optionen, die der Plan
per Benchmark entscheidet:
1. Branch & Bound über die LP-Relaxation mit `solveStandardFormLp`
   (`packages/shared/src/simplex.ts:89`)
2. Greedy nach Score mit anschließender lokaler Tauschsuche (1-für-1 und 2-für-2)

Anforderungen an beide: deterministisch (Tie-Breaks nach `name_key`), unter 1 Sekunde,
Ergebnis besteht immer den Validator. Findet der Löser nichts Gültiges, fällt er auf den
Medoid des besten Clusters zurück (Spec 1) und sagt das in der UI.

## 7. Ausgabe

```ts
interface MetaList {
  archetypeId: string; windowKey: string; fieldKey: string; computedAt: string;
  cards: { nameKey: string; count: number; kind: 'core' | 'flex' }[];
  flexReasons: { nameKey: string; count: number; factIds: string[] }[];
  confidence: { nEff: number; lists: number; games: number };
  diffToPrevious: { added: …; removed: … } | null;
}
```

- **Begründungen:** Fakten-IDs nach dem bestehenden Muster von
  `packages/shared/src/deckSynthesis.ts` (Fakt → Claim → Validierung). Das LLM formuliert, rechnet
  aber nicht. Ohne LLM-Key zeigt die UI die Fakten als strukturierte Zeilen.
- **Diff zur Vorwoche:** „Neu: 1 Judge. Raus: 1 Night Stretcher."
- **Diff zur eigenen Liste:** Welche Karten der Nutzer anders spielt, jeweils mit Score und Band.
  Keine Punkt-Prognose der Win-Rate ohne Band.

## 8. Qualität messen: Backtest

Ohne Messung wissen wir nicht, ob die Meta-Liste besser ist als „nimm die meistgespielte
Liste". Deshalb:

- **Aufbau:** Für jede Woche t die Meta-Liste nur aus Daten bis t berechnen und mit den Listen
  vergleichen, die in Woche t+1 im **oberen Viertel** platziert waren.
- **Metrik:** mittlere Kartenüberschneidung (0–60) mit diesen Listen.
- **Baselines:** (a) Medoid des größten Clusters, (b) ungewichteter Konsens.
- Ergebnis in `docs/` festhalten. Die Parameter aus Spec 4 und hier werden damit kalibriert.
- Das ist eine Näherung. Top-Listen der Folgewoche sind nicht „die beste Liste", aber der
  beste verfügbare Außenmaßstab.

## 9. Speicherung und Berechnung

- Tabelle `meta_lists` (Schlüssel: `archetype_id`, `window_key`, `field_key`, `scope`), Inhalt
  als JSONB wie in §7.
- **Globales Feld:** Ein Job `computeMetaLists` rechnet nach `syncMeta` und
  `computeCardStats` für alle Archetypen mit genug Daten (Start: `n_eff ≥ 20`).
- **Lokales Feld:** Berechnung bei Bedarf, Cache-Schlüssel = Hash aus normiertem Feld,
  Fenster und Datenstand. Ein neuer Sync macht den Cache ungültig.
- Vorheriger Stand bleibt für den Diff erhalten (letzter Eintrag pro Schlüssel und Woche).

## Umsetzungsscheiben

| Scheibe | Inhalt | ACs |
|---|---|---|
| S1 | Schritt A: gewichtete Verteilung, Kern/Flex, Struktur-Leitplanken | 2, 3 (Kern-Teil) |
| S2 | Schritt B: δ je Stufe und Matchup mit Shrinkage, Score mit α | 3, 4 |
| S3 | Schritt C: Löser. Zuerst Benchmark Greedy+Tausch vs. Branch & Bound, dann eine Variante | 1, 5, 8 |
| S4 | Tabelle `meta_lists` + Job `computeMetaLists` + Cache für lokales Feld | 2 |
| S5 | Begründungen über Fakten-IDs (Muster `deckSynthesis.ts`) | 6 |
| S6 | Backtest-Skript, Ergebnis in `docs/` | 7 |
| S7 | API-Route; UI-Anbindung erfolgt in Spec 7 Scheibe 4 | 9 |

S1–S3 sind reine Funktionen in `packages/shared`: ideal für testgetriebene Umsetzung mit
synthetischen Daten.

## 10. Akzeptanzkriterien

1. Die Meta-Liste besteht immer den Validator (Property-Test über synthetische Daten).
2. Gleiche Eingabe in anderer Reihenfolge ergibt dieselbe Liste.
3. Synthetischer Test: Karte A ist in 100 % der Listen → Kern. Karte B verbessert
   nachweislich das häufigste Matchup → im Flex, mit Fakt. Karte C ohne Effekt → nicht drin.
4. Mit sehr wenig Daten (`n_eff < 5`) entspricht die Liste im Wesentlichen dem Konsens (α → 1).
5. ACE SPEC im Kern plus ACE-SPEC-Kandidat im Flex → der Kandidat wird nie gewählt.
6. Jede Flex-Karte hat mindestens einen Fakt. Die UI zeigt n_eff bzw. das Band.
7. Der Backtest läuft als Skript und schreibt seine Ergebnisse in `docs/`.
8. Laufzeit des Optimierers unter 1 Sekunde pro Archetyp (Test mit realistischer Größe).
9. Gates grün, Doku aktualisiert.

## 11. Out of Scope

- Keine Simulation von Spielen.
- Keine Karten außerhalb der Archetyp-Listen. Das ist Aufgabe des Lab-Modus (Spec 6).
- Keine automatische Übernahme in die eigene Liste. Der Nutzer entscheidet.

## 12. Entscheidungen (Default 2026-09-23, überschreibbar)

1. `KERN_SCHWELLE = 0,85` und `SHRINK_K = 40` als Startwerte. Kalibrierung per Backtest (§8).
2. Berechnet wird für **alle Archetypen mit `n_eff ≥ 20`**. Sollte der Job in S4 zu lange laufen,
   wird auf gewählte Archetypen eingeschränkt.
