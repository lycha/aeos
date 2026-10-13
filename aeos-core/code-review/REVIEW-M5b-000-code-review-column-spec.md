# Code Review: Uncommitted Changes — Column Spec Fixes & Review Annotations

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE automated review)
**Scope:** Uncommitted changes (`git diff HEAD`) — 7 modified files + 1 untracked file

---

## Overall Assessment

The uncommitted changes consist of two categories:

1. **Review annotation updates** (4 files): Prior review findings in `docs/reviews/` are marked as `✅ RESOLVED in commit` with strikethrough formatting, and overall verdict lines are updated to reflect resolved status. These are documentation-only edits that track resolution of previously identified issues.

2. **Task file fixes** (3 files): Downstream task files (`M5a-003`, `M6-004`, `M6-005`) are corrected to use lowercase YAML filenames (`implementation.yaml`, `qa.yaml`, `dod-gate.yaml`) instead of uppercase (`IMPLEMENTATION.yaml`, `QA.yaml`, `DOD_GATE.yaml`), matching the `COLUMN_SPEC_FILENAMES` mapping in `yaml-column-spec-loader.adapter.ts`.

3. **New untracked task file** (1 file): `M2-013a-reviewer-agent-integration-test-fixture.md` — a well-structured task to fix CI-failing integration tests by replacing repo-root file lookups with temp directory fixtures.

All changes are documentation/task-definition only — no source code, no tests, no infrastructure. The risk profile is very low.

**Verdict:** ✅ Approve

---

## Critical Issues

None.

---

## Major Issues

None.

---

## Minor Issues

### m1. Missing trailing newline fixed inconsistently

**File:** `docs/reviews/REVIEW-20260408-M4-000b-tech-spec-column-spec.md` (EOF)

**Problem:**
The diff shows a missing-newline-at-EOF fix (adding `\n` to the last line). The same fix is applied to `REVIEW-20260408-M6-000-qa-column-spec.md`. However, the other two review files (`M5a-000`, `M5b-000`) are not checked for this issue. If those files also lack trailing newlines, the fix is incomplete.

**Recommendation:**
Run `find docs/reviews -name '*.md' -print0 | xargs -0 -I{} sh -c 'test "$(tail -c1 "{}")" && echo "no newline: {}"'` to identify any remaining files missing trailing newlines and fix them in the same commit.

### m2. Untracked file not staged — may be forgotten

**File:** `docs/tasks/M2-013a-reviewer-agent-integration-test-fixture.md`

**Problem:**
This file appears as `??` (untracked) in `git status`. If the intent is to commit it alongside the other changes, it needs to be staged. If it's intentionally separate, no action needed — but the task numbering (`M2-013a`) suggests it's a follow-up to the already-completed M2-013 and belongs with this batch.

**Recommendation:**
Stage the file with `git add docs/tasks/M2-013a-reviewer-agent-integration-test-fixture.md` before committing, or confirm it's intentionally deferred.

### m3. Review verdict in M5b-000 still references open findings inconsistently with sibling

**File:** `docs/reviews/REVIEW-20260408-M5b-000-code-review-column-spec.md` (line 20)

**Problem:**
The updated verdict reads: "F-2, F-3, I-3 resolved in commit. F-1 (worker agent ambiguity) remains open as a design clarification item." However, the consistency table in §7 (lines 184-185) still shows `❌ missing` for Preflight AC and Runtime smoke AC — these are the findings that were supposedly resolved. The table was not updated to reflect the resolved status.

**Recommendation:**
Update the consistency table rows for M5b-000 column to show `✅ (post-review)` for Preflight AC, matching the pattern used for M5a-000 in the same table.

---

## Positive Observations

1. **Consistent fix pattern:** All three task file corrections (`M5a-003`, `M6-004`, `M6-005`) apply the same lowercase filename fix, directly addressing cross-task findings from prior reviews (F-5 in M5a-000 review, F-3 in M5b-000 review, F-4 in M6-000 review). Good traceability.

2. **Strikethrough + resolved annotation:** Using `~~strikethrough~~ ✅ RESOLVED in commit` preserves the original finding text while clearly marking resolution. This is excellent for audit trails — reviewers can see what was found and confirm it was addressed without losing history.

3. **New task M2-013a is well-structured:** The CI fixture task follows project conventions (Context → What needs to be done → AC → Dependencies → DoD), includes the exact YAML fixture content, and specifies the existing test pattern (`mkdtempSync` + `afterEach` cleanup). Actionable and unambiguous.

4. **No source code risk:** All changes are confined to `docs/` — zero risk of runtime regression, type errors, or architectural violations.

---

## Architecture Compliance

- [x] Dependency direction: N/A — no source code changes
- [x] Domain layer purity: N/A — no source code changes
- [x] Barrel exports updated: N/A
- [x] Composition root updated: N/A

---

## Verification Notes

- `npm run typecheck` — N/A (no `.ts` changes)
- `npm run lint` — N/A (no `.ts` changes)
- `npm test` — N/A (no `.ts` changes)
- Manual verification: confirmed `COLUMN_SPEC_FILENAMES` uses lowercase (`'implementation'`, `'code-review'`, `'qa'`) — task file corrections are accurate

---

## Summary by Severity

| Severity | Count |
|----------|-------|
| Critical | 0 |
| Major | 0 |
| Minor | 3 |

---

## Draft PR Summary

**Summary:**
- Mark resolved review findings with strikethrough + `✅ RESOLVED in commit` across 4 review docs (M4-000b, M5a-000, M5b-000, M6-000)
- Fix uppercase YAML filename references in 3 task files: `IMPLEMENTATION.yaml` → `implementation.yaml` (M5a-003), `QA.yaml` → `qa.yaml` (M6-004), `DOD_GATE.yaml` → `dod-gate.yaml` (M6-005)
- Add trailing newlines to 2 review files (M4-000b, M6-000)
- Add new task `M2-013a`: fix reviewer-agent.yaml integration tests for CI by replacing repo-root lookups with temp directory fixtures

**Testing:**
- No source code changes — no tests to run
- Verified lowercase filenames match `COLUMN_SPEC_FILENAMES` mapping in `yaml-column-spec-loader.adapter.ts`

Please review this summary and confirm it matches the intended changes.
