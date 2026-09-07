#!/bin/bash
# Docs-Freshness-Gate — blockiert `git commit`, wenn strukturaendernde Aenderungen
# ohne begleitendes Doku-Update im Diff stehen (Golden Rule 7, CLAUDE.md §2).
# Eigenstaendiger Hook, eigener Dirty-Marker, eigener Override — unabhaengig vom
# globalen TDD-/Lint-/Typecheck-Gate (`~/.claude/hooks/tdd-gate.sh`).
# Bindender Vertrag: .claude/plans/docs-sync-automation.md §3.1-3.9.
#
# Registriert unter drei Hook-Typen (siehe .claude/settings.json):
#   PostToolUse  matcher "Edit|Write|MultiEdit"  -> markiert betroffene Doku als dirty
#   PostToolUse  matcher "Bash"                  -> deckt rm/mv/git rm/git mv ab
#   PreToolUse   matcher "Bash"                  -> blockiert `git commit` bei offenem Marker
#
# Schreibt niemals Doku-Inhalte. Bricht eine Session nie durch einen eigenen Fehler ab
# (jeder interne Fehlerpfad endet in exit 0). Block-Events werden zusaetzlich additiv
# nach ~/.claude/logs/agentic-events.jsonl protokolliert (gate: "docs").

PAYLOAD=$(cat)

field() {
  printf '%s' "$PAYLOAD" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    for key in '$1'.split('.'):
        d = d.get(key, {}) if isinstance(d, dict) else {}
    print(d if isinstance(d, str) else (json.dumps(d) if d != {} else ''))
except Exception:
    print('')
" 2>/dev/null
}

EVENT=$(field hook_event_name)
TOOL=$(field tool_name)
CWD=$(field cwd)
CMD=$(field tool_input.command)
FILEPATH=$(field tool_input.file_path)
SUCCESS=$(field tool_response.success)

DIR="${CLAUDE_PROJECT_DIR:-$CWD}"
[ -z "$DIR" ] && exit 0

# Scope-Guards (§3.1, in dieser Reihenfolge, jeweils exit 0 bei Nichterfuellung).
GITDIR=$(git -C "$DIR" rev-parse --absolute-git-dir 2>/dev/null)
[ -z "$GITDIR" ] && exit 0
GITROOT=$(git -C "$DIR" rev-parse --show-toplevel 2>/dev/null)
[ -z "$GITROOT" ] && exit 0
if [ ! -d "$GITROOT/docs" ] || [ ! -f "$GITROOT/CLAUDE.md" ]; then
  exit 0
fi

MARKER="$GITDIR/claude-docs-dirty"
LOG="$GITDIR/claude-docs-gate.log"

# Best-effort Diagnose-/Mapping-Log, niemals stderr (§3.7).
log_diag() {
  local level="$1" text="$2"
  printf '%s %s: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$level" "$text" >>"$LOG" 2>/dev/null
}

# Block-Event additiv fuers agentic-infra-dashboard-Monitoring (analog tdd-gate.sh:59-76).
# Fehler werden verschluckt, beeinflussen den Block nie.
log_block() {
  local event_log="$HOME/.claude/logs/agentic-events.jsonl"
  mkdir -p "$(dirname "$event_log")" 2>/dev/null
  python3 -c "
import json, sys, datetime
event = {
    'timestamp': datetime.datetime.utcnow().isoformat() + 'Z',
    'repo': sys.argv[1],
    'gate': 'docs',
    'command': sys.argv[2][:200],
}
try:
    with open(sys.argv[3], 'a') as f:
        f.write(json.dumps(event) + '\n')
except Exception:
    pass
" "$(basename "$GITROOT")" "$CMD" "$event_log" 2>/dev/null
}

# Schreibt neue Marker-Zeilen (3-Spalten-Tab-Format), sortiert+dedupliziert (sort -u),
# atomar via temp+mv (§3.3).
mark_dirty() {
  [ $# -eq 0 ] && return 0
  local tmpfile
  tmpfile=$(mktemp "${MARKER}.XXXXXX")
  {
    [ -f "$MARKER" ] && cat "$MARKER"
    printf '%s\n' "$@"
  } | sort -u >"$tmpfile"
  mv "$tmpfile" "$MARKER"
}

# Entfernt aus dem Marker alle Zeilen, deren erste Spalte exakt <doc> ist (§3.5-D).
# Existiert danach keine Zeile mehr, wird der Marker geloescht.
clear_doc() {
  local doc="$1"
  [ -f "$MARKER" ] || return 0
  local tmpfile
  tmpfile=$(mktemp "${MARKER}.XXXXXX")
  awk -F'\t' -v doc="$doc" '$1 != doc' "$MARKER" >"$tmpfile"
  if [ -s "$tmpfile" ]; then
    mv "$tmpfile" "$MARKER"
  else
    rm -f "$tmpfile" "$MARKER"
  fi
}

# Pfad-zu-Doku-Zuordnung (§3.4). Schreibt null oder mehr Zeilen "<doc>\t<hint>" auf
# stdout. Ausschluesse zuerst; case-Arme von spezifisch nach allgemein, erster
# Treffer gewinnt.
docs_for() {
  local path="$1"
  case "$path" in
    *.test.ts | *.test.tsx | *.spec.ts | *.spec.tsx) return 0 ;;
    docs/* | specs/* | .claude/* | todo/* | documents/* | node_modules/* | dist/*) return 0 ;;
    *.md) return 0 ;;
    packages/shared/src/index.ts) return 0 ;;
    apps/api/src/db/schema.ts)
      printf 'docs/database.md\t§Server-side schema (apps/api · PostgreSQL via Drizzle)\n'
      printf 'docs/data-types.md\t§Database Entity Types\n'
      ;;
    apps/api/src/routes/meta.ts)
      printf 'docs/features.md\t§2 Live Meta Sync / §13 Matchup Matrix / §15 Archetype Drilldown\n'
      printf 'docs/data-flow.md\t§Meta Sync (Limitless API)\n'
      ;;
    apps/api/src/routes/analysis.ts)
      printf 'docs/features.md\t§8 Battle Log Analysis / §19 Deck Synthesis\n'
      printf 'docs/data-flow.md\t§Deck Synthesis / §Battle Log Analysis\n'
      printf 'docs/ai-system.md\t§2 Schichtenmodell\n'
      ;;
    apps/api/src/routes/analytics.ts)
      printf 'docs/features.md\t§10 Data-Driven Recommendations / §17 Card Performance Deltas\n'
      printf 'docs/data-flow.md\t§Deck Analytics Read Path\n'
      ;;
    apps/api/src/routes/logs.ts)
      printf 'docs/features.md\t§6 Match Log / §7 Battle Log Parsing\n'
      printf 'docs/data-flow.md\t§User Logs a Match / §Server-side Battle-Log Pipeline\n'
      ;;
    apps/api/src/routes/decks.ts)
      printf 'docs/features.md\t§3 Deck Management / §5 Deck Variants\n'
      printf 'docs/data-flow.md\t§Deck Import (Text Paste)\n'
      ;;
    apps/api/src/routes/snapshots.ts)
      printf 'docs/features.md\t§4 Deck Versioning (Snapshots)\n'
      printf 'docs/data-flow.md\t§Snapshot Save and Version Tracking\n'
      ;;
    apps/api/src/routes/matchups.ts)
      printf 'docs/features.md\t§13 Matchup Matrix / §11 Local Meta Configuration\n'
      ;;
    apps/api/src/routes/demo.ts)
      printf 'docs/demo-mode.md\t§What gets seeded\n'
      ;;
    apps/api/src/routes/shared.ts)
      printf 'docs/architecture.md\t§Backend (apps/api)\n'
      ;;
    apps/api/src/routes/*.ts)
      printf 'docs/features.md\t\n'
      printf 'docs/architecture.md\t§Backend (apps/api)\n'
      log_diag INFO "mapping: unmapped route $path"
      ;;
    packages/shared/src/battleLogParser.ts | packages/shared/src/battleLogPrefill.ts)
      printf 'docs/features.md\t§7 Battle Log Parsing\n'
      printf 'docs/data-types.md\t§Battle-Log Prefill Types\n'
      ;;
    packages/shared/src/battleAnalysis.ts)
      printf 'docs/features.md\t§8 Battle Log Analysis\n'
      printf 'docs/data-types.md\t§Battle Log Analysis Types\n'
      printf 'docs/ai-system.md\t§2 Schichtenmodell\n'
      ;;
    packages/shared/src/deckSynthesis.ts)
      printf 'docs/features.md\t§19 Deck Synthesis\n'
      printf 'docs/data-types.md\t§Deck Synthesis Types\n'
      printf 'docs/data-flow.md\t§Deck Synthesis\n'
      printf 'docs/ai-system.md\t§2 Schichtenmodell\n'
      ;;
    packages/shared/src/cardPerformance.ts)
      printf 'docs/features.md\t§17 Card Performance Deltas\n'
      printf 'docs/data-types.md\t§Card Performance Delta Types\n'
      printf 'docs/data-flow.md\t§Card Performance Delta Precomputation\n'
      ;;
    packages/shared/src/nashEquilibrium.ts | packages/shared/src/simplex.ts)
      printf 'docs/features.md\t§18 Game-Theoretic Meta Layer\n'
      printf 'docs/data-types.md\t§Game-Theoretic Meta Layer Types\n'
      printf 'docs/data-flow.md\t§Meta Equilibrium Computation\n'
      ;;
    packages/shared/src/fieldWinRate.ts | packages/shared/src/wilsonInterval.ts | packages/shared/src/winRate.ts | packages/shared/src/bestOf.ts)
      printf 'docs/features.md\t§15 Archetype Drilldown (Field Score)\n'
      printf 'docs/data-types.md\t§Deck Performance Types\n'
      ;;
    packages/shared/src/matchup*.ts)
      printf 'docs/features.md\t§13 Matchup Matrix\n'
      printf 'docs/data-types.md\t§Meta Data Types\n'
      ;;
    packages/shared/src/meta.ts | packages/shared/src/analytics.ts | packages/shared/src/season.ts)
      printf 'docs/data-types.md\t§Meta Data Types\n'
      printf 'docs/features.md\t§1 Meta Overview\n'
      ;;
    packages/shared/src/*.ts)
      printf 'docs/data-types.md\t\n'
      printf 'docs/features.md\t\n'
      log_diag INFO "mapping: unmapped shared module $path"
      ;;
    apps/web/src/components/deck/*)
      printf 'docs/features.md\t§3 Deck Management / §10 Data-Driven Recommendations\n'
      printf 'docs/architecture.md\t§Frontend (apps/web)\n'
      ;;
    apps/web/src/components/meta/*)
      printf 'docs/features.md\t§1 Meta Overview / §13 Matchup Matrix / §15 Archetype Drilldown\n'
      printf 'docs/architecture.md\t§Frontend (apps/web)\n'
      ;;
    apps/web/src/components/recommendations/*)
      printf 'docs/features.md\t§10 Data-Driven Recommendations / §19 Deck Synthesis\n'
      ;;
    apps/web/src/components/opponent/*)
      printf 'docs/features.md\t§6 Match Log\n'
      ;;
    apps/web/src/components/auth/*)
      printf 'docs/demo-mode.md\t§How it works\n'
      printf 'docs/architecture.md\t§Frontend (apps/web)\n'
      ;;
    apps/web/src/components/settings/*)
      printf 'docs/features.md\t§8 Battle Log Analysis (BYOK-Settings)\n'
      printf 'docs/ai-system.md\t§2 Schichtenmodell\n'
      ;;
    apps/web/src/components/layout/*)
      printf 'docs/architecture.md\t§Frontend (apps/web)\n'
      printf 'docs/design-system.md\t§Component classes\n'
      ;;
    apps/web/src/components/shared/*)
      printf 'docs/design-system.md\t§Component classes\n'
      ;;
    apps/web/src/components/*)
      printf 'docs/architecture.md\t§Frontend (apps/web)\n'
      log_diag INFO "mapping: unmapped component $path"
      ;;
    *) return 0 ;;
  esac
}

# Ruft docs_for() fuer $1 auf und schreibt jede Ausgabezeile (ergaenzt um den
# Ausloeser-Pfad als dritte Spalte) in den Marker (§3.5-A.4 / B.4).
add_marks_for() {
  local rel="$1" line lines=()
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    lines+=("$line"$'\t'"$rel")
  done < <(docs_for "$rel")
  [ ${#lines[@]} -eq 0 ] && return 0
  mark_dirty "${lines[@]}"
}

# Baut den Block-Text (§3.6): erste Zeile stabil, dann eine gruppierte Zeile je
# betroffener Doku (Ausloeser kommasepariert), zuletzt Kontext + aufgeloester
# Override-Pfad.
build_block_text() {
  echo "BLOCKED (docs-gate): Strukturaendernde Aenderungen ohne begleitendes Doku-Update."
  echo ""
  awk -F'\t' '
  {
    doc = $1; hint = $2; trig = $3
    if (!(doc in seen)) { seen[doc] = 1; order[++n] = doc }
    if (hint != "") {
      if (hints[doc] == "") { hints[doc] = hint }
      else if (index(hints[doc], hint) == 0) { hints[doc] = hints[doc] " / " hint }
    }
    if (trigs[doc] == "") { trigs[doc] = trig }
    else if (index(trigs[doc], trig) == 0) { trigs[doc] = trigs[doc] ", " trig }
  }
  END {
    for (i = 1; i <= n; i++) {
      d = order[i]
      printf "  %s — %s  <- %s\n", d, hints[d], trigs[d]
    }
  }' "$MARKER"
  echo ""
  echo "CLAUDE.md Golden Rule 7: \"Doku folgt dem Code.\" Erst die genannten Dateien aktualisieren"
  echo "(docs-agent oder von Hand), dann committen — das Gate loescht sich beim Bearbeiten selbst."
  echo "Bewusstes Uebersteuern, wenn die Heuristik danebenlag:"
  echo "  rm $MARKER"
}

case "$EVENT:$TOOL" in
  PostToolUse:Edit | PostToolUse:Write | PostToolUse:MultiEdit)
    [ -z "$FILEPATH" ] && exit 0
    # FILEPATH kommt unaufgeloest aus dem Payload, GITROOT bereits von git aufgeloest
    # (z. B. macOS /var -> /private/var) — beide Seiten muessen fuer den Praefix-
    # Vergleich denselben Aufloesungsstand haben.
    FILEPATH_RESOLVED=$(python3 -c "import os, sys; print(os.path.realpath(sys.argv[1]))" "$FILEPATH" 2>/dev/null)
    [ -z "$FILEPATH_RESOLVED" ] && FILEPATH_RESOLVED="$FILEPATH"
    REL="${FILEPATH_RESOLVED#"$GITROOT"/}"
    [ "$REL" = "$FILEPATH_RESOLVED" ] && exit 0

    case "$REL" in
      docs/*.md)
        clear_doc "$REL"
        exit 0
        ;;
    esac

    case "$REL" in
      apps/web/src/components/*)
        # Neuheits-Test (§3.5-A.3): bestehende (getrackte) Komponenten sind kein Trigger.
        if git -C "$GITROOT" ls-files --error-unmatch -- "$REL" >/dev/null 2>&1; then
          exit 0
        fi
        ;;
    esac

    add_marks_for "$REL"
    exit 0
    ;;
  PostToolUse:Bash)
    case "$SUCCESS" in
      true | True) ;;
      *) exit 0 ;;
    esac
    printf '%s' "$CMD" | grep -qE '(^|[;&|[:space:]])(rm|mv|git[[:space:]]+rm|git[[:space:]]+mv)\b' || exit 0

    # Bekannte Luecke: bei core.quotepath (Default) quotet git Pfade mit
    # Sonderzeichen/Leerzeichen in --porcelain-Ausgabe; docs_for() bekaeme dann
    # den gequoteten String. Praktisch ausgeschlossen in diesem Repo, kein Fix in v1
    # (analog zur dokumentierten Tab/Newline-Luecke in mark_dirty).
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      xy="${line:0:2}"
      rest="${line:3}"
      case "$xy" in
        *D*)
          add_marks_for "$rest"
          ;;
        R*)
          add_marks_for "${rest%% -> *}"
          ;;
      esac
    done < <(git -C "$GITROOT" status --porcelain 2>/dev/null)
    exit 0
    ;;
  PreToolUse:Bash)
    printf '%s' "$CMD" | grep -qE '(^|[;&|[:space:]])git[[:space:]]+commit\b' || exit 0
    [ -s "$MARKER" ] || exit 0

    log_block
    build_block_text >&2
    exit 2
    ;;
  *)
    exit 0
    ;;
esac
