# Spec 2: Daten-Korrektheit — Tie-Handling, Bo1/Bo3, Quellen-Konsistenz

> Teil 2 von 9 im Rework-Fluss aus [`deck-improvement-hub-vision.md`](./deck-improvement-hub-vision.md).
> Kleinster, risikoärmster Schritt zuerst — alle nachgelagerten Specs (Konfidenzbänder,
> Prognosen, Nash-Schicht) rechnen mit den hier korrigierten Zahlen weiter.

## Problem/Ziel

Die Win-Rate-Berechnung, die Field-Score, Matchup-Matrix und Empfehlungen speist, weicht
an zwei belegten Stellen von der offiziellen Turnierwertung ab, und eine dritte Stelle
(Bo1/Bo3-Vergleichbarkeit) ist ungeklärt:

1. **Ties werden aus der Win-Rate herausgerechnet statt als 1/3-Sieg gezählt.**
   Belegt an zwei unabhängigen Stellen mit identischem Muster:
   - `packages/shared/src/meta.ts:280` — `winRatePct = wins / (wins + losses) * 100`
   - `apps/api/src/routes/meta.ts:148` (`directedRow`) — `winRate = wins / (wins + losses) * 100`

   Die offizielle Pokémon-Turnierwertung zählt `WR = (W + T/3) / (W + L + T)`. Bei
   Matchups mit strukturell hoher Remis-Quote (z. B. Prize-Race-Patt in bestimmten
   Mirror-Matches) verzerrt die aktuelle Formel die Zahl, die in Field-Score und
   Matchup-Matrix einfließt.

2. **Keine Bo1/Bo3-Konvertierung zwischen Meta-Baseline und persönlichen Logs.**
   Der Meta-Sync trackt `swissMode` ('BO1'/'BO3'/'OTHER') pro Turnier
   (`apps/api/src/db/schema.ts:289`) und filtert die Online-Meta-Baseline explizit auf
   Bo1 (`apps/api/src/db/schema.ts:286`). Der Match-Log-`eventType`
   (`apps/api/src/db/schema.ts:131`: `'LC' | 'LCup' | 'Regional' | 'Worlds' | 'Online'`)
   trägt aber **kein** Best-of-Format-Feld — Regionals/Worlds sind uns bekannt Bo3,
   LC/LCup/Online **vermutlich**, aber nicht verifiziert, überwiegend Bo1. Ohne
   ausdrückliches Feld ist nicht rekonstruierbar, ob ein geloggtes Match Bo1 oder Bo3 war,
   und die Field-Score-Engine kann persönliche und Meta-Win-Rate nicht korrekt vergleichen.

3. **Keine Konsistenzprüfung zwischen eigenen Pairing-Daten und TrainerHill-Fallback.**
   `apps/api/src/routes/meta.ts:152–214` (`loadMatchupData`) ersetzt eine TrainerHill-Zeile
   durch die eigene, sobald `total >= MIN_MATCHUP_GAMES` (10) erreicht ist — ein reines
   Überschreiben, kein Abgleich. Wenn beide Quellen für denselben Matchup stark
   auseinanderliegen (z. B. eigene Daten 70:30, TrainerHill 45:55), fällt das aktuell
   nirgends auf.

**Ziel dieser Spec:** Alle drei Punkte beheben, bevor Konfidenzbänder (Spec 3) oder
Prognosen (Spec 5) auf denselben — sonst weiterhin fehlerhaften — Zahlen aufbauen.

## User Stories

- Als Spieler, der Field-Score/Matchup-Matrix zur Deck-Wahl nutzt, will ich, dass Remis
  korrekt gewichtet werden, damit Matchups mit vielen Ties nicht systematisch verzerrt
  angezeigt werden.
- Als Spieler, der ein Regionals-Ergebnis (Bo3) logge, will ich, dass mein persönlicher
  Win-Rate-Wert mit der (Bo1-basierten) Online-Meta vergleichbar bleibt, statt Äpfel mit
  Birnen zu vergleichen.
- Als Konrad, der die Meta-Pipeline debuggt, will ich einen sichtbaren Hinweis, wenn eigene
  Pairing-Daten und TrainerHill-Fallback für denselben Matchup deutlich auseinanderliegen,
  damit ich weiß, welcher Zahl ich trauen kann, statt dass ein Wert stillschweigend den
  anderen überschreibt.

## Akzeptanzkriterien

**Tie-Handling**
- [ ] Given ein Matchup mit `wins=6, losses=4, ties=2`, when die Win-Rate berechnet wird,
      then ergibt sich `(6 + 2/3) / 12 = 55.6%`, nicht `60%` (aktuelles Verhalten).
- [ ] Beide Fundstellen (`meta.ts:280`, `routes/meta.ts:148`) verwenden dieselbe geteilte
      Funktion aus `packages/shared` — keine zweite, potenziell abweichende Implementierung.
- [ ] Bestehende Vitest-Suiten (`meta.test.ts` u. a.) sind auf die neue Formel angepasst und
      grün; mind. ein neuer Test deckt den Ties-Fall explizit ab (Given/When/Then wie oben).
- [ ] `docs/database.md`/`docs/features.md` beschreiben die Formel korrekt (Doku folgt Code,
      CLAUDE.md §2.7).
- [ ] **`winRatePct` ist in `meta_snapshots` persistiert** (`apps/api/src/db/schema.ts:252`,
      geschrieben von `apps/api/src/jobs/syncMeta.ts:279`) — die Rohdaten (`ties` pro
      Standing) existieren bereits in `tournament_standings.ties`
      (`apps/api/src/db/schema.ts:322`), werden aber von der Sync-Query aktuell **nicht**
      selektiert (`syncMeta.ts:242–248` liest nur `wins, losses`). Der Fix umfasst daher auch:
      `ties` mitselektieren und an `computeMetaSnapshots` durchreichen (der Typ
      `StandingLite.record` hat `ties?: number` laut `meta.ts:10` bereits vorgesehen — reine
      Aktivierung, kein neues Feld).
- [ ] **Einmaliger Backfill-Lauf** über alle historischen `period`-Werte in `meta_snapshots`
      (nicht nur ab Deploy vorwärts), der `winRatePct` mit der korrigierten Formel aus den
      weiterhin vorhandenen `tournament_standings`-Rohdaten neu berechnet — sonst zeigen
      Trend-Charts (Wochen-Vergleich, `docs/features.md` §15) einen Bruch zwischen alten
      (falsch) und neuen (korrekt) Werten am Umstellungsdatum.

**Bo1/Bo3**
- [ ] Match-Log bekommt ein **explizites Pflichtfeld** `bestOf` (`'BO1' | 'BO3'`), das beim
      Loggen eines Spiels abgefragt wird — **keine** Herleitung/Ratung aus `eventType`. Der
      bestehende `eventType` bleibt unverändert (Event-Kategorie ≠ Spielformat, siehe
      `apps/api/src/db/schema.ts:131`).
- [ ] Sinnvoller Default abhängig von `eventType` als Vorbelegung im UI erlaubt (z. B.
      `Regional`/`Worlds` → `BO3` vorausgewählt), aber immer **änderbar** — der gespeicherte
      Wert kommt vom Nutzer, nicht aus einer stillen Ableitung.
- [ ] Wenn eine persönliche Win-Rate gegen die Bo1-Meta-Baseline dargestellt wird (Field-Score,
      Recommendations), wird für Logs mit `bestOf = 'BO3'` eine Bo3→Bo1-Rückrechnung
      (Umkehrung von `P_Bo3 = 3p² − 2p³`) angewendet, bevor der Wert mit der Bo1-Baseline
      verglichen wird; Logs mit `bestOf = 'BO1'` bleiben unverändert.
- [ ] Bestehende Logs ohne `bestOf`-Wert (Altbestand vor diesem Fix) werden nicht stillschweigend
      auf einen Default gemappt — UI zeigt sie erkennbar als "Format unbekannt" und schließt sie
      aus dem Bo1-Vergleich aus, bis nachgepflegt (Migrations-Ansatz siehe Entscheidungen unten).
- [ ] Kein bestehendes Verhalten für Logs mit `bestOf = 'BO1'` ändert sich.

**Quellen-Konsistenz**
- [ ] `loadMatchupData` markiert (mind. serverseitig geloggt, idealerweise im
      `matchupSource`-Response-Feld) Matchup-Paare, bei denen eigene Daten (≥
      `MIN_MATCHUP_GAMES`) und TrainerHill-Wert um mehr als einen konfigurierbaren
      Schwellwert (Vorschlag: 15 Prozentpunkte) auseinanderliegen.
- [ ] Ein neuer Test deckt den Konflikt-Fall ab: eigene Daten 70:30, TrainerHill 45:55 →
      Konflikt-Flag gesetzt, eigener Wert bleibt aber weiterhin die angezeigte Zahl (Quelle
      der Wahrheit ändert sich nicht, nur die Sichtbarkeit des Konflikts).
- [ ] Keine Performance-Regression im `/api/meta/matchups`-Endpoint messbar (Vergleich vor/
      nach, gleiche Datenmenge).

## Out of Scope

- Wilson-Score-Konfidenzintervalle / Ablösung des `MIN_MATCHUP_GAMES`-Cutoffs → Spec 3.
- Verknüpfung von Empfehlungen mit Field-Score-Deltas → Spec 5.
- Nash-Gleichgewicht/Replicator-Dynamik → Spec 6.
- UI-Redesign der Personal-Tracker-Eingabe → Spec 4.
- Migration der `tournament_matchups`/Matchup-Matrix-Zellen selbst: die werden in
  `loadMatchupData` (`apps/api/src/routes/meta.ts`) bei jedem Request live aus den
  weiterhin vorhandenen Rohdaten (`aWins`/`bWins`/`ties`) neu berechnet — kein Backfill
  nötig, der Formel-Fix wirkt hier sofort ab Deploy. **Nur** `meta_snapshots.win_rate_pct`
  ist tatsächlich persistiert und braucht den Backfill (siehe AC oben).

## Entscheidungen (bestätigt 2026-08-31)

- **Bo1/Bo3-Erfassung:** explizites Feld beim Loggen abfragen, **nicht** aus `eventType`
  herleiten/raten — Regelwerk zu `LC`/`LCup`/`Online` ist nicht verlässlich stabil genug für
  eine automatische Ableitung. Umgesetzt oben als eigenes AC-Set.
- **Persistenz-Frage — geklärt durch Code-Lektüre, keine Rückfrage nötig:** Ja, `winRatePct`
  ist persistiert (`meta_snapshots.win_rate_pct`), geschrieben vom wöchentlichen Sync-Job.
  Die zur Korrektur nötigen `ties`-Rohdaten existieren bereits in `tournament_standings`,
  werden aber vom Sync aktuell nicht gelesen. Konsequenz (oben als AC ergänzt): Sync-Query
  erweitern **und** einmaligen Backfill über alle historischen Perioden fahren, sonst bricht
  die Trendlinie am Umstellungsdatum.
- **Migration von Alt-Logs ohne `bestOf`:** kein blockierendes/wiederkehrendes Reminder-
  Banner — passt nicht zu einer Hobby-App mit überschaubarer Log-Zahl und würde nur nerven.
  Stattdessen: einmaliger, **dismissable** Hinweis beim ersten Öffnen eines Alt-Logs nach dem
  Rollout ("Format unbekannt — jetzt nachtragen?"), danach dauerhaft nur das in den ACs
  bereits festgelegte "Format unbekannt"-Badge, ohne weiteres Nachhaken. Reversibel und
  risikoarm genug für einen Default ohne Rückfrage — bei Bedarf im Review nachschärfen.
