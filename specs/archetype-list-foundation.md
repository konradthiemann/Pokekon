# Spec 1: Fundament-Fixes am Cluster-Ranking

> **Status:** Entwurf, wartet auf Freigabe durch Konrad.
> Kontext: Teil 1 von 8 aus [`specs/archetype-coach-vision.md`](./archetype-coach-vision.md).
> Belege: Stand `main` = `baebcc5`.
> **Nachfolgend:** Plan in `.claude/plans/archetype-list-foundation.md` (plan-agent),
> Umsetzung per Zwei-Agenten-TDD.

## 1. Problem

Die als „beste Liste" angezeigte Deckliste ist weder die beste noch reproduzierbar:

1. **Nicht-deterministische Eingabereihenfolge.** Die Standings-Query hat kein `orderBy`
   (`apps/api/src/lib/archetypeSynthesisFacts.ts:103-122`), ebenso der Turnier-Pfad
   (`apps/api/src/routes/analysis.ts:542-622`). PostgreSQL garantiert ohne `ORDER BY`
   keine Reihenfolge.
2. **Das Clustering hängt von der Reihenfolge ab.** `clusterDecklists` ist greedy: jede Liste
   kommt in den *ersten* passenden Cluster (`packages/shared/src/decklistClustering.ts:118-143`).
   Andere Reihenfolge heißt andere Cluster.
3. **Der Repräsentant ist die zuerst gesehene Liste** (`decklistClustering.ts:85`, gesetzt
   `:136`) und damit ein zufälliges Mitglied. Es kann bis zu 5 Karten vom Rest des Clusters
   abweichen (`DEFAULT_MIN_OVERLAP_RATIO = 55/60`, `:16`).
4. **Bei Gleichstand ist die Rangfolge nicht stabil.** `rankClusters` sortiert nur nach
   `winRateLowerBoundPct` (`packages/shared/src/clusterRanking.ts:64`). Bei gleichem Wert
   entscheidet die Eingabereihenfolge.
5. **Bug beim Personal Prior:** Mit lokalem Feld werden die Cluster neu gereiht
   (`archetypeSynthesisFacts.ts:142-150`). Der Prior nutzt aber `rankedClusters[0]` statt
   `finalClusters[0]` (`:154`). Der Prior bezieht sich damit auf einen anderen Cluster als den,
   der oben angezeigt wird.

## 2. Ziel

Gleiche Daten ergeben **immer dieselben Cluster, dieselbe Rangfolge und denselben
Repräsentanten**, unabhängig von der Reihenfolge der Eingabe. Der Repräsentant ist die Liste,
die den Cluster **am besten verkörpert**.

## User Stories

- Als Spieler will ich bei gleichem Datenstand **immer dieselbe** empfohlene Liste sehen, damit
  ich der Empfehlung vertrauen kann.
- Als Spieler will ich die **typischste** Liste des besten Clusters sehen, nicht eine zufällige.

## 3. Lösung

### 3.1 Kanonische Reihenfolge im Clustering
`clusterDecklists` sortiert seine Eingabe intern, bevor die Cluster gebildet werden. Damit ist
die Funktion unabhängig davon, was der Aufrufer übergibt. Sortierschlüssel:

1. `placementPercentile` absteigend (starke Listen gründen Cluster), fehlend = ans Ende
2. `wins − losses` absteigend
3. `id` aufsteigend (finaler, eindeutiger Tie-Break)

Zusätzlich bekommen beide Queries ein `orderBy(tournamentStandings.id)`, damit auch Logs und
Debugging reproduzierbar sind.

### 3.2 Medoid als Repräsentant
- Neues Feld `seed: TournamentDecklist` für die Liste, die den Cluster gegründet hat.
  Gegen sie wird weiterhin die Zugehörigkeit geprüft, das Verhalten bleibt also gleich.
- `representative` wird **nach** dem Clustering neu bestimmt: das Mitglied mit der größten
  Summe von `identicalCards` zu allen anderen Mitgliedern (Medoid).
  Tie-Break: bessere Platzierung, dann kleinere `id`.
- Dafür muss jeder Cluster die Decklisten seiner Mitglieder behalten (neu:
  `members: { id, decklist, placementPercentile }[]` oder vergleichbar, Entscheidung im Plan).
- Aufwand O(m²) Vergleiche pro Cluster. Bei den zu erwartenden Clustergrößen (< 200)
  unkritisch, im Plan zu bestätigen.

### 3.3 Stabile Rangfolge
Der Sort in `rankClusters` bekommt Tie-Breaks: `winRateLowerBoundPct` absteigend, dann
`avgPlacementPercentile` absteigend (`null` zuletzt), dann Mitgliederzahl absteigend, dann
kleinste Mitglieds-`id`.

### 3.4 Personal-Prior-Bug
`archetypeSynthesisFacts.ts:154`: `finalClusters[0]` statt `rankedClusters[0]`.

## Umsetzungsscheiben

Jede Scheibe ist für sich grün (typecheck, lint, test) und wird nach dem Zwei-Agenten-TDD
(Tests aus den ACs zuerst, dann Implementierung) umgesetzt.

| Scheibe | Inhalt | ACs |
|---|---|---|
| S1 | Kanonische Sortierung in `clusterDecklists` + `orderBy` in beiden Queries | 1, 6 |
| S2 | `seed`-Feld, Medoid als `representative` | 2, 3, 7 |
| S3 | Tie-Break-Kette in `rankClusters` | 4 |
| S4 | Personal-Prior-Bug | 5 |
| S5 | Doku | 8 |

## 4. Akzeptanzkriterien

1. **Reihenfolgeunabhängigkeit:** Ein Test mischt dieselben Standings in mindestens 20
   zufälligen Reihenfolgen (deterministischer Seed über `deterministicRandom.ts`) und
   bekommt jedes Mal identische Cluster (Mitglieder-IDs), identische Rangfolge und identische
   Repräsentanten.
2. **Medoid:** Bei einem Cluster aus drei fast gleichen Listen A, B, C, wobei B die mittlere
   ist, ist B der Repräsentant, unabhängig davon, welche Liste zuerst kommt.
3. **Einzel-Cluster:** Ein Cluster mit einem Mitglied hat dieses als Repräsentanten
   (keine Regression der „Nadel im Heuhaufen"-Anforderung).
4. **Stabile Rangfolge:** Zwei Cluster mit gleichem `winRateLowerBoundPct` werden nach der
   Tie-Break-Kette aus §3.3 sortiert, getestet.
5. **Prior-Bug:** Test mit lokalem Feld, das die Reihenfolge umdreht. Der
   `personalPrior`-Fakt basiert auf dem neuen ersten Cluster.
6. **Keine Verhaltensänderung sonst:** Cluster-*Zugehörigkeit* bei bereits kanonisch
   sortierter Eingabe bleibt gleich. Bestehende Tests bleiben grün oder werden mit Begründung
   angepasst (15 Test-Stellen referenzieren `representative`; im Plan einzeln prüfen).
7. Die UI (`ArchetypeRecommendationPanel.tsx`, `TournamentBestListPanel.tsx`) zeigt den neuen
   Repräsentanten ohne weitere Änderung, weil das Feld erhalten bleibt.
8. Gates: `npm run typecheck`, `npm run lint`, `npm run test` grün. Doku-Update in
   `docs/` (Cluster-Beschreibung), Docs-Gate grün.

## 5. Out of Scope

- Keine neue Gewichtung nach Aktualität oder Event-Tier (Spec 4).
- Keine Konsensliste (Spec 5).
- Keine Änderung an `DEFAULT_MIN_OVERLAP_RATIO`.
- Kein Regel-Validator (Spec 2).

## 6. Entscheidungen (Default 2026-09-23, überschreibbar)

1. `seed` bleibt **intern** und erscheint nicht in der API-Antwort. Weniger Oberfläche, und
   niemand braucht ihn in der UI.
2. Eine „Typizität" des Repräsentanten wird **nicht** in Spec 1 angezeigt. Das kommt mit der
   Konfidenz-Anzeige der Meta-Liste (Spec 5).
