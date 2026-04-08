# Task: Run AEOS-14 — Code Review Artifact Template and Diff Injection

**Milestone:** M5b — Code Review Column
**Agent:** — (dogfood pipeline ticket)
**Method:** Dogfood — run through AEOS pipeline

## Context
The CODE_REVIEW column is fundamentally different from all prior columns: the reviewer evaluates a code diff, not a markdown artifact. This ticket produces both the code review output template AND the diff injection mechanism in `PromptBuilder`. Requires code changes to the harness (M5b implementation task) and a pipeline ticket to specify them.

## What needs to be done
1. Create ticket: `aeos ticket create "Code review artifact template and diff injection into reviewer context"` → AEOS-14
2. Fill in `.aeos/AEOS-14-ticket.md`:
   - Goal 1: produce `code-review-template.md` — the reviewer output format for CODE_REVIEW column
   - Goal 2: specify how the diff is injected into the prompt — the `ContextAssembler` must be extended to support a `diffContent` field for CODE_REVIEW column, and `PromptBuilder` must include it under `## Code Diff` in `[CONTEXT]`
   - Template sections: Review Summary, Rubric Evaluation table, Critical Issues, Warnings, Conclusion (APPROVED/REJECTED)
3. Run: `aeos ticket run AEOS-14`
4. Review: the output must include both the template AND a clear diff injection spec
5. `aeos ticket approve AEOS-14`
6. **Implement the diff injection** in `ContextAssembler` and `PromptBuilder` based on the approved spec (this is a code change, tracked as a sub-task)

## Acceptance Criteria
- [ ] Given `aeos ticket run AEOS-14`, when complete, then `AEOS-14-code-review-template.md` and review exist
- [ ] Given `code-review-template.md`, when reviewing, then rubric evaluation table and APPROVED/REJECTED conclusion are present
- [ ] Given the implementation of diff injection, when calling `ContextAssembler` for CODE_REVIEW column, then `diffContent` is populated from `git diff`
- [ ] Given `buildPrompt()` with `diffContent`, when inspecting prompt, then `## Code Diff` appears in `[CONTEXT]`
- [ ] Given reviewer output, then APPROVED or APPROVED_WITH_WARNINGS

## Out of Scope
- QA agent (M6)
- DoD gate (M6)

## Technical Notes / Hints
- Sub-task: after AEOS-14 is approved, implement diff injection in `src/application/services/context-assembler.ts` and `src/application/services/prompt-builder.ts`
- `git diff HEAD~1 HEAD` or `git diff --staged` depending on when the diff is captured in the run lifecycle

## Dependencies
- M5b-001: AEOS-13 complete
- M2-004 and M2-005: `ContextAssembler` and `PromptBuilder` implemented

## Definition of Done
- [ ] AEOS-14 reaches DONE (pipeline ticket)
- [ ] `code-review-template.md` committed
- [ ] Diff injection implemented in code and unit tested
- [ ] Exit criteria for M5b: CODE_REVIEW runs with diff-based reviewer; both M5a and M5b sign-offs visible as distinct gates
