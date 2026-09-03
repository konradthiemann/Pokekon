# Spec 8: KI-Textsynthese über strukturierten Analyseergebnissen

> Teil 8 von 9 im Rework-Fluss aus [`deck-improvement-hub-vision.md`](./deck-improvement-hub-vision.md).
> Baut auf Spec 3 (Konfidenzbänder), Spec 5 (Prognosen) und optional Spec 6 (Nash-/Replicator-
> Schicht) auf — die KI-Synthese übersetzt deren Ergebnisse, erzeugt aber keine eigenen
> Zahlen. Ohne diese Vorarbeiten gäbe es nichts Verlässliches zu übersetzen.
> Entscheidung aus dem Briefing: Ausgabe muss **demo-mode-tauglich / für andere Nutzer
> verständlich** sein, nicht nur für Konrad selbst.

## Problem/Ziel

Pokekon hat bereits eine ernstzunehmende Anti-Halluzinations-Architektur für KI-Analyse —
aber ausschließlich für **Battle-Logs** (Freitext): `POST /api/analysis/log`
(`docs/features.md` §8) verlangt pro Analyse-Punkt ein wörtliches Zitat aus dem Rohlog
(`validateAnalysis` in `packages/shared/src/battleAnalysis.ts`), nutzt `temperature: 0` und
eine provider-agnostische Adapter-Schicht (`apps/api/src/ai/provider.ts`,
`githubModels.ts`). Diese Infrastruktur ist wiederverwendbar (gleiches Provider-Interface),
aber die **Grounding-Methode selbst passt nicht 1:1**: "Zitat muss im Rohlog vorkommen" ist
eine Text-Prüfung, die für strukturierte Zahlen (Field-Score, Konfidenzintervall,
Prognose-Delta, ggf. Nash-Robustheitswert) keinen Sinn ergibt — hier bräuchte es ein
äquivalentes, aber mechanisch anderes Prinzip: "jede Aussage muss auf einen konkreten,
mitgelieferten Datenpunkt zurückführbar sein" statt auf ein Zitat.

**Ziel:** Ein Agent, der die Ergebnisse der Analyse-Pipeline (Field-Score, Konfidenzbänder,
Prognose-Deltas, ggf. Gleichgewichts-/Replicator-Signale) in eine verständliche,
personalisierte Textempfehlung übersetzt — mit derselben Ehrlichkeits-Haltung wie die
bestehende Battle-Log-Analyse, aber für strukturierte statt Freitext-Eingaben, und so
formuliert, dass sie ohne Vorwissen über Konrads eigene Decks verständlich ist.

## User Stories

- Als Spieler will ich statt einer Tabelle mit Zahlen einen kurzen, verständlichen Absatz
  lesen können ("Dein Deck ist gegen die aktuelle Meta gut aufgestellt, mit einer Schwäche
  gegen X — dort hilft Karte Y voraussichtlich mehr als Karte Z"), ohne dass die KI Dinge
  behauptet, die die Zahlen nicht hergeben.
- Als Demo-Modus-Besucher ohne eigene Decks will ich denselben Textstil bei den
  vorbefüllten Beispieldaten erleben wie ein echter Nutzer, damit der Eindruck der App nicht
  von der Textqualität abweicht.
- Als Konrad will ich, dass ein offensichtlich falscher/unbelegter Text (Halluzination) durch
  dieselbe Disziplin verhindert wird wie bei der Battle-Log-Analyse, nicht durch eine
  laxere Ad-hoc-Lösung.

## Akzeptanzkriterien

- [ ] Neuer Analyse-Typ nutzt das bestehende `AnalysisProvider`-Interface
      (`apps/api/src/ai/provider.ts`) — kein zweiter, paralleler KI-Integrationsweg.
- [ ] `temperature: 0`, JSON-strukturierte Zwischenausgabe vor dem finalen Text (Konsistenz
      mit CLAUDE.md Golden Rule 6 — dieselbe Disziplin, nicht optional für dieses Feature).
- [ ] Neue Validierungsfunktion (Analogie zu `validateAnalysis`, aber für strukturierte
      Eingaben statt Freitext): jede Aussage im generierten Text referenziert einen
      identifizierbaren Eingabe-Datenpunkt (z. B. eine konkrete `archetypeId` +
      Kennzahl-Feld); Aussagen ohne zuordenbaren Datenpunkt werden verworfen, bevor der Text
      dem Nutzer angezeigt wird.
- [ ] Prognose-Deltas aus Spec 5 werden nur dann in Empfehlungssätzen verwendet, wenn sie
      selbst über der in Spec 5 festgelegten Mindest-Konfidenz liegen — die KI-Schicht senkt
      nicht implizit den Beweisstandard der zugrunde liegenden Analyse.
- [ ] Text ist ohne Vorwissen über den spezifischen Deck-Kontext verständlich (keine
      unerklärten internen Begriffe/Abkürzungen) — geprüft am Demo-Modus-Datensatz
      (`docs/demo-mode.md`), nicht nur an Konrads eigenen Decks.
- [ ] BYOK-Schlüsselverwaltung (verschlüsselt, serverseitig, nie im Browser) wird identisch zur
      bestehenden Battle-Log-Analyse gehandhabt — keine zweite Schlüssel-Ablage.
- [ ] Demo-Modus zeigt eine vorberechnete ("pre-baked") Text-Synthese wie bei den bestehenden
      Battle-Log-Analysen (`docs/demo-mode.md`), damit kein Token des Betreibers für
      Demo-Besuche verbraucht wird.

## Out of Scope

- Änderungen an der bestehenden Battle-Log-Analyse selbst (`analyzeBattleLog`,
  `validateAnalysis` für Freitext) — diese Spec ergänzt eine zweite, strukturierte
  Analyse-Art, ersetzt die erste nicht.
- Chat-artige, mehrstufige Konversation mit dem Nutzer — diese Spec liefert einen generierten
  Text pro Analyse-Lauf, kein interaktives Hin und Her.
- Neue LLM-Provider über GitHub Models hinaus (bleibt wie heute providerunabhängig
  vorbereitet, aber ohne neuen konkreten Provider in dieser Spec).

## Offene Fragen (entschieden, 2026-09-03)

- **Auslöse-Zeitpunkt:** **Entschieden: nutzergetriggert per Button**, wie die bestehende
  Battle-Log-Analyse (`docs/features.md` §8: "User triggers + API key"). Kein automatischer
  Lauf bei jedem Seitenaufruf — kein unnötiger Token-Verbrauch bei unveränderten Daten,
  konsistent mit dem etablierten Muster.
- **Caching/Wiederverwendung:** **Entschieden: cachen, bis sich die zugrunde liegenden Zahlen
  ändern.** Ein einmal generierter Text wird wiederverwendet, solange sich die Eingabe-Daten
  (Field-Score, Konfidenzbänder, Prognose-Deltas, ggf. Gleichgewichts-/Replicator-Signale) für
  den jeweiligen Kontext nicht geändert haben — spart Tokens, im Sinne von CLAUDE.md Golden
  Rule 2 ("Kostenlos bleiben"). Cache-Invalidierung ist Teil der Plan-Kontrakte, nicht dieser
  Spec.
- **Umfang der Validierungsfunktion:** **Entschieden: strukturell + Richtung.** Zusätzlich zur
  strukturellen Prüfung (referenzierte `archetypeId`/Kennzahl existiert im Input) prüft die
  Validierung, ob positiv/negativ formulierte Aussagen zum tatsächlichen Vorzeichen der
  referenzierten Zahl passen. Höherer Implementierungsaufwand, aber konsistent mit CLAUDE.md
  Golden Rule 6 ("dürfen nicht aufgeweicht werden") — dieselbe Prüftiefe wie der Anspruch an
  die bestehende Battle-Log-Analyse.
