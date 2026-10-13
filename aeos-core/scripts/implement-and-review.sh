#!/usr/bin/env zsh
#
# AEOS Implement & Review — implements tasks via auggie, then reviews the output.
# Handles both git-tracked code (src/) and untracked .aeos/ artifacts.
#
# Usage: zsh scripts/implement-and-review.sh
#

set -euo pipefail

# ── Node 22 LTS (Homebrew keg-only) ──
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"

# ── Configuration ──────────────────────────────────────────────────
TASK_DIR="docs/tasks"
REVIEW_DIR="code-review"
BRANCH="main"
MAX_FIX_ATTEMPTS=3

# ── Map task → expected output files ──────────────────────────────
typeset -A TASK_OUTPUTS
TASK_OUTPUTS=(
  M3-002-AEOS-2-prd-structure-rubric.md        ".aeos/rubrics/structure/prd-structure.md"
  M3-003-AEOS-3-prd-template.md                ".aeos/templates/prd-template.md"
  M3-004-AEOS-4-intent-drift-rubric.md         ".aeos/rubrics/drift/intent-drift.md"
  M4-001-AEOS-5-architect-agent-spec.md        ".aeos/agents/architect-agent.yaml"
  M4-002-AEOS-6-spike-template.md              ".aeos/templates/spike-template.md"
  M4-003-AEOS-7-tech-spec-rubric.md            ".aeos/rubrics/structure/tech-spec-structure.md"
  M4-004-AEOS-8-tech-spec-template.md          ".aeos/templates/tech-spec-template.md"
  M5a-001-AEOS-9-engineer-agent-spec.md        ".aeos/agents/engineer-agent.yaml"
  M5a-002-AEOS-10-impl-notes-template.md       ".aeos/templates/impl-notes-template.md"
  M5a-003-AEOS-11-impl-structure-rubric.md     ".aeos/rubrics/structure/impl-structure.md"
  M5a-004-AEOS-12-constraints-injection.md     "src/"
  M5b-001-AEOS-13-code-structure-rubric.md     ".aeos/rubrics/structure/code-structure.md"
  M5b-002-AEOS-14-diff-injection.md            "src/"
  M6-001-AEOS-15-deploy-column-design.md       ".aeos/docs/deploy-phase-design.md"
  M6-002-AEOS-16-qa-agent-spec.md              ".aeos/agents/qa-agent.yaml"
  M6-003-AEOS-17-qa-report-template.md         ".aeos/templates/qa-report-template.md"
  M6-004-AEOS-18-qa-structure-rubric.md        ".aeos/rubrics/structure/qa-report-structure.md"
  M6-005-AEOS-19-dod-evaluation-rubric.md      ".aeos/rubrics/dod/dod-evaluation.md"
  M6-006-AEOS-20-dod-gate-cli.md               "src/"
)

# ── Helper: is this a code task (src/) or artifact task (.aeos/)? ──
is_code_task() {
  [[ "${TASK_OUTPUTS[$1]}" == "src/" ]]
}

# ── Helper: collect output files for a task ────────────────────────
collect_output_files() {
  local task_file="$1"
  local output_path="${TASK_OUTPUTS[$task_file]}"
  if is_code_task "$task_file"; then
    git diff --name-only HEAD -- src/ 2>/dev/null || true
    git diff --cached --name-only -- src/ 2>/dev/null || true
  else
    if [ -f "$output_path" ]; then
      echo "$output_path"
    elif [ -d "$output_path" ]; then
      find "$output_path" -type f 2>/dev/null
    fi
  fi
}

# ── Helper: build file content block for review prompt ─────────────
build_file_content() {
  local files="$1"
  local content=""
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    [ ! -f "$f" ] && continue
    content+="
--- FILE: ${f} ---
$(cat "$f")
--- END FILE ---
"
  done <<< "$files"
  echo "$content"
}

# ── Helper: verify build for code tasks ────────────────────────────
verify_or_fix() {
  local task_name="$1" task_file="$2"
  for attempt in $(seq 1 "$MAX_FIX_ATTEMPTS"); do
    npm run lint:fix 2>/dev/null || true
    if npm run typecheck 2>/dev/null && npm run lint 2>/dev/null && npm test 2>/dev/null; then
      echo "  ✓ Build verification passed"; return 0
    fi
    if [ "$attempt" -eq "$MAX_FIX_ATTEMPTS" ]; then
      echo "  ✗ Build still failing after $MAX_FIX_ATTEMPTS attempts for $task_name"; exit 1
    fi
    local errors; errors=$(npm run typecheck 2>&1; npm run lint 2>&1; npm test 2>&1) || true
    auggie --print "Fix ALL build errors for task ${TASK_DIR}/${task_file}. Do NOT commit.
Build output:
${errors}"
  done
}

# ── Pre-flight checks ─────────────────────────────────────────────
command -v auggie >/dev/null 2>&1 || { echo "✗ auggie CLI not found"; exit 1; }
command -v git    >/dev/null 2>&1 || { echo "✗ git not found"; exit 1; }
command -v npm    >/dev/null 2>&1 || { echo "✗ npm not found"; exit 1; }

git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH"
mkdir -p "$REVIEW_DIR"

# ── Tasks in dependency order ──────────────────────────────────────
TASKS=(
  "M3-002-AEOS-2-prd-structure-rubric.md"
  "M3-003-AEOS-3-prd-template.md"
  "M3-004-AEOS-4-intent-drift-rubric.md"
  "M4-001-AEOS-5-architect-agent-spec.md"
  "M4-002-AEOS-6-spike-template.md"
  "M4-003-AEOS-7-tech-spec-rubric.md"
  "M4-004-AEOS-8-tech-spec-template.md"
  "M5a-001-AEOS-9-engineer-agent-spec.md"
  "M5a-002-AEOS-10-impl-notes-template.md"
  "M5a-003-AEOS-11-impl-structure-rubric.md"
  "M5a-004-AEOS-12-constraints-injection.md"
  "M5b-001-AEOS-13-code-structure-rubric.md"
  "M5b-002-AEOS-14-diff-injection.md"
  "M6-001-AEOS-15-deploy-column-design.md"
  "M6-002-AEOS-16-qa-agent-spec.md"
  "M6-003-AEOS-17-qa-report-template.md"
  "M6-004-AEOS-18-qa-structure-rubric.md"
  "M6-005-AEOS-19-dod-evaluation-rubric.md"
  "M6-006-AEOS-20-dod-gate-cli.md"
)

TOTAL=${#TASKS[@]}
CURRENT=0

for TASK_FILE in "${TASKS[@]}"; do
  CURRENT=$((CURRENT + 1))
  TASK_NAME="${TASK_FILE%.md}"
  REVIEW_FILE="${REVIEW_DIR}/REVIEW-${TASK_NAME}.md"
  OUTPUT_PATH="${TASK_OUTPUTS[$TASK_FILE]}"
  START_TIME=$(date '+%H:%M:%S')

  echo ""
  echo "══════════════════════════════════════════"
  echo "▶ [$CURRENT/$TOTAL] $TASK_NAME ($START_TIME)"
  echo "══════════════════════════════════════════"

  # ── Step 1: Implement ──────────────────────────────────────────
  echo "  → Implementing..."
  auggie --print "
Read the task file at ${TASK_DIR}/${TASK_FILE}.
Implement it fully following the agent assigned in the task.
Break the work into implementation chunks.
$(is_code_task "$TASK_FILE" && echo "Run typecheck, lint, and tests after completion.")
Do NOT commit or push.
"

  # ── Step 2: Build verification (code tasks only) ───────────────
  if is_code_task "$TASK_FILE"; then
    verify_or_fix "$TASK_NAME" "$TASK_FILE"
  fi

  # ── Step 3: Collect output files ───────────────────────────────
  FILES=$(collect_output_files "$TASK_FILE")
  if [ -z "$FILES" ]; then
    echo "  ⚠ No output files found (expected: $OUTPUT_PATH) — skipping review"
    continue
  fi
  echo "  → Output files:"
  echo "$FILES" | sed 's/^/      /'

  # ── Step 4: Review output against task ACs ─────────────────────
  FILE_CONTENT=$(build_file_content "$FILES")
  echo "  → Reviewing output against acceptance criteria..."
  auggie --print "
Read the task specification at ${TASK_DIR}/${TASK_FILE}.
Review the following output files against the task's Acceptance Criteria and Definition of Done.

${FILE_CONTENT}

For each acceptance criterion, state PASS or FAIL with a brief justification.
If any criterion FAILs, list the exact fix needed.
Save the review report to ${REVIEW_FILE}.
"

  # ── Step 5: Fix review failures ────────────────────────────────
  if [ -f "$REVIEW_FILE" ] && grep -qi "FAIL" "$REVIEW_FILE"; then
    echo "  → Review found FAIL items — applying fixes..."
    auggie --print "
Read the review report at ${REVIEW_FILE}.
Read the task specification at ${TASK_DIR}/${TASK_FILE}.
Apply ALL fixes for FAIL items. The output files are:
$(echo "$FILES" | sed 's/^/  - /')
$(is_code_task "$TASK_FILE" && echo "Run typecheck, lint, and tests after fixes.")
Do NOT commit or push.
"

    # Re-verify build for code tasks after fixes
    if is_code_task "$TASK_FILE"; then
      verify_or_fix "$TASK_NAME" "$TASK_FILE"
    fi

    # Re-review after fixes
    FILES=$(collect_output_files "$TASK_FILE")
    FILE_CONTENT=$(build_file_content "$FILES")
    echo "  → Re-reviewing after fixes..."
    auggie --print "
Read the task specification at ${TASK_DIR}/${TASK_FILE}.
Re-review the following output files after fixes were applied.

${FILE_CONTENT}

For each acceptance criterion, state PASS or FAIL with a brief justification.
Save the updated review report to ${REVIEW_FILE}.
"
  elif [ -f "$REVIEW_FILE" ]; then
    echo "  ✓ All acceptance criteria passed"
  else
    echo "  ⚠ No review file generated at ${REVIEW_FILE}"
  fi

  # ── Step 6: Commit (code tasks commit src/; artifact tasks skip) ─
  if is_code_task "$TASK_FILE"; then
    echo "  → Committing code changes..."
    git add src/ "${REVIEW_DIR}/" package.json package-lock.json tsconfig.json .github/ 2>/dev/null || true
    git diff --cached --quiet && { echo "  ⚠ No code changes to commit — skipping"; continue; }
    git commit -m "feat(${TASK_NAME}): implement task

Task: ${TASK_DIR}/${TASK_FILE}
Review: ${REVIEW_FILE}"
  else
    echo "  → Artifact task — output in .aeos/ (not tracked in git)"
    # Commit only the review file
    git add "${REVIEW_DIR}/" 2>/dev/null || true
    git diff --cached --quiet || git commit -m "review(${TASK_NAME}): add review report

Task: ${TASK_DIR}/${TASK_FILE}
Review: ${REVIEW_FILE}"
  fi

  END_TIME=$(date '+%H:%M:%S')
  echo "  ✓ $TASK_NAME complete ($START_TIME → $END_TIME)"
done

echo ""
echo "══════════════════════════════════════════"
echo "✓ All $TOTAL tasks implemented and reviewed"
echo "  Reviews: ${REVIEW_DIR}/"
echo "══════════════════════════════════════════"
