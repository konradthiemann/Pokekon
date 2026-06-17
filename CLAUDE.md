# CLAUDE.md — Arbeits-Verfassung für KI-Assistenten in `pokekon`

> **Zweck:** Diese Datei ist die oberste Leitplanke für **jeden** KI-Assistenten (Claude Code, Cowork, Coding-Agents), der in diesem Repository arbeitet. Sie hat Vorrang vor Einzel-Agent-Definitionen in `.claude/agents/`. Wenn etwas hier mit einem Agent-File kollidiert, gilt diese Datei — und der Widerspruch wird gemeldet, nicht stillschweigend übergangen.
>
> **Für Menschen:** Eine ausführliche, bebilderte Beschreibung des gesamten KI-Systems steht in [`docs/ai-system.md`](./docs/ai-system.md).

---

## 1. Was dieses Projekt ist

**Pokekon** — ein Pokémon-TCG-Meta-Dashboard, das eigene Spiele trackt, das Meta analysiert und datengestützt hilft, Deck **und** Spielweise zu verbessern.

npm-Workspace-Monorepo:

| App | Stack | Rolle |
|-----|-------|-------|
| `apps/web` | React 19 + Vite + Zustand + Dexie (IndexedDB) | local-first Frontend, hält heute noch die meiste Analyse-Logik |
| `apps/api` | Hono + Drizzle ORM + PostgreSQL + better-auth | läuft auf Railway; wandert von „nur CRUD/Auth" zu Analytics-Backend |
| `apps/docs` *(geplant)* | Astro Starlight → GitHub Pages | lebende Dokumentation |

Die Richtung steht in [`docs/backend-evolution-plan.md`](./docs/backend-evolution-plan.md). **Lies diesen Plan, bevor du Architektur-relevante Arbeit beginnst.**

---

## 2. Golden Rules (nicht verhandelbar)

1. **Erst lesen, dann behaupten.** Keine Aussage über bestehenden Code ohne die Datei tatsächlich gelesen zu haben. Keine erfundenen Pfade, Funktionen oder Flags.
2. **Kostenlos bleiben.** Keine kostenpflichtigen APIs, Hosting-Posten oder Dependencies ohne ausdrückliche Freigabe des Users. Free-Tier ist Designziel, kein Zufall.
3. **Secrets gehören serverseitig.** `ANTHROPIC_API_KEY`, `DATABASE_URL`, Auth-Secrets sind Railway-Variablen — niemals im Browser-Bundle, niemals im Git. (Heutiger Browser-seitiger `analyzeBattleLog`-Call ist Alt-Schuld → wandert ins Backend, Plan Abschnitt 6.3.)
4. **Eine Quelle der Wahrheit.** Die Migration IndexedDB → API ist im Gange. Keine neue Datendoppelung einführen; bei Konflikt die im Plan beschlossene Zielrichtung wählen.
5. **Tests & Lint grün = „fertig".** Eine Aufgabe gilt erst als erledigt, wenn `npm run typecheck`, `npm run lint` und `npm run test` durchlaufen. Teilimplementierungen werden als solche markiert.
6. **Anti-Halluzination bei KI-Analyse beibehalten.** Jede LLM-Aussage über ein Spiel braucht einen wörtlichen Evidence-Quote aus dem Log; `temperature=0`; keine Karten vorschlagen, die nicht im Log sichtbar waren. Diese Maßnahmen aus `battleLogAnalysis.ts` dürfen nicht aufgeweicht werden.
7. **Doku folgt dem Code.** Strukturändernde Arbeit aktualisiert die betroffene Doku in `docs/` im selben Zug. Veraltete Doku ist schlechter als keine.

---

## 3. Standard-Workflow

```
Aufgabe verstehen → (nicht-trivial?) plan-agent → implementieren → code-review-agent + security-agent → docs-agent → Gates prüfen
```

- **Nicht-triviale Implementierung** beginnt mit einem Plan (Datei in `.claude/plans/` oder `plan-agent`). Kein Blind-Drauflos-Coden bei Schema-, Architektur- oder Multi-File-Änderungen.
- **Neues User-Input-Processing oder externer API-Call** ⇒ immer `security-agent`, bevor gemergt wird (Deck-Import, Battle-Log-Paste, neue Routen).
- **Daten-/Meta-Feature** ⇒ `ptcg-meta-researcher` → `data-analyst-agent` → `meta-analyst`.
- Wiederverwendbare Prompt-Bausteine für diese Flows liegen in [`.claude/commands/`](./.claude/commands/).

---

## 4. Quality-Gates (vor „erledigt" abhaken)

- [ ] Betroffene Dateien vor Änderung gelesen?
- [ ] `npm run typecheck` grün (keine neuen `any` ohne Begründung)?
- [ ] `npm run lint` grün, Prettier sauber (läuft via husky/lint-staged pre-commit)?
- [ ] `npm run test` grün; neue Logik hat Tests (TDD bevorzugt, `*.test.ts` neben der Datei)?
- [ ] Keine Secrets im Diff, kein kostenpflichtiger Dienst eingeführt?
- [ ] Cold-Start/Empty-State bedacht (kein Deck, keine Logs, kein Meta)?
- [ ] Doku in `docs/` und ggf. `.md`-Companion aktualisiert?

---

## 5. Domänen-Spezifika (leicht zu übersehen)

- **Der Battle-Log-Parser ist deutschsprachig.** `battleLogParser.ts` matcht deutsche TCG-Live-Protokollzeilen („… hat den Münzwurf …", „… hat für die Starthand …"). Beim Erweitern die Sprachannahmen respektieren und mit echten Logs testen.
- **Parser-Versionierung.** Beim Persistieren geparster Logs immer `parserVersion` mitschreiben, damit bei Parser-Verbesserungen gezielt neu geparst werden kann (Plan 5.2 / 3.7).
- **Zwei Verbesserungs-Hebel sauber trennen** (Plan 3.7.4): *Liste* (Karte tauschen) vs. *Spiel* (Zug anders spielen). Empfehlungen müssen kennzeichnen, welcher Hebel gemeint ist.
- **Zeitfenster 1/2/3/4 Wochen** ist ein durchgängiger Analyse-Parameter — neue Aggregate sollen ihn unterstützen.
- **Meta-Daten erst ab Rotation** (Cutoff 2026-03-26) — bestehende Logik nicht versehentlich auf Prä-Rotations-Daten ausweiten.

---

## 6. Was NICHT zu tun ist

- Kein Rewrite des funktionierenden TS-Backends in eine andere Sprache (Entscheidung im Plan, Abschnitt 2). Ein optionaler Python-Service für ML kommt frühestens in Phase 4 als *separater* Konsument derselben DB.
- Keine neuen schweren Aggregationen in der App-Schicht, die in PostgreSQL (Materialized Views) gehören.
- Keine `.md`-Doku erfinden, die der User nicht will (z. B. ungefragte READMEs) — aber bestehende Doku aktuell halten.
- Keine Architektur-Aussagen aus `docs/architecture.md` übernehmen, ohne zu prüfen: Diese Datei ist als „zero-backend" noch **veraltet** (Plan Abschnitt 1) und wird im Zuge der Arbeit korrigiert.

---

## 7. Verweise

- [`docs/ai-system.md`](./docs/ai-system.md) — vollständige KI-System-Doku mit Diagrammen
- [`docs/agents.md`](./docs/agents.md) — Agent-Referenz & Delegations-Flows
- [`docs/backend-evolution-plan.md`](./docs/backend-evolution-plan.md) — Roadmap (Backend, Battle-Log-Zugqualität, Doku-Viewer)
- [`.claude/agents/`](./.claude/agents/) — die 11 spezialisierten Agents
- [`.claude/commands/`](./.claude/commands/) — wiederverwendbare Prompt-Bausteine
- [`docs/README.md`](./docs/README.md) — Doku-Index
