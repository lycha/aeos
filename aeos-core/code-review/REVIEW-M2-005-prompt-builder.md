# Code Review: M2-005 — PromptBuilder

**Date:** 2026-04-08
**Reviewer:** Staff SWE (automated)
**Scope:** Uncommitted changes — `src/domain/model/agent-spec.ts`, `src/application/services/prompt-builder.ts`, `src/application/services/prompt-builder.test.ts` (untracked)

---

## Overall Assessment

Clean, well-structured implementation. `buildPrompt` is a pure function with no side effects, placed correctly in the application-services layer, importing only from the domain model. The `AgentSpec` value object is a pure interface with `readonly` properties and zero external imports, preserving domain purity. Test coverage is comprehensive (10 tests, all passing) with co-located test file. All five prompt sections are assembled in the documented order, and conditional sections (self-verification, prior artifacts) are correctly omitted when empty.

No Critical or Major issues found.

**Verdict:** Approve

---

## Critical Issues

None.

---

## Major Issues

None.

---

## Minor Issues

### m1. `AgentSpec` interface will be superseded by M2-007 Zod-inferred type

**File:** `src/domain/model/agent-spec.ts` (interface `AgentSpec`)

**Problem:**
The current interface defines only the 4 fields consumed by `buildPrompt`. M2-007 will replace this with a Zod-inferred type (`z.infer<typeof AgentSpecSchema>`) that adds `name`, `role`, and `executor` fields. The `readonly` modifiers on the current interface will not survive the transition unless M2-007 explicitly uses `.readonly()` on the Zod schema or applies `Readonly<>` wrapper.

**Recommendation:**
No action needed now. When M2-007 is implemented, ensure the Zod schema preserves `readonly` semantics (e.g., `AgentSpecSchema.readonly()` or `Readonly<z.infer<typeof AgentSpecSchema>>`). The test factory's `Partial<AgentSpec>` will also need updating to include new required fields.

### m2. No edge-case tests for empty string inputs

**File:** `src/application/services/prompt-builder.test.ts`

**Problem:**
Tests cover null constraints, empty prior artifacts, and empty self-verification checklist — but do not test empty-string inputs for `systemPrompt`, `taskInstruction`, `outputFormat`, or `ticketContent`. While the function would still produce structurally valid output, empty strings could indicate upstream bugs.

**Recommendation:**
Consider adding a test that documents expected behaviour with empty strings (e.g., `[ROLE]\n` with no content after the newline). Low priority — not blocking.

---

## Positive Observations

1. **Pure function** — no class instantiation, no dependencies, no I/O. Excellent testability and composability. M2-011 can pass the function reference directly.
2. **Correct conditional omission** — `[SELF-VERIFICATION]` is omitted when checklist is empty; `## Prior Artifacts` is omitted when array is empty. Matches task spec exactly.
3. **Domain purity preserved** — `AgentSpec` interface has zero external imports; all properties are `readonly`.
4. **Comprehensive test coverage** — 10 focused tests covering section ordering, content inclusion, conditional omission, and formatting. All edge cases from the Definition of Done are covered.
5. **Null coalescing for constraints** — `context.constraints ?? '(none)'` handles the null case cleanly.
6. **JSDoc on exported function** — documents prompt structure inline for future maintainers.
7. **Barrel exports pre-wired** — `src/application/services/index.ts` and `src/domain/model/index.ts` already re-export the new modules.

---

## Architecture Compliance

- [x] Dependency direction: `cli → application → domain ← infrastructure`
- [x] Domain layer purity: no I/O, no framework imports in `src/domain/`
- [x] Barrel exports updated for new modules
- [ ] Composition root (`container.ts`) updated if new adapters/use cases added — N/A (pure function, no wiring needed)

---

## Verification Notes

- `npm run typecheck` — **PASS**
- `npm run lint` — **PASS**
- `npm test` — **PASS** (21 test files, 220 tests passing)

---

## Summary by Severity

| Severity | Count |
|----------|-------|
| Critical | 0     |
| Major    | 0     |
| Minor    | 2     |

---

## Draft PR Summary

**Summary:**
- Defined `AgentSpec` value object interface in `src/domain/model/agent-spec.ts` with 4 readonly properties: `systemPrompt`, `taskInstruction`, `outputFormat`, `selfVerificationChecklist`
- Implemented `buildPrompt()` pure function in `src/application/services/prompt-builder.ts` that assembles 5 prompt sections: `[ROLE]`, `[CONTEXT]`, `[TASK]`, `[OUTPUT FORMAT]`, `[SELF-VERIFICATION]`
- Conditional section omission: `[SELF-VERIFICATION]` omitted when checklist is empty; `## Prior Artifacts` omitted when no artifacts present
- Null constraints rendered as `(none)`

**Testing:**
- 10 unit tests in co-located `prompt-builder.test.ts` covering all branches
- All 220 project tests passing

Please review this summary and confirm it matches the intended changes.
