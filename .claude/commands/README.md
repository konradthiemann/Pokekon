# `.claude/commands/` — Prompt-Bausteine

Wiederverwendbare Slash-Command-Prompts, die die Standard-Flows aus `CLAUDE.md` operationalisieren. Aufruf in Claude Code via `/feature`, `/review`, `/port-to-backend`, `/docs-sync`. `$ARGUMENTS` wird durch den nachgestellten Text ersetzt.

| Command | Zweck |
|---------|-------|
| `/feature` | Neues Feature: Plan → Implement → Review → Docs → Gates |
| `/review` | Strukturiertes, rein lesendes Code-/Security-Review |
| `/port-to-backend` | Frontend-Logik gemäß Evolution-Plan ins Backend ziehen |
| `/docs-sync` | Doku mit Code-Stand abgleichen (inkl. Architektur-Drift) |

Diese Commands ergänzen — und ersetzen nicht — die spezialisierten Agents in [`../agents/`](../agents/). Übergeordnete Leitplanken stehen in [`../../CLAUDE.md`](../../CLAUDE.md), die Systemübersicht in [`../../docs/ai-system.md`](../../docs/ai-system.md).
