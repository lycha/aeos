# Task: Implement Rule-Based Output Validation

**Milestone:** M2 — Dogfood Harness
**Agent:** typescript-pro
**Method:** Manual (last manual milestone)

## Context
A structural sanity check run on every executor output before it is passed to the reviewer agent. Catches malformed or empty artifacts early — before spending tokens on a reviewer invocation. Returns a typed `ValidationResult` so the orchestrator can decide whether to fail the ticket or proceed.

## What needs to be done
Implement as a domain service in `src/domain/services/output-validation.ts`. The `ValidationResult` value object is already scaffolded in `src/domain/model/validation-result.ts`.

Exports:

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

Built-in rules applied in order:
1. **Non-empty:** content length > 0 (violation: `"Output is empty"`)
2. **Minimum word count:** content word count ≥ `columnSpec.minWordCount` (default 50 if unset) (violation: `"Output below minimum word count: <actual> < <required>"`)
3. **Required sections:** for each section in `columnSpec.requiredSections`, verify it appears in the content as a markdown heading `# <section>` or `## <section>` (violation: `"Missing required section: <section>"`)
4. **No unfilled placeholders:** content does not contain `[PLACEHOLDER]`, `<PLACEHOLDER>`, or `<!-- TODO` patterns (violation: `"Unfilled template placeholder found"`)

`validateOutput` runs all rules and aggregates violations. `passed` is `true` only if violations is empty.

## Acceptance Criteria
- [ ] Given empty content, when validating, then `passed` is `false` and violations includes "Output is empty"
- [ ] Given content with 10 words and `minWordCount: 50`, when validating, then violations includes the word count message
- [ ] Given content missing a required section, when validating, then violations includes `"Missing required section: <name>"`
- [ ] Given content containing `[PLACEHOLDER]`, when validating, then violations includes the placeholder message
- [ ] Given fully valid content meeting all rules, when validating, then `passed` is `true` and violations is empty

## Out of Scope
- Semantic validation (that's the reviewer agent's job)
- LLM-based quality checks
- File path matching against output_spec (orchestration concern — handled by M2-011 before calling validateOutput)

## Dependencies
- M2-007/M2-008: `ColumnSpec` type (can stub with `{ minWordCount: number; requiredSections: string[] }` if implementing before M2-007)

## Layer Mapping
```
Domain service:  src/domain/services/output-validation.ts     — validateOutput() + ValidationRule
Domain model:    src/domain/model/validation-result.ts        — ValidationResult value object
                 src/domain/model/column-spec.ts              — ColumnSpec (input)
```

## Technical Notes / Hints
- ValidationResult is defined in `src/domain/model/validation-result.ts`; imported by the service
- ValidationRule is exported for forward compatibility; in v1 only built-in rules run; custom rule injection is v2
- Word count: split on whitespace (`\s+`), filter empty strings. Markdown tokens count as words — acceptable for minimum-threshold checks
- `validateOutput()` is a pure function — no ports, no state, no infrastructure dependencies

## Definition of Done
- [ ] All 4 built-in rules implemented and tested
- [ ] `passed` is only `true` when all rules pass
- [ ] Unit tests for each violation type independently and a passing case
- [ ] Code reviewed and approved
