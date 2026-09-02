# Vision: Pokekon als Meta-getriebener Deck-Verbesserungs-Hub

> **Status:** Rahmen-/Konzeptdokument — kein Implementierungs-Spec. Grundlage für die
> nachfolgende Liste von Einzel-Specs (Abschnitt 5). Noch nicht von Konrad final bestätigt.
> **Grundregel (CLAUDE.md §2.1):** Jede Aussage ist mit `datei:zeile` belegt oder
> ausdrücklich als **Vermutung**/**Unbekannt** markiert.

## 1. Problem/Ziel

**Bisheriger Zustand:** Pokekon ist in `docs/features.md` als 16 nebeneinanderstehende
Features dokumentiert, faktisch aber zwei lose gekoppelte Systeme:

- **Meta-Intelligence** (Live-Sync, Matchup-Matrix, Field-Score, Local-Meta-Prediction) —
  läuft komplett von öffentlichen Turnierdaten, braucht keinen persönlichen Aufwand.
- **Personal Tracker** (Match-Log, Deck-Versionierung an Logs, 9 von 14
  Recommendation-Regeln) — braucht disziplinierte manuelle Dateneingabe pro Spiel und
  konkurriert damit direkt mit etablierten Szene-Gewohnheiten/Tools (PTCG-Live-eigener
  Verlauf, Limitless, TrainerHill). **Wird laut Konrad seit längerem nicht mehr genutzt.**

**Ziel (aus Briefing destilliert):** Pokekon soll ein **Hub** werden, der (a) zeigt, wie
sich die kompetitive Meta verändert, und (b) daraus **personalisierte, prognostische
Empfehlungen** ableitet, wie das eigene Deck zu verbessern ist. Die beiden bestehenden
Achsen "Meta" und "Deckverlauf/Analyse" bleiben als IA-Grundgerüst bestehen — aber
**Datenanalyse, Empfehlungslogik und UI/UX werden komplett auf dieses eine Ziel hin
neu ausgerichtet**, nicht nur kosmetisch aufgeräumt. Optional: Weiterentwicklung der
KI-/Agenten-Infrastruktur (inkl. hook-basierter Doku-Aktualisierung) als Teil desselben
Rework-Flusses.

**Für wen:** primär Konrad selbst als aktiver Spieler (Dogfooding), sekundär als
Portfolio-Beleg für Daten-/Agentic-Engineering-Fähigkeiten (siehe Gesprächskontext).

## 2. Kernverschiebung gegenüber dem Status quo

| | Bisher | Ziel |
|---|---|---|
| Rolle von persönlichen Daten | Gleichrangige Kern-Säule (Match-Log als eigenes Hauptfeature) | Optionaler Verstärker der Meta-Analyse, nicht deren Voraussetzung |
| Empfehlungen | 14 statische Schwellenwert-Regeln, beschreiben Vergangenheit | Prognostisch: "wenn du X änderst, ändert sich deine erwartete Field-WR um Y" |
| Unsicherheit | Binäre Schwelle (`MIN_MATCHUP_GAMES`, s. u.) | Konfidenzbänder pro Zahl, durchgängig sichtbar |
| Meta-Bewertung | Popularität + gewichteter EV gegen ein Feld | + spieltheoretische Einordnung (Popularitäts-Paradox, Trendrichtung) |
| KI-Rolle | Nur Nachbetrachtung einzelner Battle-Logs | Optional: Synthese der strukturierten Analyseergebnisse zu verständlicher Empfehlung |

## 3. Was in der Datenanalyse konkret bedacht werden muss

### 3.1 Zwei belegte Korrektheits-Lücken im bestehenden Code

**Unentschieden werden aktuell aus der Win-Rate herausgerechnet, nicht als 1/3-Sieg
gezählt.** Beleg: `packages/shared/src/meta.ts:280` —
`winRatePct = decisive > 0 ? Math.round((s.wins / decisive) * 100) : null` mit
`decisive = wins + losses` (Ties fließen nicht ein). Die offizielle Pokémon-Championship-
Turnierwertung und die einschlägige Fachliteratur zur PTCG-Metaanalyse (siehe Quellen)
rechnen `WR = (W + T/3) / (W + L + T)`. Bei archetypischen Matchups mit hoher Remis-Quote
(z. B. Mirror-Matches mit Prize-Race-Patt) verzerrt das aktuelle Vorgehen die Field-Score-
Eingabe systematisch.
**Warum wichtig:** Wenn das Ziel "Prognosen" ist, muss die Eingabegröße (Win-Rate) selbst
korrekt sein — sonst rechnet die gesamte nachgelagerte Field-Score-/Empfehlungs-Kette mit
einer verzerrten Zahl.

**Matchup-Daten nutzen eine binäre Mindest-Spielzahl statt einer Konfidenzangabe.**
Beleg: `packages/shared/src/fieldWinRate.ts:54` — `export const MIN_MATCHUP_GAMES = 10`,
verwendet als harter Cutoff (`fieldWinRate.ts:75`), darunter zählt die Zelle als
"unzureichend" (50 %-Neutralwert, `fieldWinRate.ts:96`) statt eine echte Unsicherheit
auszuweisen. 9 Spiele mit 8-1 und 11 Spiele mit 6-5 werden also unterschiedlich behandelt
(eine Zelle fällt komplett raus, die andere zählt voll), obwohl die zweite statistisch
unsicherer ist.

### 3.2 Bo1 vs. Bo3 — Vermutung, zu verifizieren

Der Meta-Sync fokussiert laut `docs/features.md` §2 explizit auf **Online-Bo1-Swiss**
Turniere als Näherung für lokale Bo1-Events. Persönliche Match-Logs (sofern sie erhalten
bleiben) können aber auch von Bo3-Events (Regionals, Worlds — laut Match-Log-Feldliste
`docs/features.md` §6) stammen. **Unbekannt:** ob/wo eine Bo1↔Bo3-Umrechnung
(`P_Bo3 = 3p² − 2p³`, siehe Quelle 1) stattfindet, bevor persönliche und Meta-Win-Rates
verglichen werden. Ohne diese Umrechnung sind die beiden Datenquellen nicht direkt
vergleichbar.

### 3.3 Datenkonsistenz als dominanter Fehlermodus

Die Fachliteratur zur PTCG-Metaanalyse (Quelle 1) identifiziert **Dateneingabefehler**,
nicht Modellfehler, als häufigste Ursache für falsche Matchup-Schlüsse (dort: exakte
Integer-Arithmetik statt Gleitkomma, Symmetrie-Checks A-vs-B ↔ B-vs-A). Für Pokekon
relevant, weil die Matchup-Matrix zwei Quellen blendet (eigene Pairings + TrainerHill-CSV,
`docs/features.md` §13) — ein Konsistenz-Check zwischen beiden Quellen existiert nach
aktuellem Kenntnisstand nicht (**Unbekannt**, zu verifizieren in `apps/api/src/routes/meta.ts`).

### 3.4 Von "was ist stark" zu "was soll ich konkret ändern"

Zwei Engines laufen aktuell nebeneinander, ohne verbunden zu sein:
- **Field-Score** (`packages/shared/src/fieldWinRate.ts`) — bewertet ganze Decks gegen ein Feld.
- **Deck Comparison** (`docs/features.md` §9) — schlägt einzelne Karten vor/ab, basierend
  auf Kopienhäufigkeit in Turnierlisten, **ohne** Bezug zur Field-Score-Auswirkung.

Für echte "Prognosen" (Kernziel!) müsste eine Kartenänderung mit einer geschätzten
Field-WR-Delta verknüpft werden — z. B. über die durchschnittliche Turnier-Performance
von Listen mit vs. ohne Karte X (kontrolliert auf Archetyp), statt nur Kopienhäufigkeit
zu melden.

### 3.5 Spieltheoretische Tiefe als Alleinstellungsmerkmal

Ein aktuelles Forschungspapier (Quelle 1, Lean-4-Fallstudie über echte TrainerHill-Daten
zum PTCG-Standard-Format Jan–Feb 2026) zeigt ein **"Popularitäts-Paradox"**: Das meist
gespielte Deck (Dragapult, 15,5 % Meta-Share) hatte im Nash-Gleichgewicht **0 % Gewicht**
als optimale Wahl, während ein selteneres Deck (Grimmsnarl, 5,1 % Share) die höchste
erwartete Win-Rate (52,7 %) erzielte. Weder Limitless noch TrainerHill exponieren diese
Art spieltheoretischer Bewertung gegenüber Spielern — eine Nash-Gleichgewichts-/
Replicator-Dynamik-Schicht oberhalb des bestehenden Field-Score wäre eine echte
Differenzierung (und ein starkes Advanced-Engineering-Beispiel fürs Portfolio),
kein Nachbau von etwas Bestehendem.

**Methodischer Hinweis aus derselben Quelle, direkt übertragbar:**
1. Erst robuste Dateneingabe/-validierung, 2. volle Metagame-gewichtete Erwartungswert-
Rangfolge (Field-Score existiert bereits — methodisch richtig!), 3. Gleichgewichts-/
Replicator-Schicht erst wenn Stichprobengrößen stabil sind. Reihenfolge sollte für die
Spec-Priorisierung übernommen werden (siehe Abschnitt 5).

### 3.6 KI-Layer im Sinne des Hub-Ziels

Aktuell analysiert die KI (`docs/features.md` §8) nur einzelne Battle-Logs im Nachhinein.
Denkbare Erweiterung: ein Agent, der die *strukturierten* Analyseergebnisse (Field-Score,
Coverage, Konfidenzbänder, ggf. Nash-/Replicator-Signale) in eine verständliche,
personalisierte Textempfehlung übersetzt — nach demselben Prinzip wie die bestehende
Anti-Halluzinations-Architektur (jede Aussage braucht einen Beleg), nur übertragen von
"Zitat aus dem Log" auf "konkreter Datenpunkt aus der Analyse-Pipeline".

## 4. KI-/Agenten-Infrastruktur (Zusatzpunkt aus dem Briefing)

Konrad möchte prüfen, ob die Weiterentwicklung der Agenten-Infrastruktur selbst
(insbesondere automatisches Aktuellhalten der Doku per Hook, analog
`~/.claude/hooks/infra-dashboard-sync.sh` im `agentic-infra-dashboard`-Repo) Teil dieses
Reworks wird. **Offene Frage, siehe Abschnitt 6** — das ist ein eigenständiges Thema
(Tooling/Meta-Ebene) und sollte vermutlich als eigener Spec-Block geführt werden, nicht
in die fachliche Datenanalyse-Arbeit verwoben werden.

## 5. Vorschlag: Aufteilung in Einzel-Specs (Reihenfolge zur Diskussion)

Angelehnt an den methodischen Hinweis aus 3.5 (erst Daten-Robustheit, dann tiefere Modelle):

1. **`deck-improvement-hub-vision.md`** — dieses Dokument (Zieldefinition, Rahmen).
2. **`data-correctness-fixes.md`** — Tie-Handling (3.1), Bo1/Bo3-Konvertierung (3.2),
   Konsistenz-Check zwischen Pairings- und TrainerHill-Quelle (3.3). Kleinster, risikoärmster
   Schritt zuerst, weil alles Nachgelagerte davon abhängt.
3. **`confidence-aware-matchups.md`** — Wilson-Score-Intervalle statt `MIN_MATCHUP_GAMES`-
   Cutoff, Konfidenzbänder durchgängig in UI sichtbar.
4. **`personal-data-role-rework.md`** — Match-Log/Deck-Versionierung von "Kern-Feature" zu
   "optionaler Verstärker" umbauen; UI/UX-Konsequenz für Navigation.
5. **`recommendation-to-prognosis.md`** — Field-Score- und Deck-Comparison-Engine verbinden,
   aus "was ist stark" wird "was ändert sich, wenn ich X tausche".
6. **`meta-game-theory-layer.md`** — optionale Nash-/Replicator-Schicht (Differenzierungs-
   merkmal, siehe 3.5), erst nach 2–3 (stabile Datenbasis vorausgesetzt).
7. **`ui-ux-hub-rework.md`** — Informationsarchitektur konsequent auf Meta + Deckverlauf/
   Analyse als die zwei tragenden Achsen ausrichten.
8. **`ai-recommendation-synthesis.md`** — Agent, der strukturierte Analyseergebnisse in
   personalisierten Text übersetzt (3.6).
9. **`docs-sync-automation.md`** — Hook-basierte Doku-Aktualisierung (Abschnitt 4),
   unabhängiger Tooling-Strang, kann parallel/getrennt laufen.

Jeder dieser Punkte bekommt vor der Umsetzung eine eigene Spec nach dem üblichen Schema
(Problem/Ziel, User Stories, Akzeptanzkriterien, Out of Scope, Offene Fragen) und danach
Plan → Tester → Implementer.

## 6. Entscheidungen (bestätigt 2026-08-31)

- **Reihenfolge Abschnitt 5:** bestätigt wie vorgeschlagen.
- **Match-Log/Personal Tracker:** **strukturelle Änderung**, nicht nur Repositionierung —
  Spec 4 (`personal-data-role-rework.md`) darf das manuelle Formular tatsächlich umbauen
  (z. B. Reduktion auf Battle-Log-Paste als primären Eingabeweg), nicht nur UI-Platzierung
  ändern.
- **Doku-Automatisierung (Punkt 9):** läuft im **selben Rework-Fluss**, nicht separat.
- **Spieltheorie-Schicht (Punkt 6):** **volle Tiefe wie im Referenzpapier** — echtes
  Nash-Gleichgewicht (exhaustive/geeignete Enumeration über Support-Teilmengen) +
  Replicator-Dynamik für Trendrichtung, keine vereinfachte Heuristik. Rechenaufwand/
  Laufzeit-Grenzen sind Teil von Spec 6, nicht hier vorwegzunehmen.
- **Zielgruppe Text-Empfehlungen (Punkt 8):** **demo-mode-tauglich / für andere Nutzer
  verständlich** — Ton und Erklärtiefe müssen ohne Vorwissen über Konrads eigene Decks
  funktionieren, analog zum bereits bestehenden Demo-Modus-Anspruch (`docs/demo-mode.md`).

## Quellen

- [From Rules to Nash Equilibria: A Lean 4 Case Study in Game-Theoretic Analysis of a Competitive Trading Card Game](https://arxiv.org/html/2607.08692v1) — Methodik für Win-Rate-Berechnung (inkl. Ties), Wilson-Intervalle, Nash-Gleichgewicht/Replicator-Dynamik auf echten PTCG-TrainerHill-Daten.
- [Meta shifts and matchup data: how competitive TCG analysis is redefining tournament strategy](https://cardsrealm.com/ko-kr/articles/meta-shifts-and-matchup-data-how-competitive-tcg-analysis-is-redefining-tournament-strategy) — Praxis-Kontext zu Matchup-Matrix-Erstellung.
