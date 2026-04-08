# Code Review: M2-007 — ColumnSpec & AgentSpec Zod Schemas

**Date:** 2026-04-08
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Uncommitted changes — replace stub interfaces with Zod-inferred types

---

## Overall Assessment

This changeset replaces the placeholder `ColumnSpec` and `AgentSpec` interfaces with Zod v4 schema definitions and inferred types. The implementation is clean, well-tested, and follows the pragmatic decision (documented in the prior plan review) to co-locate Zod schemas with domain types. All existing tests have been updated to satisfy the expanded type shapes, and two new comprehensive test suites cover schema parsing, defaults, and validation error cases. Typecheck, lint, and all 265 tests pass.

No critical or major issues found. Three minor improvements are recommended.

**Verdict:** Approve

---

## Critical Issues

_None._

---

## Major Issues

_None._

---

## Minor Issues

### m1. String fields accept empty strings

**File:** `src/domain/model/column-spec.ts` (ColumnSpecSchema), `src/domain/model/agent-spec.ts` (AgentSpecSchema)

**Problem:**
Required string fields (`column`, `workerAgentFile`, `reviewerAgentFile`, `outputArtifact`, `name`, `systemPrompt`, `taskInstruction`, `outputFormat`) use bare `z.string()` which accepts `""`. An empty `column` or `outputArtifact` would pass schema validation but cause downstream failures in the loader or filesystem layer.

**Recommendation:**
Add `.min(1)` to all required string fields, e.g.:
```ts
column: z.string().min(1),
workerAgentFile: z.string().min(1),
```
This catches bad YAML at the validation boundary rather than deep in infrastructure.

---

### m2. Preflight default values duplicated

**File:** `src/domain/model/column-spec.ts` (ColumnSpecSchema, line 17–22)

**Problem:**
The outer `.default({ enabled: true, questionsArtifact: 'questions.md' })` repeats the inner field defaults. If an inner default changes (e.g. `questionsArtifact` default changes to `"preflight-questions.md"`), the outer default won't track — leading to inconsistency depending on whether the entire `preflight` key is omitted vs. partially provided.

**Recommendation:**
Use `.default({})` for the outer default and let inner defaults take effect:
```ts
preflight: z
  .object({
    enabled: z.boolean().default(true),
    questionsArtifact: z.string().default('questions.md'),
  })
  .default({}),
```

---

### m3. Loss of `readonly` type modifier

**File:** `src/domain/model/column-spec.ts`, `src/domain/model/agent-spec.ts`

**Problem:**
The old interfaces used `readonly` fields and `readonly string[]`. `z.infer<>` produces mutable types by default. While this doesn't cause runtime issues, it weakens compile-time immutability guarantees for value objects.

**Recommendation:**
For v1 this is acceptable. When stricter immutability is desired, wrap the inferred type:
```ts
export type ColumnSpec = Readonly<z.infer<typeof ColumnSpecSchema>>;
```
or use `z.readonly()` on array fields. Low priority — track for future hardening.

---

## Positive Observations

1. **Comprehensive test coverage** — both `agent-spec.test.ts` (14 tests) and `column-spec.test.ts` (16 tests) cover required field validation, defaults, optional fields, and invalid enum values.
2. **Existing tests updated correctly** — `prompt-builder.test.ts` and `output-validation.test.ts` factories expanded to include all required fields, preventing type errors.
3. **Sensible defaults** — `minWordCount: 50`, `maxIterations: 3`, `escalation: 'escalate_to_human'`, `advanceMode: 'manual'` provide safe out-of-the-box behavior.
4. **Schema and type co-location** — keeping `z.infer<>` next to the schema avoids duplication and keeps the single source of truth clear.
5. **Barrel exports already wired** — `src/domain/model/index.ts` re-exports both modules; no changes needed.
6. **Zod installed via package manager** — `package.json` and `package-lock.json` updated consistently.

---

## Architecture Compliance

- [x] Dependency direction: `cli → application → domain ← infrastructure`
- [x] Domain layer purity: Zod is a pure validation library with no I/O — accepted per prior plan review
- [x] Barrel exports updated for any new modules — already wired
- [x] Composition root (`container.ts`) updated if new adapters/use cases added — N/A

---

## Verification Notes

- `npm run typecheck` — **PASS**
- `npm run lint` — **PASS**
- `npm test` — **PASS** (24 test files, 265 tests passing)

---

## Summary

| ID | Severity | File | Finding |
|----|----------|------|---------|
| m1 | Minor | `column-spec.ts`, `agent-spec.ts` | String fields accept empty strings — add `.min(1)` |
| m2 | Minor | `column-spec.ts` | Preflight outer `.default()` duplicates inner defaults |
| m3 | Minor | `column-spec.ts`, `agent-spec.ts` | `z.infer` loses `readonly` modifier |

**Totals:** 0 Critical, 0 Major, 3 Minor

---

## Draft PR Summary

**Summary:**
- Replace stub `ColumnSpec` interface with Zod v4 schema (`ColumnSpecSchema`) covering column name, phase, agent file paths, output artifact, word count, required sections, reviewer rubrics, iteration limits, escalation policy, advance mode, and preflight config
- Replace stub `AgentSpec` interface with Zod v4 schema (`AgentSpecSchema`) covering name, role, system prompt, task instruction, output format, self-verification checklist, and executor config
- Add `zod@^4.3.6` as a production dependency
- Add comprehensive test suites for both schemas (30 new tests)
- Update existing test factories in `prompt-builder.test.ts` and `output-validation.test.ts` to satisfy expanded type shapes

**Testing:**
- 24 test files, 265 tests passing
- Typecheck and lint clean

Please review this summary and confirm it matches the intended changes.
