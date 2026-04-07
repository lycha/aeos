# Deep Review: M2-006 — Implement Rule-Based Output Validation

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Task specification — `docs/tasks/M2-006-output-validation.md`
**Cross-referenced against:** System design (03-system-design.md §7.5, §6, §7.4), PRD (02-prd.md §5.7), Action plan (05-action-plan-v1.md M2), sibling tasks M2-001, M2-004, M2-005, M2-007, M2-008, M2-009, M2-011, existing scaffold in `src/`, prior reviews for M2-001 through M2-005

---

## Overall Assessment

The task is well-scoped and correctly identifies the file paths (`src/domain/services/output-validation.ts`, `src/domain/model/validation-result.ts`), hexagonal layer (domain service + domain model value object), and core responsibility (structural pre-check before reviewer invocation). The four built-in rules are reasonable and the acceptance criteria cover each one independently plus a passing case.

The task has **one major gap**, **two medium issues**, and **several minor observations**. None are hard blockers.

**Verdict:** Approve with minor required changes.

---

## 1. Correctness vs System Design

### ✅ Purpose and placement in pipeline — ALIGNED

System design §6 (Review Cycle) shows output validation sitting between worker output and reviewer invocation:
```
Worker produces artifact → Output validation (rule-based — see Section 6) → Reviewer prompt assembled
```
The task correctly describes this: "A structural sanity check run on every executor output before it is passed to the reviewer agent." ✓

System design §7.4 (On Failure) states: "artifact not committed → sub-state → FAILED immediately. No silent retry." The task does not prescribe state transitions — correctly, since that is M2-011's responsibility (step 9: `outputValidation.validateOutput(); if violations → stateMachine.setSubState(FAILED)`). ✓

### ⚠️ MEDIUM (M1): System design rule #2 ("file path matches output_spec") is omitted

System design §7.5 defines three validation rules:
1. File is non-empty ✓ (task rule 1)
2. **File path matches output_spec in agent config** ✗ — not in task
3. Required top-level sections present ✓ (task rule 3)

The task's `validateOutput(content: string, columnSpec: ColumnSpec)` takes `content` as a string — it has no file path parameter, so it structurally cannot perform the path check. This check must happen at a different layer (M2-011, which knows the output path and can compare it to the agent config's `outputArtifact`).

**Assessment:** Omitting the path check from this function is architecturally correct — path validation is an orchestration concern, not a content-validation concern. However, the task should document this in "Out of Scope" to prevent confusion.

**Recommendation:** Add to Out of Scope: `- File path matching against output_spec (orchestration concern — handled in M2-011)`

### ✅ Additional rules beyond system design — ALIGNED as improvements

The task adds two rules not in system design §7.5:
- **Minimum word count** (rule 2) — sourced from `columnSpec.minWordCount`, which is defined in M2-007's `ColumnSpecSchema` with default 50. Reasonable addition; catches trivially short outputs.
- **No unfilled placeholders** (rule 4) — catches `[PLACEHOLDER]`, `<PLACEHOLDER>`, `<!-- TODO` patterns. Reasonable addition; catches partially-generated artifacts.

These are sensible extensions consistent with the system design's intent ("Rule-based structural check before any artifact is committed"). No conflict.

### ✅ Required sections source — DELIBERATE SIMPLIFICATION

System design §7.5 says "Required top-level sections present (derived from structure rubric)." The task derives sections from `columnSpec.requiredSections` instead. M2-007 defines `requiredSections: z.array(z.string()).default([])` on `ColumnSpec`. Deriving from column spec is cleaner than parsing rubric markdown at runtime. This is a correct design simplification.

---

## 2. Dependencies

### ✅ M2-007/M2-008 (`ColumnSpec` type) — CORRECT

The task uses `columnSpec.minWordCount` and `columnSpec.requiredSections`. Both are defined in M2-007's `ColumnSpecSchema`:
- `minWordCount: z.number().int().positive().default(50)` ✓
- `requiredSections: z.array(z.string()).default([])` ✓

The dependency declaration says "(can stub with a minimal interface for this task)" — this is appropriate since `output-validation.ts` is a domain service and only needs the type interface, not the Zod schema runtime. A two-field stub (`{ minWordCount: number; requiredSections: string[] }`) suffices for implementation and testing.

### ✅ No circular dependencies

M2-006 depends on M2-007 (ColumnSpec type) only. M2-011 depends on M2-006. Clean DAG. ✓

### ✅ No missing dependencies

The function is pure: `(content: string, columnSpec: ColumnSpec) → ValidationResult`. No ports, no infrastructure, no executor. Correct for a domain service. ✓

---

## 3. File Path Alignment with Hexagonal Scaffold

| Task path | Exists on disk | Content |
|-----------|---------------|---------|
| `src/domain/services/output-validation.ts` | ✓ | `// Domain service — Output validation...` (placeholder) |
| `src/domain/model/validation-result.ts` | ✓ | `// Value Object — ValidationResult...` (placeholder) |
| `src/domain/model/column-spec.ts` | ✓ | `// Value Object — ColumnSpec...` (placeholder, filled by M2-007) |

### ✅ Layer placement is correct

`validateOutput()` is a pure domain service — takes domain model value objects, returns a domain model value object. No port dependencies, no infrastructure. Correct per hexagonal architecture. ✓

### ✅ Barrel exports exist

- `src/domain/services/index.ts` line 3: `export * from './output-validation.js'` ✓
- `src/domain/model/index.ts` line 13: `export * from './validation-result.js'` ✓
- `src/domain/model/index.ts` line 8: `export * from './column-spec.js'` ✓

---

## 4. Consistency with Sibling Tasks

### vs M2-011 (ticket-run use case) — ✅ CONSISTENT

M2-011 step 9: `outputValidation.validateOutput(); if violations → stateMachine.setSubState(FAILED); return violations`. The function name `validateOutput` and return type `ValidationResult { passed, violations }` match. M2-011's Layer Mapping lists `src/domain/services/output-validation.ts — validateOutput()`. ✓

### vs M2-007 (ColumnSpec Zod schema) — ✅ CONSISTENT

Task uses `columnSpec.minWordCount` and `columnSpec.requiredSections`. Both fields exist on M2-007's `ColumnSpecSchema`. Default values (`50` and `[]`) match the task's description ("default 50 if unset"). ✓

### vs M2-005 (PromptBuilder) — ✅ NO CONFLICT

M2-005 builds the prompt input. M2-006 validates the executor output. Independent concerns, no overlap. ✓

### vs M2-004 (ContextAssembler) — ✅ NO CONFLICT

M2-004 assembles context before execution. M2-006 validates after. No overlap. ✓

### vs M2-001 (Executor interface) — ✅ CONSISTENT

M2-001's `ExecutorResult` contains `success: boolean` and `artifactPath: string`. M2-011 reads the artifact content from `artifactPath` and passes it to `validateOutput()`. The executor result and validation result are distinct, non-overlapping types. ✓

### vs M2-009 (Preflight pass) — ✅ NO CONFLICT

Preflight runs before the main executor invocation. Output validation runs after. Different lifecycle points. ✓

---

## 5. Gaps That Would Block Implementation


### ⚠️ MAJOR (GAP-1): `ValidationResult` interface location is ambiguous

The task's "Exports" section shows `ValidationResult`, `ValidationRule`, and `validateOutput` together as a single code block. However, the Layer Mapping says:
- `ValidationResult` → `src/domain/model/validation-result.ts` (domain model)
- `ValidationRule` + `validateOutput` → `src/domain/services/output-validation.ts` (domain service)

The scaffold file `src/domain/model/validation-result.ts` exists but contains only a placeholder comment. The implementer needs to know:
1. Define `ValidationResult` in `src/domain/model/validation-result.ts`
2. Import `ValidationResult` in `src/domain/services/output-validation.ts`
3. Define `ValidationRule` and `validateOutput` in the service file
4. The service file re-exports `ValidationResult` for convenience (or consumers import from model barrel)

**Recommendation:** Split the "Exports" code block into two blocks — one for the model file, one for the service file — with explicit file path headers.

### ⚠️ MEDIUM (M2): `ValidationRule` interface is exported but extensibility is undefined

The task exports a `ValidationRule` interface with `name` and `check()`. The four built-in rules are applied internally by `validateOutput()`. But exposing the interface implies consumers could create custom rules. The task does not specify:
- Whether `validateOutput` accepts custom rules as a parameter
- Whether the built-in rules are exported individually
- Whether the rule set is extensible in v1

If custom rules are v2 scope, the `ValidationRule` interface should still be exported (for forward compatibility) but this should be documented.

**Recommendation:** Add to Technical Notes: `- ValidationRule is exported for forward compatibility. In v1, only the 4 built-in rules run. Custom rule injection is a v2 extension point.`

### ✅ No other blocking gaps

All types referenced (`ColumnSpec`, `ValidationResult`) have scaffold files. The function is pure with no infrastructure dependencies. The acceptance criteria are testable. Implementation should be straightforward.

---

## 6. Minor Issues and Recommendations

### m1: Required section check uses `# <section>` or `## <section>` — consider deeper heading levels

The task specifies checking for `# <section>` or `## <section>`. If a required section appears as `### <section>`, it would be missed. Artifact templates in M3–M6 may use deeper headings. This is a minor edge case — most top-level required sections will be `##`.

**Recommendation:** No action needed for v1. Document the heading-level restriction in Technical Notes if desired.

### m2: Placeholder patterns may produce false positives

Rule 4 checks for `[PLACEHOLDER]`, `<PLACEHOLDER>`, and `<!-- TODO`. The `<!-- TODO` pattern could match legitimate HTML comments in artifacts that reference TODO items. The `<PLACEHOLDER>` pattern could match legitimate XML/HTML tags if any artifact contains angle-bracket content.

**Assessment:** Low risk in practice — AEOS artifacts are Markdown, not HTML. The patterns are restrictive enough (uppercase `PLACEHOLDER`, `<!-- TODO` with space) to avoid most false positives.

**Recommendation:** No action needed. If false positives emerge during dogfooding (M3+), tighten the patterns.

### m3: Word count algorithm unspecified

Rule 2 checks "content word count ≥ `columnSpec.minWordCount`." The task does not specify the word-counting algorithm. Common approaches: split on whitespace (`content.split(/\s+/).length`), split on word boundaries, or use a library. Markdown syntax characters (`#`, `*`, `-`, `>`) may inflate counts.

**Recommendation:** Add to Technical Notes: `- Word count: split on whitespace (\s+), filter empty strings. Markdown syntax tokens count as words — acceptable for a minimum-threshold check.`

### m4: `ColumnSpec` type coupling — consider narrower interface

`validateOutput` takes the full `ColumnSpec` type but only uses `minWordCount` and `requiredSections`. Using a narrower type (e.g., `Pick<ColumnSpec, 'minWordCount' | 'requiredSections'>`) would reduce coupling. However, as a domain service consuming a domain model type, tight coupling is acceptable.

**Assessment:** No action needed. The full `ColumnSpec` is fine for v1.

### m5: Dependency note "(can stub with a minimal interface for this task)" — correct but slightly misleading

Same observation as M2-005 review: by the time M2-006 is implemented, M2-007 should already be complete per the action plan's task ordering. The stub note is appropriate only if M2-006 is implemented in parallel with M2-007.

**Recommendation:** Keep the stub note — it enables parallel development. But clarify: `(can stub with { minWordCount: number; requiredSections: string[] } if implementing before M2-007)`.

---

## Findings Summary

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| GAP-1 | **Major** | `ValidationResult` interface location ambiguous — Exports block mixes model and service | Split Exports into two code blocks with explicit file paths |
| M1 | Medium | System design §7.5 rule #2 (path matches output_spec) omitted from task | Add to Out of Scope with explanation |
| M2 | Medium | `ValidationRule` exported but extensibility undefined | Document as forward-compatibility export; custom rules are v2 |
| m1 | Minor | Required section check limited to `#`/`##` headings | No action; document if desired |
| m2 | Minor | Placeholder patterns could false-positive on `<!-- TODO` in legitimate content | No action; tighten if dogfooding reveals issues |
| m3 | Minor | Word count algorithm unspecified | Add Technical Note: split on `\s+`, filter empties |
| m4 | Minor | Full `ColumnSpec` passed but only 2 fields used | No action; acceptable coupling for domain service |
| m5 | Minor | Stub note could be more specific about stub shape | Clarify stub shape: `{ minWordCount, requiredSections }` |
| — | Info | File `src/domain/services/output-validation.ts` exists as scaffold placeholder | ✓ |
| — | Info | File `src/domain/model/validation-result.ts` exists as scaffold placeholder | ✓ |
| — | Info | Barrel exports in `index.ts` files already include both modules | ✓ |
| — | Info | `validateOutput` function name matches M2-011 step 9 call site | ✓ |
| — | Info | `minWordCount` default 50 matches M2-007 Zod schema default | ✓ |

---

## Recommended Task Amendments

### 1. Split Exports into explicit file locations

Replace the single Exports code block with two:

**`src/domain/model/validation-result.ts`:**
```typescript
export interface ValidationResult {
  passed: boolean;
  violations: string[];
}
```

**`src/domain/services/output-validation.ts`:**
```typescript
import { ValidationResult } from '../model/validation-result.js';
import { ColumnSpec } from '../model/column-spec.js';

export interface ValidationRule {
  name: string;
  check(content: string, spec: ColumnSpec): ValidationResult;
}

export function validateOutput(
  content: string,
  columnSpec: ColumnSpec,
): ValidationResult
```

### 2. Add path check to Out of Scope

```
- File path matching against output_spec (orchestration concern — handled by M2-011 before calling validateOutput)
```

### 3. Add Technical Notes section

```
## Technical Notes / Hints
- ValidationResult is defined in src/domain/model/validation-result.ts; imported by the service
- ValidationRule is exported for forward compatibility; in v1 only built-in rules run; custom rule injection is v2
- Word count: split on whitespace (\s+), filter empty strings. Markdown tokens count as words — acceptable for minimum-threshold checks
- validateOutput() is a pure function — no ports, no state, no infrastructure dependencies
```

### 4. Clarify stub shape in Dependencies

Change:
```
- M2-007/M2-008: `ColumnSpec` type (can stub with a minimal interface for this task)
```
To:
```
- M2-007/M2-008: `ColumnSpec` type (can stub with `{ minWordCount: number; requiredSections: string[] }` if implementing before M2-007)
```

---

## Verdict

**Approve with minor required changes:**

1. **Split the Exports block** to clearly show which types go in the model file vs. the service file. This is the only finding that could cause an implementer to put `ValidationResult` in the wrong file.
2. **Add file-path-matching to Out of Scope** to explain the deliberate omission of system design §7.5 rule #2.
3. **Add Technical Notes** for word count algorithm and `ValidationRule` extensibility intent.

The task is otherwise well-specified. File paths match the scaffold, barrel exports are in place, layer placement is correct, dependencies are accurate, and the function signature aligns with M2-011's call site. The pure-function design with no port dependencies is the right approach for a domain service. Implementation should be straightforward after these minor amendments.