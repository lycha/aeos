# Code Review: Uncommitted Changes — Review Resolution & Filename Normalization

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Uncommitted changes (`git diff HEAD` — 7 modified files, 1 untracked file)

---

## Overall Assessment

This changeset contains **documentation-only changes** — no TypeScript source code is modified. The changes fall into three categories:

1. **Review resolution annotations** (4 files): Previously-identified findings in review docs (`REVIEW-20260408-M4-000b`, `M5a-000`, `M5b-000`, `M6-000`) are marked as "✅ RESOLVED in commit" with strikethrough, and overall verdicts are updated to reflect resolved status. This is good hygiene — it maintains traceability between reviews and fixes.

2. **Column spec filename normalization** (3 files): Task docs (`M5a-003`, `M6-004`, `M6-005`) are updated to replace uppercase YAML filenames (`IMPLEMENTATION.yaml`, `QA.yaml`, `DOD_GATE.yaml`) with lowercase equivalents (`implementation.yaml`, `qa.yaml`, `dod-gate.yaml`), matching the actual `COLUMN_SPEC_FILENAMES` mapping in `yaml-column-spec-loader.adapter.ts`.

3. **New task spec** (1 file): `M2-013a-reviewer-agent-integration-test-fixture.md` — a well-structured task to fix CI-breaking integration tests that depend on `.aeos/` existing on disk.

**Verdict:** Approve with 1 minor finding

---

## Critical Issues

_None._

---

## Major Issues

_None._

---

## Minor Issues

### m1. `dod-gate.yaml` filename assumed but no loader mapping exists

**File:** `docs/tasks/M6-005-AEOS-19-dod-evaluation-rubric.md` (lines 19, 36)

**Problem:**
The task previously referenced `DOD_GATE.yaml` and now references `dod-gate.yaml`. While the lowercase convention is correct and consistent with the other column specs, the `COLUMN_SPEC_FILENAMES` mapping in `yaml-column-spec-loader.adapter.ts` (line 14–21) does **not** include a `DOD_GATE` entry:

```typescript
const COLUMN_SPEC_FILENAMES: Partial<Record<Column, string>> = {
  [Column.PRODUCT_SCOPING]: 'product-scoping',
  [Column.ARCH_SPIKE]: 'architecture-spike',
  [Column.TECH_SPEC]: 'tech-spec',
  [Column.IMPLEMENTATION]: 'implementation',
  [Column.CODE_REVIEW]: 'code-review',
  [Column.QA]: 'qa',
  // No DOD_GATE entry
};
```

The `DOD_GATE` column exists in the `Column` enum (`src/domain/model/column.ts` line 11) but has no spec filename mapping. When the DOD_GATE column spec is eventually created, the loader will need to be updated to add `[Column.DOD_GATE]: 'dod-gate'`. The task doc's assumption of `dod-gate.yaml` is a reasonable forward reference, but it should note that the loader mapping does not yet exist.

**Recommendation:** Add a note to M6-005: _"Requires adding `[Column.DOD_GATE]: 'dod-gate'` to `COLUMN_SPEC_FILENAMES` in `yaml-column-spec-loader.adapter.ts` before this column spec can be loaded."_ Alternatively, track this as a dependency or sub-task.

---

## Positive Observations

1. **Traceability:** Marking review findings as resolved with strikethrough + "✅ RESOLVED in commit" while preserving the original finding text is excellent practice — it maintains the audit trail without losing context.

2. **Filename normalization is correct:** The uppercase-to-lowercase corrections (`IMPLEMENTATION.yaml` → `implementation.yaml`, `QA.yaml` → `qa.yaml`) accurately match the implemented `COLUMN_SPEC_FILENAMES` mapping in the loader adapter. This eliminates a class of "file not found" bugs at runtime.

3. **EOF newline fixes:** Several files had missing trailing newlines (visible as `\ No newline at end of file` in the diff). These are now fixed, which is consistent with Prettier/git conventions.

4. **M2-013a task spec quality:** The new task spec for fixing CI integration tests is thorough — it includes the exact YAML fixture content, step-by-step implementation instructions, cleanup patterns matching existing test conventions (`mkdtempSync` + `afterEach`), and clear acceptance criteria. This is immediately actionable.

5. **Verdict updates are accurate:** The updated verdicts in the review docs correctly reflect which findings were resolved and which remain open (e.g., M5b-000 notes F-1 remains open as a design clarification item; M6-000 notes F-3 and F-4 remain open).

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

## Summary

| Category | Count |
|----------|-------|
| Critical | 0 |
| Major | 0 |
| Minor | 1 |

All changes are documentation-only. The filename normalization is correct and matches the implemented code. The one minor finding (m1) is a forward-reference to a `dod-gate.yaml` filename that has no loader mapping yet — not blocking, but worth noting in the task.

---

## Draft PR Summary

**Summary:**
- Mark resolved review findings in M4-000b, M5a-000, M5b-000, and M6-000 review docs with strikethrough + ✅ RESOLVED
- Update overall verdicts in review docs to reflect resolution status
- Normalize column spec filenames in task docs M5a-003, M6-004, M6-005 from uppercase (`IMPLEMENTATION.yaml`, `QA.yaml`, `DOD_GATE.yaml`) to lowercase (`implementation.yaml`, `qa.yaml`, `dod-gate.yaml`) matching the `COLUMN_SPEC_FILENAMES` loader mapping
- Fix missing trailing newlines in M4-000b and M6-000 review docs
- Add new task M2-013a: reviewer-agent integration test fixture for CI

**Testing:**
- `npm run typecheck` — PASS
- `npm run lint` — PASS
- `npm test` — PASS (29 files, 325 tests)
- No source code changes; all verification is structural (markdown content review)
