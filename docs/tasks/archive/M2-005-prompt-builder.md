# Task: Implement `PromptBuilder`

**Milestone:** M2 — Dogfood Harness
**Agent:** backend-architect
**Method:** Manual (last manual milestone)

## Context
Takes an `AssembledContext` and produces the final prompt string passed to the executor. The structure ([ROLE] / [CONTEXT] / [TASK] / [OUTPUT FORMAT] / [SELF-VERIFICATION]) is the primary quality lever for model output. Changes here affect every agent. Requires M2-004 (ContextAssembler).

## What needs to be done
Implement as an application service in `src/application/services/prompt-builder.ts`:

```typescript
export function buildPrompt(
  context: AssembledContext,
  agentSpec: AgentSpec,
): string
```

Prompt structure (in order):
```
[ROLE]
<agentSpec.systemPrompt>

[CONTEXT]
## Ticket
<context.ticketContent>

## Prior Artifacts
<for each prior artifact:>
### <artifact.name>
<artifact.content>

## Constraints
<context.constraints ?? "(none)">

[TASK]
<agentSpec.taskInstruction>

[OUTPUT FORMAT]
<agentSpec.outputFormat>

[SELF-VERIFICATION]   ← omit this section if selfVerificationChecklist is empty
Before submitting your response, verify:
<agentSpec.selfVerificationChecklist as bulleted list>
```

Where `AgentSpec` is a typed interface loaded from agent YAML files (see M2-007/M2-008).

## Acceptance Criteria
- [ ] Given an `AssembledContext` with 2 prior artifacts, when calling `buildPrompt()`, then both appear under `[CONTEXT]` → `## Prior Artifacts`
- [ ] Given `constraints: null`, when building prompt, then `## Constraints` section shows `(none)`
- [ ] Given the returned string, when searching for `[ROLE]`, `[CONTEXT]`, `[TASK]`, `[OUTPUT FORMAT]`, `[SELF-VERIFICATION]`, then all 5 sections are present in order
- [ ] Given an empty prior artifacts array, when building, then the `## Prior Artifacts` section is omitted (not shown as empty)
- [ ] Given an `AgentSpec` with empty `selfVerificationChecklist`, when building prompt, then the `[SELF-VERIFICATION]` section is omitted entirely

## Out of Scope
- Token counting / truncation to fit context window (v2)
- Diff injection for CODE_REVIEW column (M5b — separate builder variant)
- Codebase index injection into `[CONTEXT]` (future milestone, per system design §8.1)

## Technical Notes / Hints
- Use template literals for prompt construction — readable and maintainable
- The `[SELF-VERIFICATION]` section significantly improves model output quality; do not remove it
- The `[SELF-VERIFICATION]` section uses a pre-defined checklist from `AgentSpec` rather than the system design's generic "produce your own checklist" instruction. This is a deliberate improvement: pre-defined checklists are deterministic and auditable. If the checklist is empty, the section is omitted.
- `buildPrompt()` is a pure function with no dependencies — no class instantiation needed. M2-011's container passes the function reference directly.

## Dependencies
- M2-004: `AssembledContext` type
- M2-007/M2-008: `AgentSpec` type

## Layer Mapping
```
Application:   src/application/services/prompt-builder.ts      — PromptBuilder service (or pure function)
Domain model:  src/domain/model/assembled-context.ts           — AssembledContext input
               src/domain/model/agent-spec.ts                  — AgentSpec input
```

## Definition of Done
- [ ] `buildPrompt()` produces correctly structured prompt string
- [ ] All 5 sections present in correct order
- [ ] Unit tests: full context, no prior artifacts, null constraints
- [ ] Code reviewed and approved
