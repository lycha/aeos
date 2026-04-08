# Code Review: M3–M6 Column Spec Tasks + Reviews + Path Fixes

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Commit `c9a9bfe` — "added new tasks" (16 files changed, +1439 −33)

---

## Overall Assessment

This commit adds six column-spec bootstrapping task files (M3-000, M4-000a, M4-000b, M5a-000, M5b-000, M6-000), six corresponding review files, two path-correction edits to existing tasks (M5b-001, M5b-002), and updates `scripts/review-tasks.sh`. No source code is changed — all TypeScript passes typecheck, lint, and 325 tests.

The task files are well-structured, correctly reference the implemented `ColumnSpecSchema` and `YamlColumnSpecLoader`, and all YAML field values will pass Zod validation. The path fixes in M5b-001 and M5b-002 are correct.

**Verdict:** Approve with changes (1 Major, 3 Minor)

---

## Critical Issues

_None._

---

## Major Issues

### M1. Review files contain stale findings that contradict committed task files

**Files:** `docs/reviews/REVIEW-20260408-M5a-000-implementation-column-spec.md`, `docs/reviews/REVIEW-20260408-M5b-000-code-review-column-spec.md`, `docs/reviews/REVIEW-20260408-M6-000-qa-column-spec.md`

**Problem:**
The `review-tasks.sh` script runs a two-step process: (1) generate review, (2) apply fixes. The committed task files already incorporate the fixes, but the review files still describe the pre-fix issues as open findings. Specific contradictions:

| Review File | Finding | Actual Task State |
|---|---|---|
| M5a-000 review F-1 | Rubric path is `impl-structure.md` | Task line 36: `implementation-structure.md` ✅ already fixed |
| M5a-000 review F-2 | No placeholder `engineer-agent.yaml` note | Task line 32: placeholder note present ✅ already fixed |
| M5a-000 review F-3 | Missing preflight AC | Task line 46: preflight AC present ✅ already fixed |
| M5a-000 review F-4 | Missing smoke AC | Task line 47: smoke AC present ✅ already fixed |
| M5b-000 review F-2 | Missing preflight AC | Task line 46: preflight AC present ✅ already fixed |
| M5b-000 review F-3 | M5b-001 uses `CODE_REVIEW.yaml` | M5b-001 line 19/38: `code-review.yaml` ✅ already fixed |
| M5b-000 review I-3 | M5b-002 uses stale paths | M5b-002 line 33: correct paths ✅ already fixed |
| M6-000 review F-1 | Missing preflight AC | Task line 46: preflight AC present ✅ already fixed |
| M6-000 review F-2 | Missing placeholder note | Task line 40: placeholder note present ✅ already fixed |

**Impact:**
Readers will see severity-tagged findings for issues that don't exist in the committed code. This undermines trust in the review artifacts and creates confusion about what's actually outstanding.

**Recommendation:**
Update the three review files to mark the already-applied findings as **RESOLVED** (e.g., strikethrough or `✅ RESOLVED in commit`), keeping only genuinely open findings. Alternatively, regenerate the reviews against the final task state.

---

## Minor Issues

### m1. `.idea/AugmentWebviewStateStore.xml` committed despite `.gitignore`

**File:** `.idea/AugmentWebviewStateStore.xml`

**Problem:**
`.idea/` is in `.gitignore` (line 8), but this file was already tracked before the ignore rule was added. The diff shows IDE session state (chat conversation IDs, model selections) — pure noise in the commit.

**Recommendation:**
Remove from tracking: `git rm --cached .idea/AugmentWebviewStateStore.xml && git commit -m "chore: untrack IDE state file"`

### m2. Two review files missing trailing newline

**Files:** `docs/reviews/REVIEW-20260408-M4-000b-tech-spec-column-spec.md`, `docs/reviews/REVIEW-20260408-M6-000-qa-column-spec.md`

**Problem:**
Both files end without a trailing newline (`\ No newline at end of file` in diff). This violates POSIX text file conventions and may cause noisy diffs on future edits.

**Recommendation:**
Add trailing newline to both files.

### m3. Downstream tasks still reference uppercase column spec filenames

**Files:** `docs/tasks/M5a-003-AEOS-11-impl-structure-rubric.md` (lines 19, 36), `docs/tasks/M6-004-AEOS-18-qa-structure-rubric.md` (lines 19, 36), `docs/tasks/M6-005-AEOS-19-dod-evaluation-rubric.md` (lines 19, 36)

**Problem:**
These tasks reference `IMPLEMENTATION.yaml`, `QA.yaml`, and `DOD_GATE.yaml` respectively. The actual filenames per `COLUMN_SPEC_FILENAMES` are `implementation.yaml`, `qa.yaml`, and (for DOD_GATE) no mapping exists. This commit fixed the same pattern in M5b-001 (`CODE_REVIEW.yaml` → `code-review.yaml`) but missed these three files.

**Recommendation:**
Apply the same fix to M5a-003, M6-004, and M6-005 — replace uppercase column spec filenames with the lowercase versions from the loader mapping.

---

## Positive Observations

1. **Excellent cross-referencing:** Every task file validates its YAML content against the implemented `ColumnSpecSchema`, confirms the `COLUMN_SPEC_FILENAMES` mapping exists in the loader, and lists verified dependencies with completion status.
2. **Consistent template:** All six column-spec tasks follow the identical structure (Context → YAML → Notes → AC → Dependencies → Blocks), making them easy to review as a batch.
3. **Path fixes are correct:** M5b-001's `CODE_REVIEW.yaml` → `code-review.yaml` and M5b-002's `src/prompt/` → `src/application/services/` both align with the actual codebase.
4. **Script update is clean:** `review-tasks.sh` correctly replaces the old M1/M2 task list with the new M3–M6 column-spec tasks.
5. **Design clarifications embedded:** M5b-000 includes an inline note resolving the §2.1 vs §2.2 ambiguity about CODE_REVIEW's worker agent — good proactive documentation.

---

## Architecture Compliance

- [x] Dependency direction: `cli → application → domain ← infrastructure` — N/A (no source changes)
- [x] Domain layer purity — N/A (no source changes)
- [x] Barrel exports — N/A
- [x] Composition root — N/A

---

## Verification Notes

- `npm run typecheck` — PASS
- `npm run lint` — PASS
- `npm test` — PASS (29 files, 325 tests)

---

## Draft PR Summary

**Summary:**
- Add 6 column-spec bootstrapping task files for M3 (PRODUCT_SCOPING), M4a (ARCH_SPIKE), M4b (TECH_SPEC), M5a (IMPLEMENTATION), M5b (CODE_REVIEW), M6 (QA)
- Add 6 corresponding deep review reports
- Fix M5b-001: `CODE_REVIEW.yaml` → `code-review.yaml` (lowercase per loader mapping)
- Fix M5b-002: `src/prompt/` → `src/application/services/` (correct hexagonal path)
- Update `scripts/review-tasks.sh` to target the new column-spec tasks

**Testing:**
- No source changes; typecheck/lint/test all pass (325/325)

Please review this summary and confirm it matches the intended changes.
