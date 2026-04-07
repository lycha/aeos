# Code Review: [Scope or Feature]

**Date:** [YYYY-MM-DD]
**Reviewer:** [Name/Role]
**Scope:** [Uncommitted changes | Branch diff | PR | Plan]

---

## Overall Assessment

[1-2 paragraph summary of implementation quality and readiness]

**Verdict:** [Approve | Approve with changes | Request changes]

---

## Critical Issues

### C1. [Title]

**File:** `[path]` (function/class)

**Problem:**
[Describe issue]

**Impact:**
[Why it matters]

**Recommendation:**
[Actionable fix]

---

## Major Issues

### M1. [Title]

**File:** `[path]` (function/class)

**Problem:**
[Describe issue]

**Impact:**
[Why it matters]

**Recommendation:**
[Actionable fix]

---

## Minor Issues

### m1. [Title]

**File:** `[path]` (function/class)

**Problem:**
[Describe issue]

**Recommendation:**
[Actionable fix]

---

## Positive Observations

1. [What is done well]
2. [What should be preserved]

---

## Architecture Compliance

- [ ] Dependency direction: `cli → application → domain ← infrastructure`
- [ ] Domain layer purity: no I/O, no framework imports in `src/domain/`
- [ ] Barrel exports updated for any new modules
- [ ] Composition root (`container.ts`) updated if new adapters/use cases added

---

## Verification Notes

- `npm run typecheck` — [PASS/FAIL]
- `npm run lint` — [PASS/FAIL]
- `npm test` — [PASS/FAIL] ([N] tests, [N] passing)
- [Key paths to validate manually]

---

## Draft PR Summary

**Summary:**
- [Bullet list of changes]

**Testing:**
- [Tests run]

Please review this summary and confirm it matches the intended changes.
