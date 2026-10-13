#!/usr/bin/env bash
#
# AEOS Task Reviewer — runs deep review on each task via auggie,
# then applies all fixes from the review to the task file.
# Each step gets a clean auggie session (no shared context).
#
# Usage:
#   ./scripts/review-tasks.sh                  # review all tasks in TASKS array
#   ./scripts/review-tasks.sh M1-003           # review a single task by prefix
#   ./scripts/review-tasks.sh --dry-run        # print what would run, don't execute
#

set -euo pipefail

# ── Node 22 LTS (Homebrew keg-only — takes priority over system Node) ──
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"

# ── Configuration ──────────────────────────────────────────────────
TASK_DIR="docs/tasks"
REVIEW_DIR="docs/reviews"
DATE=$(date '+%Y%m%d')
DRY_RUN=false

# ── Tasks to review (dependency order) ────────────────────────────
# Edit this array to control which tasks are reviewed.
# Prefix with # to skip a task.
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

# ── Argument parsing ─────────────────────────────────────────────
FILTER=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    *)         FILTER="$arg" ;;
  esac
done

# If a filter was provided, narrow TASKS to matching entries
if [ -n "$FILTER" ]; then
  FILTERED=()
  for t in "${TASKS[@]}"; do
    if [[ "$t" == *"$FILTER"* ]]; then
      FILTERED+=("$t")
    fi
  done
  if [ ${#FILTERED[@]} -eq 0 ]; then
    echo "✗ No tasks match filter: $FILTER"
    echo "  Available: ${TASKS[*]}"
    exit 1
  fi
  TASKS=("${FILTERED[@]}")
fi

# ── Pre-flight checks ─────────────────────────────────────────────
command -v auggie >/dev/null 2>&1 || { echo "✗ auggie CLI not found on PATH. Install: npm install -g @augmentcode/auggie"; exit 1; }

mkdir -p "$REVIEW_DIR"

# ── Main loop ─────────────────────────────────────────────────────
TOTAL=${#TASKS[@]}
CURRENT=0
PASSED=0
FAILED=0

for TASK_FILE in "${TASKS[@]}"; do
  CURRENT=$((CURRENT + 1))
  TASK_NAME="${TASK_FILE%.md}"
  REVIEW_FILE="${REVIEW_DIR}/REVIEW-${DATE}-${TASK_NAME}.md"
  START_TIME=$(date '+%H:%M:%S')

  echo ""
  echo "══════════════════════════════════════════"
  echo "▶ [$CURRENT/$TOTAL] Reviewing: $TASK_NAME ($START_TIME)"
  echo "══════════════════════════════════════════"

  if [ ! -f "${TASK_DIR}/${TASK_FILE}" ]; then
    echo "  ✗ Task file not found: ${TASK_DIR}/${TASK_FILE}"
    FAILED=$((FAILED + 1))
    continue
  fi

  if $DRY_RUN; then
    echo "  [dry-run] Would review: ${TASK_DIR}/${TASK_FILE}"
    echo "  [dry-run] Would save:   ${REVIEW_FILE}"
    echo "  [dry-run] Would apply fixes to: ${TASK_DIR}/${TASK_FILE}"
    continue
  fi

  # ── Step 1: Deep review (clean auggie session) ──────────────
  echo "  → Running deep review..."
  auggie --print "
Run a deep review of the task file at ${TASK_DIR}/${TASK_FILE}.
Cross-reference it against the system design doc (docs/03-system-design.md),
the PRD (docs/02-prd.md), the action plan (docs/05-action-plan-v1.md),
and all related task files in docs/tasks/.
Check for: correctness vs system design, missing dependencies,
file path alignment with the hexagonal scaffold in src/,
consistency with already-reviewed sibling tasks,
and any gaps that would block implementation.
Save the full review report to ${REVIEW_FILE}.
"

  # ── Step 2: Apply fixes (clean auggie session) ──────────────
  if [ -f "$REVIEW_FILE" ]; then
    echo "  → Applying review fixes..."
    auggie --print "
Read the review report at ${REVIEW_FILE}.
Apply ALL fixes from the review — Critical, Major, and Minor — to the
task file at ${TASK_DIR}/${TASK_FILE}.
Do NOT create new files. Only edit the existing task file.
Do NOT commit or push.
"
    PASSED=$((PASSED + 1))
  else
    echo "  ⚠ No review file found at ${REVIEW_FILE} — auggie may have failed"
    FAILED=$((FAILED + 1))
  fi

  END_TIME=$(date '+%H:%M:%S')
  echo "  ✓ $TASK_NAME reviewed and fixed ($START_TIME → $END_TIME)"
done

echo ""
echo "══════════════════════════════════════════"
echo "✓ Review complete: $PASSED passed, $FAILED failed, $TOTAL total"
echo "  Reviews saved to: $REVIEW_DIR/"
echo "══════════════════════════════════════════"
