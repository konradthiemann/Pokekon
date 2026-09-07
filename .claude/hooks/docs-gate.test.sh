#!/bin/bash
# Test harness for .claude/hooks/docs-gate.sh.
#
# Binding contract: .claude/plans/docs-sync-automation.md §3.1-3.8 (Interfaces & Contracts),
# specs/docs-sync-automation.md (acceptance criteria). §3.8 is the harness contract itself:
# each case builds its own temporary git fixture, invokes the hook as a subprocess via
# `env -u CLAUDE_PROJECT_DIR bash "$HOOK" <<<"$payload"` (mandatory isolation — the real
# Pokekon repo's dirty marker must never be touched), and asserts exit code / stderr /
# marker-file content.
#
# Run: bash .claude/hooks/docs-gate.test.sh
# Exit 0 = all cases green, 1 = at least one red. One line per case: "ok - <name>" /
# "not ok - <name>" (+ reason on failure).
#
# This file intentionally contains no implementation of docs-gate.sh itself.

HOOK="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/docs-gate.sh"

PASS_COUNT=0
FAIL_COUNT=0

pass() {
  echo "ok - $1"
  PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
  echo "not ok - $1"
  echo "    reason: $2"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

# Records the first failure only (subsequent checks in the same case become no-ops).
# Relies on bash's dynamic scoping: result/reason are locals of the calling test_case_*
# function and are visible here because bash does not have lexical scoping for locals.
check() {
  local cond="$1" msg="$2"
  if [ "$result" -eq 0 ] && [ "$cond" -ne 0 ]; then
    result=1
    reason="$msg"
  fi
}

# ---------------------------------------------------------------------------
# Fixture builders (§3.8: temporary git repo, docs/ + CLAUDE.md, real example
# paths as empty files, committed so the newness test in §3.5-A.3 sees them
# as tracked).
# ---------------------------------------------------------------------------

setup_fixture() {
  local tmp
  tmp=$(mktemp -d)

  git -C "$tmp" init -q
  mkdir -p "$tmp/docs"
  touch "$tmp/CLAUDE.md"
  touch "$tmp/docs/features.md" "$tmp/docs/data-flow.md" "$tmp/docs/data-types.md" \
    "$tmp/docs/database.md" "$tmp/docs/architecture.md" "$tmp/docs/ai-system.md" \
    "$tmp/docs/demo-mode.md"

  mkdir -p "$tmp/apps/api/src/db" "$tmp/apps/api/src/routes"
  touch "$tmp/apps/api/src/db/schema.ts"
  touch "$tmp/apps/api/src/routes/meta.ts" \
    "$tmp/apps/api/src/routes/decks.ts" \
    "$tmp/apps/api/src/routes/matchups.ts" \
    "$tmp/apps/api/src/routes/tournaments.ts"

  mkdir -p "$tmp/packages/shared/src"
  touch "$tmp/packages/shared/src/battleAnalysis.ts" \
    "$tmp/packages/shared/src/meta.ts" \
    "$tmp/packages/shared/src/meta.test.ts" \
    "$tmp/packages/shared/src/index.ts"

  mkdir -p "$tmp/apps/web/src/components/deck"
  touch "$tmp/apps/web/src/components/deck/DeckPanel.tsx"

  git -C "$tmp" add -A
  git -C "$tmp" -c user.email=test@example.invalid -c user.name=test commit -q -m init >/dev/null

  printf '%s' "$tmp"
}

# Git repo without docs/ (Scope-Guard 3, §3.1).
setup_fixture_no_docs() {
  local tmp
  tmp=$(mktemp -d)

  git -C "$tmp" init -q
  touch "$tmp/CLAUDE.md"
  mkdir -p "$tmp/apps/api/src/db"
  touch "$tmp/apps/api/src/db/schema.ts"
  git -C "$tmp" add -A
  git -C "$tmp" -c user.email=test@example.invalid -c user.name=test commit -q -m init >/dev/null

  printf '%s' "$tmp"
}

marker_path() {
  local repo="$1" gitdir
  gitdir=$(git -C "$repo" rev-parse --absolute-git-dir 2>/dev/null)
  printf '%s/claude-docs-dirty' "$gitdir"
}

log_path() {
  local repo="$1" gitdir
  gitdir=$(git -C "$repo" rev-parse --absolute-git-dir 2>/dev/null)
  printf '%s/claude-docs-gate.log' "$gitdir"
}

write_marker() {
  # $1 = repo, remaining args = pre-built tab-separated lines (see marker_line)
  local repo="$1" marker
  shift
  marker=$(marker_path "$repo")
  mkdir -p "$(dirname "$marker")"
  printf '%s\n' "$@" >"$marker"
}

marker_line() {
  # $1 = doc path, $2 = hint, $3 = trigger path
  printf '%s\t%s\t%s' "$1" "$2" "$3"
}

# ---------------------------------------------------------------------------
# Payload builders (§3.1: hook_event_name, tool_name, cwd, tool_input.file_path,
# tool_input.command, tool_response.success). Built via printf per §3.8.
# ---------------------------------------------------------------------------

edit_payload() {
  # $1 = cwd, $2 = repo-relative file path
  printf '{"hook_event_name":"PostToolUse","tool_name":"Edit","cwd":"%s","tool_input":{"file_path":"%s/%s"},"tool_response":{"success":true}}' \
    "$1" "$1" "$2"
}

write_payload() {
  # $1 = cwd, $2 = repo-relative file path
  printf '{"hook_event_name":"PostToolUse","tool_name":"Write","cwd":"%s","tool_input":{"file_path":"%s/%s"},"tool_response":{"success":true}}' \
    "$1" "$1" "$2"
}

bash_payload() {
  # $1 = cwd, $2 = command, $3 = success ("true"/"false", unquoted JSON literal)
  printf '{"hook_event_name":"PostToolUse","tool_name":"Bash","cwd":"%s","tool_input":{"command":"%s"},"tool_response":{"success":%s}}' \
    "$1" "$2" "$3"
}

pretool_payload() {
  # $1 = cwd, $2 = command
  printf '{"hook_event_name":"PreToolUse","tool_name":"Bash","cwd":"%s","tool_input":{"command":"%s"}}' \
    "$1" "$2"
}

# ---------------------------------------------------------------------------
# Hook invocation (§3.8: mandatory isolation — never touches the real repo's
# marker). Sets LAST_EXIT / LAST_STDOUT / LAST_STDERR.
# ---------------------------------------------------------------------------

run_hook() {
  local payload="$1" out err
  out=$(mktemp)
  err=$(mktemp)
  env -u CLAUDE_PROJECT_DIR bash "$HOOK" <<<"$payload" >"$out" 2>"$err"
  LAST_EXIT=$?
  LAST_STDOUT=$(cat "$out")
  LAST_STDERR=$(cat "$err")
  rm -f "$out" "$err"
}

# =============================================================================
# Case 1 — Edit apps/api/src/db/schema.ts (plan §3.4 row 1)
# =============================================================================
test_case_01() {
  local name="case 1: Edit apps/api/src/db/schema.ts marks database.md + data-types.md"
  local tmp result reason marker lines
  tmp=$(setup_fixture)
  result=0
  reason=""

  run_hook "$(edit_payload "$tmp" "apps/api/src/db/schema.ts")"
  [ "$LAST_EXIT" -eq 0 ]
  check $? "expected exit 0, got $LAST_EXIT (stderr: $LAST_STDERR)"

  marker=$(marker_path "$tmp")
  [ -f "$marker" ]
  check $? "expected marker file at $marker to exist"

  if [ -f "$marker" ]; then
    lines=$(wc -l <"$marker" | tr -d ' ')
    [ "$lines" = "2" ]
    check $? "expected exactly 2 marker lines, got $lines: $(cat "$marker")"

    awk -F'\t' '$1=="docs/database.md" && index($2,"Server-side schema")>0 && $3=="apps/api/src/db/schema.ts"{f=1} END{exit !f}' "$marker"
    check $? "missing docs/database.md line (hint containing 'Server-side schema', trigger apps/api/src/db/schema.ts); marker: $(cat "$marker")"

    awk -F'\t' '$1=="docs/data-types.md" && index($2,"Database Entity Types")>0 && $3=="apps/api/src/db/schema.ts"{f=1} END{exit !f}' "$marker"
    check $? "missing docs/data-types.md line (hint containing 'Database Entity Types', trigger apps/api/src/db/schema.ts); marker: $(cat "$marker")"
  fi

  if [ "$result" -eq 0 ]; then pass "$name"; else fail "$name" "$reason"; fi
  rm -rf "$tmp"
}

# =============================================================================
# Case 2 — Edit apps/api/src/routes/meta.ts twice: dedup (§3.3 invariant)
# =============================================================================
test_case_02() {
  local name="case 2: editing meta.ts twice deduplicates marker lines"
  local tmp result reason marker lines
  tmp=$(setup_fixture)
  result=0
  reason=""

  run_hook "$(edit_payload "$tmp" "apps/api/src/routes/meta.ts")"
  [ "$LAST_EXIT" -eq 0 ]
  check $? "first edit: expected exit 0, got $LAST_EXIT (stderr: $LAST_STDERR)"
  run_hook "$(edit_payload "$tmp" "apps/api/src/routes/meta.ts")"
  [ "$LAST_EXIT" -eq 0 ]
  check $? "second edit: expected exit 0, got $LAST_EXIT (stderr: $LAST_STDERR)"

  marker=$(marker_path "$tmp")
  [ -f "$marker" ]
  check $? "expected marker file at $marker to exist"

  if [ -f "$marker" ]; then
    lines=$(wc -l <"$marker" | tr -d ' ')
    [ "$lines" = "2" ]
    check $? "expected exactly 2 marker lines after editing the same file twice (sort -u), got $lines: $(cat "$marker")"

    awk -F'\t' '$1=="docs/features.md" && index($2,"Live Meta Sync")>0 && $3=="apps/api/src/routes/meta.ts"{f=1} END{exit !f}' "$marker"
    check $? "missing docs/features.md line (hint containing 'Live Meta Sync'); marker: $(cat "$marker")"

    awk -F'\t' '$1=="docs/data-flow.md" && index($2,"Meta Sync")>0 && $3=="apps/api/src/routes/meta.ts"{f=1} END{exit !f}' "$marker"
    check $? "missing docs/data-flow.md line (hint containing 'Meta Sync'); marker: $(cat "$marker")"
  fi

  if [ "$result" -eq 0 ]; then pass "$name"; else fail "$name" "$reason"; fi
  rm -rf "$tmp"
}

# =============================================================================
# Case 3 — Edit packages/shared/src/battleAnalysis.ts (plan §3.4 row 13):
# differentiated mapping reaches docs/ai-system.md too, not just a catch-all.
# =============================================================================
test_case_03() {
  local name="case 3: differentiated mapping for battleAnalysis.ts reaches docs/ai-system.md"
  local tmp result reason marker lines
  tmp=$(setup_fixture)
  result=0
  reason=""

  run_hook "$(edit_payload "$tmp" "packages/shared/src/battleAnalysis.ts")"
  [ "$LAST_EXIT" -eq 0 ]
  check $? "expected exit 0, got $LAST_EXIT (stderr: $LAST_STDERR)"

  marker=$(marker_path "$tmp")
  [ -f "$marker" ]
  check $? "expected marker file at $marker to exist"

  if [ -f "$marker" ]; then
    lines=$(wc -l <"$marker" | tr -d ' ')
    [ "$lines" = "3" ]
    check $? "expected exactly 3 marker lines (features.md, data-types.md, ai-system.md), got $lines: $(cat "$marker")"

    awk -F'\t' '$1=="docs/ai-system.md" && index($2,"Schichtenmodell")>0 && $3=="packages/shared/src/battleAnalysis.ts"{f=1} END{exit !f}' "$marker"
    check $? "missing docs/ai-system.md line (hint containing 'Schichtenmodell'); marker: $(cat "$marker")"

    awk -F'\t' '$1=="docs/features.md" && $3=="packages/shared/src/battleAnalysis.ts"{f=1} END{exit !f}' "$marker"
    check $? "missing docs/features.md line; marker: $(cat "$marker")"

    awk -F'\t' '$1=="docs/data-types.md" && $3=="packages/shared/src/battleAnalysis.ts"{f=1} END{exit !f}' "$marker"
    check $? "missing docs/data-types.md line; marker: $(cat "$marker")"
  fi

  if [ "$result" -eq 0 ]; then pass "$name"; else fail "$name" "$reason"; fi
  rm -rf "$tmp"
}

# =============================================================================
# Case 4 — Edit packages/shared/src/meta.test.ts: test-file exclusion (§3.4).
# =============================================================================
test_case_04() {
  local name="case 4: editing a *.test.ts file produces no marker"
  local tmp result reason marker
  tmp=$(setup_fixture)
  result=0
  reason=""

  run_hook "$(edit_payload "$tmp" "packages/shared/src/meta.test.ts")"
  [ "$LAST_EXIT" -eq 0 ]
  check $? "expected exit 0, got $LAST_EXIT (stderr: $LAST_STDERR)"

  marker=$(marker_path "$tmp")
  [ ! -f "$marker" ]
  check $? "expected no marker file, found $marker with content: $(cat "$marker" 2>/dev/null)"

  if [ "$result" -eq 0 ]; then pass "$name"; else fail "$name" "$reason"; fi
  rm -rf "$tmp"
}

# =============================================================================
# Case 5 — Edit packages/shared/src/index.ts: re-export exclusion (§3.4).
# =============================================================================
test_case_05() {
  local name="case 5: editing packages/shared/src/index.ts produces no marker (re-export exclusion)"
  local tmp result reason marker
  tmp=$(setup_fixture)
  result=0
  reason=""

  run_hook "$(edit_payload "$tmp" "packages/shared/src/index.ts")"
  [ "$LAST_EXIT" -eq 0 ]
  check $? "expected exit 0, got $LAST_EXIT (stderr: $LAST_STDERR)"

  marker=$(marker_path "$tmp")
  [ ! -f "$marker" ]
  check $? "expected no marker file, found $marker with content: $(cat "$marker" 2>/dev/null)"

  if [ "$result" -eq 0 ]; then pass "$name"; else fail "$name" "$reason"; fi
  rm -rf "$tmp"
}

# =============================================================================
# Case 6 — Edit docs/features.md while no marker exists (empty state, §3.5-A.2).
# =============================================================================
test_case_06() {
  local name="case 6: editing docs/features.md with no prior marker stays a no-op"
  local tmp result reason marker
  tmp=$(setup_fixture)
  result=0
  reason=""

  run_hook "$(edit_payload "$tmp" "docs/features.md")"
  [ "$LAST_EXIT" -eq 0 ]
  check $? "expected exit 0, got $LAST_EXIT (stderr: $LAST_STDERR)"

  marker=$(marker_path "$tmp")
  [ ! -f "$marker" ]
  check $? "expected no marker file, found $marker with content: $(cat "$marker" 2>/dev/null)"

  if [ "$result" -eq 0 ]; then pass "$name"; else fail "$name" "$reason"; fi
  rm -rf "$tmp"
}

# =============================================================================
# Case 7 — Edit an existing (tracked) component under apps/web/src/components/:
# newness test (§3.5-A.3) must suppress marking.
# =============================================================================
test_case_07() {
  local name="case 7: editing a tracked existing component produces no marker"
  local tmp result reason marker
  tmp=$(setup_fixture)
  result=0
  reason=""

  run_hook "$(edit_payload "$tmp" "apps/web/src/components/deck/DeckPanel.tsx")"
  [ "$LAST_EXIT" -eq 0 ]
  check $? "expected exit 0, got $LAST_EXIT (stderr: $LAST_STDERR)"

  marker=$(marker_path "$tmp")
  [ ! -f "$marker" ]
  check $? "expected no marker file for an existing tracked component, found $marker with content: $(cat "$marker" 2>/dev/null)"

  if [ "$result" -eq 0 ]; then pass "$name"; else fail "$name" "$reason"; fi
  rm -rf "$tmp"
}

# =============================================================================
# Case 8 — Write a new (untracked) component under apps/web/src/components/deck/:
# newness test must let it through (plan §3.4 row 21).
# =============================================================================
test_case_08() {
  local name="case 8: writing a new untracked component under components/deck/ marks features.md + architecture.md"
  local tmp result reason marker lines
  tmp=$(setup_fixture)
  result=0
  reason=""

  touch "$tmp/apps/web/src/components/deck/NewPanel.tsx"

  run_hook "$(write_payload "$tmp" "apps/web/src/components/deck/NewPanel.tsx")"
  [ "$LAST_EXIT" -eq 0 ]
  check $? "expected exit 0, got $LAST_EXIT (stderr: $LAST_STDERR)"

  marker=$(marker_path "$tmp")
  [ -f "$marker" ]
  check $? "expected marker file at $marker to exist"

  if [ -f "$marker" ]; then
    lines=$(wc -l <"$marker" | tr -d ' ')
    [ "$lines" = "2" ]
    check $? "expected exactly 2 marker lines, got $lines: $(cat "$marker")"

    awk -F'\t' '$1=="docs/features.md" && index($2,"Deck Management")>0 && $3=="apps/web/src/components/deck/NewPanel.tsx"{f=1} END{exit !f}' "$marker"
    check $? "missing docs/features.md line (hint containing 'Deck Management'); marker: $(cat "$marker")"

    awk -F'\t' '$1=="docs/architecture.md" && index($2,"Frontend")>0 && $3=="apps/web/src/components/deck/NewPanel.tsx"{f=1} END{exit !f}' "$marker"
    check $? "missing docs/architecture.md line (hint containing 'Frontend'); marker: $(cat "$marker")"
  fi

  if [ "$result" -eq 0 ]; then pass "$name"; else fail "$name" "$reason"; fi
  rm -rf "$tmp"
}

# =============================================================================
# Case 9 — Bash `rm` of a tracked component, success:true, file actually
# deleted: deletion arm (§3.5-B) must mark regardless of the newness test.
# =============================================================================
test_case_09() {
  local name="case 9: Bash rm of a tracked component (success:true) marks the marker"
  local tmp result reason marker lines
  tmp=$(setup_fixture)
  result=0
  reason=""

  rm -f "$tmp/apps/web/src/components/deck/DeckPanel.tsx"

  run_hook "$(bash_payload "$tmp" "rm apps/web/src/components/deck/DeckPanel.tsx" "true")"
  [ "$LAST_EXIT" -eq 0 ]
  check $? "expected exit 0, got $LAST_EXIT (stderr: $LAST_STDERR)"

  marker=$(marker_path "$tmp")
  [ -f "$marker" ]
  check $? "expected marker file at $marker to exist"

  if [ -f "$marker" ]; then
    lines=$(wc -l <"$marker" | tr -d ' ')
    [ "$lines" = "2" ]
    check $? "expected exactly 2 marker lines, got $lines: $(cat "$marker")"

    awk -F'\t' '$1=="docs/features.md" && $3=="apps/web/src/components/deck/DeckPanel.tsx"{f=1} END{exit !f}' "$marker"
    check $? "missing docs/features.md line for the deleted component; marker: $(cat "$marker")"

    awk -F'\t' '$1=="docs/architecture.md" && $3=="apps/web/src/components/deck/DeckPanel.tsx"{f=1} END{exit !f}' "$marker"
    check $? "missing docs/architecture.md line for the deleted component; marker: $(cat "$marker")"
  fi

  if [ "$result" -eq 0 ]; then pass "$name"; else fail "$name" "$reason"; fi
  rm -rf "$tmp"
}

# =============================================================================
# Case 10 — Bash `rm`, success:false: must not mark despite the deletion
# actually happening on disk (§3.5-B step 1: SUCCESS gate comes first).
# =============================================================================
test_case_10() {
  local name="case 10: Bash rm with success:false produces no marker"
  local tmp result reason marker
  tmp=$(setup_fixture)
  result=0
  reason=""

  rm -f "$tmp/apps/web/src/components/deck/DeckPanel.tsx"

  run_hook "$(bash_payload "$tmp" "rm apps/web/src/components/deck/DeckPanel.tsx" "false")"
  [ "$LAST_EXIT" -eq 0 ]
  check $? "expected exit 0, got $LAST_EXIT (stderr: $LAST_STDERR)"

  marker=$(marker_path "$tmp")
  [ ! -f "$marker" ]
  check $? "expected no marker file when success:false, found $marker with content: $(cat "$marker" 2>/dev/null)"

  if [ "$result" -eq 0 ]; then pass "$name"; else fail "$name" "$reason"; fi
  rm -rf "$tmp"
}

# =============================================================================
# Case 11 — PreToolUse `git commit -m test` with a set marker: the gate
# (§3.5-C, §3.6 literal block-text contract).
# =============================================================================
test_case_11() {
  local name="case 11: PreToolUse git commit with a set marker blocks with exit 2 and the documented block text"
  local tmp result reason marker first_line
  tmp=$(setup_fixture)
  result=0
  reason=""

  write_marker "$tmp" \
    "$(marker_line "docs/database.md" "§Server-side schema (apps/api · PostgreSQL via Drizzle)" "apps/api/src/db/schema.ts")" \
    "$(marker_line "docs/data-types.md" "§Database Entity Types" "apps/api/src/db/schema.ts")" \
    "$(marker_line "docs/features.md" "§2 Live Meta Sync" "apps/api/src/routes/meta.ts")"

  run_hook "$(pretool_payload "$tmp" "git commit -m test")"
  [ "$LAST_EXIT" -eq 2 ]
  check $? "expected exit 2, got $LAST_EXIT (stdout: $LAST_STDOUT, stderr: $LAST_STDERR)"

  first_line=$(printf '%s' "$LAST_STDERR" | head -n1)
  if [ "$result" -eq 0 ]; then
    case "$first_line" in
      "BLOCKED (docs-gate):"*) ;;
      *)
        result=1
        reason="expected stderr's first line to start with 'BLOCKED (docs-gate):', got: $first_line"
        ;;
    esac
  fi

  printf '%s' "$LAST_STDERR" | grep -qF "docs/database.md"
  check $? "block text missing docs/database.md; stderr: $LAST_STDERR"
  printf '%s' "$LAST_STDERR" | grep -qF "docs/data-types.md"
  check $? "block text missing docs/data-types.md; stderr: $LAST_STDERR"
  printf '%s' "$LAST_STDERR" | grep -qF "docs/features.md"
  check $? "block text missing docs/features.md; stderr: $LAST_STDERR"
  printf '%s' "$LAST_STDERR" | grep -qF "apps/api/src/db/schema.ts"
  check $? "block text missing trigger apps/api/src/db/schema.ts; stderr: $LAST_STDERR"
  printf '%s' "$LAST_STDERR" | grep -qF "apps/api/src/routes/meta.ts"
  check $? "block text missing trigger apps/api/src/routes/meta.ts; stderr: $LAST_STDERR"

  marker=$(marker_path "$tmp")
  printf '%s' "$LAST_STDERR" | grep -qF "rm "
  check $? "block text missing an 'rm ' override instruction; stderr: $LAST_STDERR"
  printf '%s' "$LAST_STDERR" | grep -qF "$marker"
  check $? "block text missing the resolved marker path $marker; stderr: $LAST_STDERR"

  if [ "$result" -eq 0 ]; then pass "$name"; else fail "$name" "$reason"; fi
  rm -rf "$tmp"
}

# =============================================================================
# Case 12 — PreToolUse `git commit --amend` with a set marker: same regex,
# same block (§3.5-C.1 uses the identical git-commit regex as tdd-gate.sh).
# =============================================================================
test_case_12() {
  local name="case 12: PreToolUse git commit --amend with a set marker also blocks with exit 2"
  local tmp result reason
  tmp=$(setup_fixture)
  result=0
  reason=""

  write_marker "$tmp" "$(marker_line "docs/features.md" "§dummy" "apps/api/src/routes/meta.ts")"

  run_hook "$(pretool_payload "$tmp" "git commit --amend")"
  [ "$LAST_EXIT" -eq 2 ]
  check $? "expected exit 2, got $LAST_EXIT (stdout: $LAST_STDOUT, stderr: $LAST_STDERR)"

  if [ "$result" -eq 0 ]; then pass "$name"; else fail "$name" "$reason"; fi
  rm -rf "$tmp"
}

# =============================================================================
# Case 13 — PreToolUse `git commit` with no marker: exit 0, silent (§3.5-C.2).
# =============================================================================
test_case_13() {
  local name="case 13: PreToolUse git commit without a marker exits 0 with empty stderr"
  local tmp result reason
  tmp=$(setup_fixture)
  result=0
  reason=""

  run_hook "$(pretool_payload "$tmp" "git commit -m test")"
  [ "$LAST_EXIT" -eq 0 ]
  check $? "expected exit 0, got $LAST_EXIT (stderr: $LAST_STDERR)"
  [ -z "$LAST_STDERR" ]
  check $? "expected empty stderr, got: $LAST_STDERR"

  if [ "$result" -eq 0 ]; then pass "$name"; else fail "$name" "$reason"; fi
  rm -rf "$tmp"
}

# =============================================================================
# Case 14 — PreToolUse `npm run test` with a set marker: non-commit commands
# never trigger the gate (§3.5-C.1).
# =============================================================================
test_case_14() {
  local name="case 14: PreToolUse npm run test with a set marker exits 0 with empty stderr"
  local tmp result reason
  tmp=$(setup_fixture)
  result=0
  reason=""

  write_marker "$tmp" "$(marker_line "docs/features.md" "§dummy" "apps/api/src/routes/meta.ts")"

  run_hook "$(pretool_payload "$tmp" "npm run test")"
  [ "$LAST_EXIT" -eq 0 ]
  check $? "expected exit 0, got $LAST_EXIT (stderr: $LAST_STDERR)"
  [ -z "$LAST_STDERR" ]
  check $? "expected empty stderr, got: $LAST_STDERR"

  if [ "$result" -eq 0 ]; then pass "$name"; else fail "$name" "$reason"; fi
  rm -rf "$tmp"
}

# =============================================================================
# Case 15 — Partial clearing (§3.5-D): editing docs/features.md removes only
# its own lines, docs/data-flow.md stays, marker file still exists.
# =============================================================================
test_case_15() {
  local name="case 15: editing docs/features.md clears only its own marker lines (partial clearing)"
  local tmp result reason marker lines
  tmp=$(setup_fixture)
  result=0
  reason=""

  write_marker "$tmp" \
    "$(marker_line "docs/features.md" "§dummy" "apps/api/src/routes/meta.ts")" \
    "$(marker_line "docs/data-flow.md" "§dummy" "apps/api/src/routes/meta.ts")"

  run_hook "$(edit_payload "$tmp" "docs/features.md")"
  [ "$LAST_EXIT" -eq 0 ]
  check $? "expected exit 0, got $LAST_EXIT (stderr: $LAST_STDERR)"

  marker=$(marker_path "$tmp")
  [ -f "$marker" ]
  check $? "expected marker file to still exist at $marker after partial clearing"

  if [ -f "$marker" ]; then
    lines=$(wc -l <"$marker" | tr -d ' ')
    [ "$lines" = "1" ]
    check $? "expected exactly 1 remaining marker line, got $lines: $(cat "$marker")"

    ! awk -F'\t' '$1=="docs/features.md"{f=1} END{exit !f}' "$marker"
    check $? "expected docs/features.md line to be removed; marker: $(cat "$marker")"

    awk -F'\t' '$1=="docs/data-flow.md"{f=1} END{exit !f}' "$marker"
    check $? "expected docs/data-flow.md line to remain; marker: $(cat "$marker")"
  fi

  if [ "$result" -eq 0 ]; then pass "$name"; else fail "$name" "$reason"; fi
  rm -rf "$tmp"
}

# =============================================================================
# Case 16 — Full clearing (§3.5-D): removing the last line deletes the
# marker file entirely.
# =============================================================================
test_case_16() {
  local name="case 16: clearing the last marker line deletes the marker file"
  local tmp result reason marker
  tmp=$(setup_fixture)
  result=0
  reason=""

  write_marker "$tmp" "$(marker_line "docs/features.md" "§dummy" "apps/api/src/routes/meta.ts")"

  run_hook "$(edit_payload "$tmp" "docs/features.md")"
  [ "$LAST_EXIT" -eq 0 ]
  check $? "expected exit 0, got $LAST_EXIT (stderr: $LAST_STDERR)"

  marker=$(marker_path "$tmp")
  [ ! -f "$marker" ]
  check $? "expected marker file $marker to be deleted, but it still exists with content: $(cat "$marker" 2>/dev/null)"

  if [ "$result" -eq 0 ]; then pass "$name"; else fail "$name" "$reason"; fi
  rm -rf "$tmp"
}

# =============================================================================
# Case 17 — No prefix mistake (§3.5-D): clear_doc("docs/data-flow.md") must
# not remove a docs/data-types.md line (exact first-column match only).
# =============================================================================
test_case_17() {
  local name="case 17: clearing docs/data-flow.md does not remove a docs/data-types.md line"
  local tmp result reason marker lines
  tmp=$(setup_fixture)
  result=0
  reason=""

  write_marker "$tmp" "$(marker_line "docs/data-types.md" "§dummy" "apps/api/src/db/schema.ts")"

  run_hook "$(edit_payload "$tmp" "docs/data-flow.md")"
  [ "$LAST_EXIT" -eq 0 ]
  check $? "expected exit 0, got $LAST_EXIT (stderr: $LAST_STDERR)"

  marker=$(marker_path "$tmp")
  [ -f "$marker" ]
  check $? "expected docs/data-types.md line to remain untouched, but marker $marker is gone"

  if [ -f "$marker" ]; then
    lines=$(wc -l <"$marker" | tr -d ' ')
    [ "$lines" = "1" ]
    check $? "expected exactly 1 unchanged marker line, got $lines: $(cat "$marker")"

    awk -F'\t' '$1=="docs/data-types.md"{f=1} END{exit !f}' "$marker"
    check $? "expected docs/data-types.md line to remain; marker: $(cat "$marker")"
  fi

  if [ "$result" -eq 0 ]; then pass "$name"; else fail "$name" "$reason"; fi
  rm -rf "$tmp"
}

# =============================================================================
# Case 18 — Malformed payloads: `{}` and non-JSON must both exit 0 silently
# (§3.5-E, §3.1 exit code table: any internal error -> exit 0).
# =============================================================================
test_case_18() {
  local name="case 18: malformed payloads ({} and non-JSON) exit 0 with empty stderr"
  local result reason
  result=0
  reason=""

  run_hook '{}'
  [ "$LAST_EXIT" -eq 0 ]
  check $? "payload '{}': expected exit 0, got $LAST_EXIT (stderr: $LAST_STDERR)"
  [ -z "$LAST_STDERR" ]
  check $? "payload '{}': expected empty stderr, got: $LAST_STDERR"

  run_hook 'kein-json'
  [ "$LAST_EXIT" -eq 0 ]
  check $? "payload 'kein-json': expected exit 0, got $LAST_EXIT (stderr: $LAST_STDERR)"
  [ -z "$LAST_STDERR" ]
  check $? "payload 'kein-json': expected empty stderr, got: $LAST_STDERR"

  if [ "$result" -eq 0 ]; then pass "$name"; else fail "$name" "$reason"; fi
}

# =============================================================================
# Case 19 — cwd points at a directory with no git repo (Scope-Guard 1, §3.1).
# =============================================================================
test_case_19() {
  local name="case 19: cwd without a git repo exits 0 without error"
  local tmp result reason
  tmp=$(mktemp -d)
  result=0
  reason=""

  run_hook "$(edit_payload "$tmp" "apps/api/src/db/schema.ts")"
  [ "$LAST_EXIT" -eq 0 ]
  check $? "expected exit 0, got $LAST_EXIT (stderr: $LAST_STDERR)"
  [ -z "$LAST_STDERR" ]
  check $? "expected empty stderr, got: $LAST_STDERR"

  if [ "$result" -eq 0 ]; then pass "$name"; else fail "$name" "$reason"; fi
  rm -rf "$tmp"
}

# =============================================================================
# Case 20 — git repo without docs/: Scope-Guard 3 (§3.1) must suppress marking.
# =============================================================================
test_case_20() {
  local name="case 20: a git repo without a docs/ directory exits 0 without marking"
  local tmp result reason marker
  tmp=$(setup_fixture_no_docs)
  result=0
  reason=""

  run_hook "$(edit_payload "$tmp" "apps/api/src/db/schema.ts")"
  [ "$LAST_EXIT" -eq 0 ]
  check $? "expected exit 0, got $LAST_EXIT (stderr: $LAST_STDERR)"

  marker=$(marker_path "$tmp")
  [ ! -f "$marker" ]
  check $? "expected no marker file (Scope-Guard: missing docs/), found $marker with content: $(cat "$marker" 2>/dev/null)"

  if [ "$result" -eq 0 ]; then pass "$name"; else fail "$name" "$reason"; fi
  rm -rf "$tmp"
}

# =============================================================================
# Case 21 — Unknown route (plan §3.4 row 11): fallback mapping applies AND a
# `mapping: unmapped route <path>` line lands in claude-docs-gate.log, never
# on stderr (§3.7).
# =============================================================================
test_case_21() {
  local name="case 21: an unknown route falls back to features.md/architecture.md and logs 'mapping: unmapped route'"
  local tmp result reason marker log
  tmp=$(setup_fixture)
  result=0
  reason=""

  run_hook "$(edit_payload "$tmp" "apps/api/src/routes/tournaments.ts")"
  [ "$LAST_EXIT" -eq 0 ]
  check $? "expected exit 0, got $LAST_EXIT (stderr: $LAST_STDERR)"
  [ -z "$LAST_STDERR" ]
  check $? "logging must never go to stderr; got: $LAST_STDERR"

  marker=$(marker_path "$tmp")
  [ -f "$marker" ]
  check $? "expected marker file at $marker to exist (fallback mapping)"

  if [ -f "$marker" ]; then
    awk -F'\t' '$1=="docs/features.md" && $3=="apps/api/src/routes/tournaments.ts"{f=1} END{exit !f}' "$marker"
    check $? "missing fallback docs/features.md line; marker: $(cat "$marker")"

    awk -F'\t' '$1=="docs/architecture.md" && index($2,"Backend")>0 && $3=="apps/api/src/routes/tournaments.ts"{f=1} END{exit !f}' "$marker"
    check $? "missing fallback docs/architecture.md line (hint containing 'Backend'); marker: $(cat "$marker")"
  fi

  log=$(log_path "$tmp")
  [ -f "$log" ]
  check $? "expected log file at $log to exist"
  if [ -f "$log" ]; then
    grep -qF "mapping: unmapped route apps/api/src/routes/tournaments.ts" "$log"
    check $? "log file missing 'mapping: unmapped route apps/api/src/routes/tournaments.ts'; log: $(cat "$log")"
  fi

  if [ "$result" -eq 0 ]; then pass "$name"; else fail "$name" "$reason"; fi
  rm -rf "$tmp"
}

# =============================================================================
# Case 22 — Two triggers for the same doc, block-text grouping (plan §3.8
# table, row 22; coordinator decision 2026-09-07: use a pair that actually
# overlaps per the §3.4 mapping table instead of the originally-named
# schema.ts + routes/decks.ts pair, which target disjoint docs).
#
# `packages/shared/src/meta.ts` (row 19: docs/data-types.md §Meta Data Types
# · docs/features.md §1 Meta Overview) and `apps/api/src/routes/matchups.ts`
# (row 8: docs/features.md §13 Matchup Matrix / §11 Local Meta Configuration)
# both target docs/features.md (with different section hints) — the real
# case for the "grouped, comma-separated triggers" behaviour from §3.6.
# =============================================================================
test_case_22() {
  local name="case 22: two triggers for the same doc (meta.ts + matchups.ts) group into one docs/features.md line"
  local tmp result reason
  tmp=$(setup_fixture)
  result=0
  reason=""

  run_hook "$(edit_payload "$tmp" "packages/shared/src/meta.ts")"
  [ "$LAST_EXIT" -eq 0 ]
  check $? "first edit (meta.ts): expected exit 0, got $LAST_EXIT (stderr: $LAST_STDERR)"

  run_hook "$(edit_payload "$tmp" "apps/api/src/routes/matchups.ts")"
  [ "$LAST_EXIT" -eq 0 ]
  check $? "second edit (matchups.ts): expected exit 0, got $LAST_EXIT (stderr: $LAST_STDERR)"

  run_hook "$(pretool_payload "$tmp" "git commit -m test")"
  [ "$LAST_EXIT" -eq 2 ]
  check $? "expected exit 2 for git commit with a set marker, got $LAST_EXIT (stdout: $LAST_STDOUT, stderr: $LAST_STDERR)"

  local features_count
  features_count=$(printf '%s\n' "$LAST_STDERR" | grep -cF "docs/features.md")
  [ "$features_count" = "1" ]
  check $? "expected docs/features.md to appear exactly once (grouped, not duplicated), got $features_count; stderr: $LAST_STDERR"

  local features_line
  features_line=$(printf '%s\n' "$LAST_STDERR" | grep -F "docs/features.md")
  if [ "$result" -eq 0 ]; then
    case "$features_line" in
      *"packages/shared/src/meta.ts"*"apps/api/src/routes/matchups.ts"* | *"apps/api/src/routes/matchups.ts"*"packages/shared/src/meta.ts"*) ;;
      *)
        result=1
        reason="expected the single docs/features.md line/entry to name both triggers (packages/shared/src/meta.ts and apps/api/src/routes/matchups.ts, comma-separated per §3.6); got: $features_line"
        ;;
    esac
  fi

  local data_types_count
  data_types_count=$(printf '%s\n' "$LAST_STDERR" | grep -cF "docs/data-types.md")
  [ "$data_types_count" = "1" ]
  check $? "expected docs/data-types.md to appear exactly once (meta.ts's other mapping), got $data_types_count; stderr: $LAST_STDERR"
  printf '%s' "$LAST_STDERR" | grep -qF "packages/shared/src/meta.ts"
  check $? "block text missing trigger packages/shared/src/meta.ts anywhere; stderr: $LAST_STDERR"

  if [ "$result" -eq 0 ]; then pass "$name"; else fail "$name" "$reason"; fi
  rm -rf "$tmp"
}

# ---------------------------------------------------------------------------
# Run all 22 mandatory cases (plan §3.8 table).
# ---------------------------------------------------------------------------

test_case_01
test_case_02
test_case_03
test_case_04
test_case_05
test_case_06
test_case_07
test_case_08
test_case_09
test_case_10
test_case_11
test_case_12
test_case_13
test_case_14
test_case_15
test_case_16
test_case_17
test_case_18
test_case_19
test_case_20
test_case_21
test_case_22

echo ""
echo "$PASS_COUNT passed, $FAIL_COUNT failed (of $((PASS_COUNT + FAIL_COUNT)))"

if [ "$FAIL_COUNT" -eq 0 ]; then
  exit 0
else
  exit 1
fi
