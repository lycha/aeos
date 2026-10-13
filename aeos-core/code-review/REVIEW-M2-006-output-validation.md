# Code Review: M2-006 Output Validation

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Uncommitted changes — `src/domain/model/column-spec.ts`, `src/domain/model/validation-result.ts`, `src/domain/services/output-validation.ts`

---

## Overall Assessment

Clean, well-structured domain service implementing rule-based structural validation for executor output. The code is pure (no I/O), correctly placed in the domain layer, uses proper ESM imports, and has comprehensive test coverage (139 lines of tests across 10 test cases). The implementation follows the project's hexagonal architecture conventions.

Two minor issues found — both relate to consistency with the project's value-object conventions. No critical or major issues.

**Verdict:** Approve with changes

---

## Critical Issues

None.

---

## Major Issues

None.

---

## Minor Issues

### m1. `ValidationResult` properties should be `readonly`

**File:** `src/domain/model/validation-result.ts` (interface `ValidationResult`)

**Problem:**
All other domain value objects use `readonly` on their properties (e.g., `ExecutorResult`, `TokenUsage`, `ColumnSpec`). `ValidationResult.passed` and `ValidationResult.violations` are mutable.

**Recommendation:**
```typescript
export interface ValidationResult {
  readonly passed: boolean;
  readonly violations: readonly string[];
}
```

### m2. `ValidationRule` interface missing JSDoc on `check` method parameters

**File:** `src/domain/services/output-validation.ts` (interface `ValidationRule`)

**Problem:**
The exported `ValidationRule` interface has a doc comment on the interface itself but not on the `check` method's parameters. Other exported port interfaces in the project document their methods (e.g., `Executor`, `TicketRepository`).

**Recommendation:**
Add a brief JSDoc to the `check` method:
```typescript
export interface ValidationRule {
  name: string;
  /** Validates content against the column spec. Returns violations if any. */
  check(content: string, spec: ColumnSpec): ValidationResult;
}
```

### m3. Heading level restriction in `requiredSectionsRule` only matches `#` and `##`

**File:** `src/domain/services/output-validation.ts` (`requiredSectionsRule`)

**Problem:**
The regex `^#{1,2}\\s+` only matches `#` and `##` headings. If LLM output uses `###` for a required section it will be reported as missing. This may be intentional — the comment says "# Section or ## Section" — but it could surprise callers expecting any heading level.

**Recommendation:**
If intentional, no change needed — the comment documents the design choice clearly. If deeper headings should count, change `{1,2}` to `{1,6}`. Worth noting as a design decision for future reference.

---

## Positive Observations

1. **Domain purity maintained** — zero external/infrastructure imports; all three files are pure TypeScript types and logic.
2. **ESM compliance** — all imports use `.js` extensions correctly.
3. **Comprehensive test coverage** — 10 test cases covering each rule individually, aggregation, edge cases (empty content, default word count), and a fully valid golden path.
4. **Regex escape helper** — `escapeRegExp` correctly prevents ReDoS from user-supplied section names.
5. **Extensible rule design** — `ValidationRule` interface allows future custom rules while `BUILT_IN_RULES` are internal constants.
6. **Clean aggregation pattern** — `validateOutput` aggregates violations from all rules into a single result, correctly computing `passed` from the aggregated list.
7. **Barrel exports already wired** — both `src/domain/model/index.ts` and `src/domain/services/index.ts` re-export the new modules.
8. **Test helper functions** — `words()` and `specWith()` are clean and reusable.

---

## Architecture Compliance

- [x] Dependency direction: `cli → application → domain ← infrastructure`
- [x] Domain layer purity: no I/O, no framework imports in `src/domain/`
- [x] Barrel exports updated for new modules
- [ ] Composition root (`container.ts`) updated if new adapters/use cases added — N/A (pure domain service, no wiring needed)

---

## Verification Notes

- `npm run typecheck` — **PASS**
- `npm run lint` — **PASS**
- `npm test` — **PASS** (22 test files, 234 tests passing)

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
- Added `ColumnSpec` stub interface with `minWordCount` and `requiredSections` fields for output validation (to be replaced by Zod schema in M2-007)
- Added `ValidationResult` value object with `passed` boolean and `violations` array
- Implemented `output-validation.ts` domain service with four built-in rules: non-empty, minimum word count, required sections, no unfilled placeholders
- Exported `validateOutput()` as the public API aggregating all rule results
- Added comprehensive unit tests (10 cases) in co-located `output-validation.test.ts`

**Testing:**
- All 234 tests pass (22 test files)
- typecheck and lint both pass

Please review this summary and confirm it matches the intended changes.
