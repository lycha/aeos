# Code Review: Uncommitted Documentation Changes — Column-Spec Filename Fixes & Review Resolution Markers

**Date:** 2026-04-08
**Reviewer:** Staff SWE (automated)
**Scope:** Uncommitted changes (`git diff` — 7 modified files, 1 untracked file)

---

## Overall Assessment

This changeset is documentation-only — no TypeScript source code, no tests, no infrastructure changes. The modifications fall into three categories:

1. **Review report updates** (4 files): Previously identified findings in review documents are marked as `~~strikethrough~~ ✅ RESOLVED in commit`, and overall verdicts are updated accordingly. This is good hygiene — it keeps review reports as living documents.
2. **Task doc filename corrections** (3 files): Column spec references are corrected from uppercase (`IMPLEMENTATION.yaml`, `QA.yaml`, `DOD_GATE.yaml`) to lowercase (`implementation.yaml`, `qa.yaml`, `dod-gate.yaml`). This aligns with the actual on-disk convention confirmed by `.aeos/column-specs/` contents: `architecture-spike.yaml`, `implementation.yaml`, `product-scoping.yaml`, `tech-spec.yaml`.
3. **New task file** (1 untracked): `M2-013a-reviewer-agent-integration-test-fixture.md` — a well-structured task to fix CI-failing integration tests by replacing repo-root lookups with inline fixtures.

Because these are all documentation/task files with no runtime impact, the architecture compliance and verification sections are not applicable.

**Verdict:** ✅ Approve

---

## Critical Issues

None.

---

## Major Issues

None.

---

## Minor Issues

### m1. Missing newline at EOF in two review files (pre-existing, fixed in this diff)

**File:** `docs/reviews/REVIEW-20260408-M4-000b-tech-spec-column-spec.md`, `docs/reviews/REVIEW-20260408-M6-000-qa-column-spec.md`

**Problem:**
These files previously lacked a trailing newline. The diff adds one — this is correct POSIX behavior. No action needed; this is a positive fix.

**Recommendation:** Already resolved by this change.

### m2. `dod-gate.yaml` column spec does not yet exist — naming is speculative

**File:** `docs/tasks/M6-005-AEOS-19-dod-evaluation-rubric.md` (lines 19, 36)

**Problem:**
The change renames `DOD_GATE.yaml` → `dod-gate.yaml` in M6-005. While this follows the lowercase-kebab-case pattern established by existing specs (`architecture-spike.yaml`, `tech-spec.yaml`), the `dod-gate.yaml` file does not yet exist. Archive docs (M2-008) indicate `DOD_GATE` was originally designed as a column with **no** column spec (alongside `BACKLOG` and `DONE`). If the DOD_GATE column ultimately has no spec file, this reference will be incorrect regardless of casing.

**Recommendation:** Confirm the design decision: will DOD_GATE have a column spec? If yes, `dod-gate.yaml` is the correct name. If not, these references should note that the rubric will be loaded differently. This is tracked as an open item (I-1) in the M6-000 review.

### m3. New task file `M2-013a` numbering convention

**File:** `docs/tasks/M2-013a-reviewer-agent-integration-test-fixture.md` (untracked)

**Problem:**
The `a` suffix in `M2-013a` is a new pattern — all other tasks use plain numeric IDs (`M2-013`, `M3-001`, etc.). This works but may cause confusion if more sub-tasks are added later.

**Recommendation:** Acceptable for a one-off hotfix task. If this pattern recurs, consider a different convention (e.g., `M2-014`).

---

## Positive Observations

1. **Review resolution tracking is excellent.** Using strikethrough + ✅ RESOLVED markers keeps review reports useful as audit trails without deleting the original analysis.
2. **Filename corrections are verified against actual disk state.** The lowercase filenames (`implementation.yaml`, `qa.yaml`) match the existing `.aeos/column-specs/` contents exactly.
3. **New task M2-013a is well-structured.** It identifies the exact test file, the root cause (`.aeos/` not in CI), the fix pattern (`mkdtempSync` + inline fixture), and has clear acceptance criteria. The inline YAML fixture is a complete copy of `reviewer-agent.yaml`.
4. **No scope creep.** Changes are minimal and focused — no unnecessary reformatting or unrelated edits.

---

## Architecture Compliance

Not applicable — no TypeScript source changes.

---

## Verification Notes

- `npm run typecheck` — N/A (no `.ts` changes)
- `npm run lint` — N/A (no `.ts` changes)
- `npm test` — N/A (no `.ts` changes)
- Markdown rendering: review resolution markers use correct strikethrough syntax (`~~text~~`)

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
- Updated 4 review reports to mark resolved findings with strikethrough + ✅ RESOLVED tags and revised overall verdicts
- Corrected column spec filenames in 3 task docs from uppercase (`IMPLEMENTATION.yaml`, `QA.yaml`, `DOD_GATE.yaml`) to lowercase kebab-case (`implementation.yaml`, `qa.yaml`, `dod-gate.yaml`) matching actual on-disk convention
- Added trailing newlines to 2 files missing POSIX EOF newline
- Added new task `M2-013a`: fix reviewer-agent integration tests to use inline fixtures instead of repo-root `.aeos/` lookups (CI fix)

**Testing:**
- No runtime tests affected — documentation-only changes
- Markdown syntax verified (strikethrough rendering, YAML code blocks)
