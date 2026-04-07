# Deep Review: M2-005 — Implement `PromptBuilder`

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Task specification — `docs/tasks/M2-005-prompt-builder.md`
**Cross-referenced against:** System design (03-system-design.md §4.4, §5.1–5.5), PRD (02-prd.md §5.4, §5.6), Action plan (05-action-plan-v1.md M2), sibling tasks M2-004, M2-006, M2-007, M2-008, M2-009, M2-011, M2-013, existing scaffold in `src/`, prior review REVIEW-20260407-M2-004-context-assembler.md

---

## Overall Assessment

The task is well-scoped, concise, and correctly identifies the file path (`src/application/services/prompt-builder.ts`), hexagonal layer (application service / pure function), and core responsibility (transform `AssembledContext` + `AgentSpec` into a final prompt string). The five-section prompt structure (`[ROLE]`, `[CONTEXT]`, `[TASK]`, `[OUTPUT FORMAT]`, `[SELF-VERIFICATION]`) is a **direct match** with system design §4.4.

The task has **one major gap**, **two medium issues**, and **several minor observations**. None are hard blockers — the major gap is a missing dependency that was already identified and resolved by the M2-004 review.

**Verdict:** Approve with minor required changes.

---

## 1. Correctness vs System Design

### ✅ Prompt structure — ALIGNED

The five sections in the task match system design §4.4 exactly:

| Task section | System design §4.4 |
|---|---|
| `[ROLE]` — `agentSpec.systemPrompt` | `{system prompt from agent spec}` ✓ |
| `[CONTEXT]` — ticket + prior artifacts + constraints | `{assembled context: ticket.md + prior artifacts + CONSTRAINTS.md + codebase index}` ✓ (minus codebase index — see M1 below) |
| `[TASK]` — `agentSpec.taskInstruction` | `{column-specific task description}` ✓ |
| `[OUTPUT FORMAT]` — `agentSpec.outputFormat` | `{artifact template — required sections, format rules}` ✓ |
| `[SELF-VERIFICATION]` — `agentSpec.selfVerificationChecklist` | Self-verification checklist ✓ |

### ⚠️ MEDIUM (M1): Codebase index context omitted

System design §4.4 lists `codebase index` as part of `[CONTEXT]`. The task does not include it. System design §8.1 shows codebase index is available to PREPARE, BUILD, and DEPLOY phases. However, the action plan says codebase index is powered by `github.com/lycha/code-indexer` and is not part of M2 scope.

**Assessment:** This is a correct and deliberate omission for M2. However, the task should note it as a "v2/future" item to prevent confusion. The `[CONTEXT]` section will grow when codebase index support is added.

**Recommendation:** Add to "Out of Scope" section: `- Codebase index injection (future milestone, per system design §8.1)`.

### ✅ Self-verification section — ALIGNED with PRD

PRD FR-33 ("Agent self-verification — worker produces a plan and checklist") lists self-verification as "Should Have." The task implements it as part of the prompt structure, which is the correct approach — the verification is embedded in the prompt, not a separate system. The `selfVerificationChecklist` is sourced from `AgentSpec`, matching system design §5.1 where agents define `self_verification: true`.

### ⚠️ MEDIUM (M2): Self-verification checklist wording differs from system design

System design §4.4 says:
```
[SELF-VERIFICATION]
Before writing your output, produce a numbered checklist of steps.
Execute each step. Verify your output against the checklist.
Include the checklist at the end of your output.
```

The task says:
```
[SELF-VERIFICATION]
Before submitting your response, verify:
<agentSpec.selfVerificationChecklist as bulleted list>
```

These are meaningfully different. The system design asks the agent to generate its own checklist dynamically. The task provides a pre-defined checklist from the agent spec. The task's approach is arguably **better** (deterministic, auditable), but it diverges from the system design.

**Recommendation:** Document this as a deliberate improvement. If the `selfVerificationChecklist` array is empty, the task should specify fallback behavior — either omit the section entirely or fall back to the system design's generic "produce your own checklist" instruction.

### ✅ Reviewer prompt assembly — OUT OF SCOPE (correct)

System design §5.5 describes a separate, more complex reviewer prompt assembly (two-pass, rubric injection). The task correctly excludes this — `PromptBuilder` handles the generic worker prompt. The reviewer's prompt assembly is handled in M2-011/M2-013. No conflict.

---

## 2. Dependencies

### ✅ M2-004 (`AssembledContext` type) — CORRECT

M2-004 defines `AssembledContext` with `ticketContent`, `priorArtifacts` (array of `{ name, content }`), and `constraints` (string | null). The prompt template in M2-005 uses exactly these fields. Aligned.

**Note:** Per the M2-004 review, the `AssembledContext` interface was originally undefined. The M2-004 review recommended defining it as a prerequisite, and the M2-004 task was updated accordingly. M2-005 now has a concrete type to depend on.

### ✅ M2-007/M2-008 (`AgentSpec` type) — CORRECT

M2-007 defines `AgentSpecSchema` with fields: `name`, `systemPrompt`, `taskInstruction`, `outputFormat`, `selfVerificationChecklist`, `executor`. The task uses `agentSpec.systemPrompt`, `agentSpec.taskInstruction`, `agentSpec.outputFormat`, and `agentSpec.selfVerificationChecklist`. All four fields exist on the `AgentSpec` type. Aligned.

### ✅ No circular dependencies

M2-004 → M2-005 → M2-011. Clean DAG. M2-005 does not depend back on M2-004's assembler class — it only needs the `AssembledContext` type (value object). ✓

### ✅ No missing dependencies

All inputs are covered: `AssembledContext` (M2-004), `AgentSpec` (M2-007). No ports, repositories, or infrastructure needed — this is a pure function. ✓

---

## 3. File Path Alignment with Hexagonal Scaffold

### ✅ Target file exists as scaffolded placeholder

| Task path | Exists on disk | Content |
|-----------|---------------|---------|
| `src/application/services/prompt-builder.ts` | ✓ | `// Application service — PromptBuilder...` (placeholder) |
| `src/domain/model/assembled-context.ts` | ✓ | Placeholder (to be filled by M2-004) |
| `src/domain/model/agent-spec.ts` | ✓ | Placeholder (to be filled by M2-007) |

### ✅ Layer placement is correct

Pure function in application services layer. Takes domain model value objects as input, returns a primitive string. No port dependencies. Correct per hexagonal architecture — this is a transformation service, not an adapter. ✓

### ✅ Barrel export exists

`src/application/services/index.ts` already re-exports `./prompt-builder.js`. ✓

### ✅ Domain model barrel includes both input types

`src/domain/model/index.ts` re-exports both `assembled-context.js` and `agent-spec.js`. ✓

---

## 4. Consistency with Sibling Tasks


### vs M2-004 (ContextAssembler) — ✅ CONSISTENT

M2-005 consumes `AssembledContext` which M2-004 produces. The field access pattern in the prompt template (`context.ticketContent`, `context.priorArtifacts[].name`, `context.priorArtifacts[].content`, `context.constraints`) matches the interface defined in M2-004's updated spec. ✓

### vs M2-006 (Output Validation) — ✅ NO CONFLICT

M2-006 validates the executor's *output* — it does not validate the *prompt*. These are independent concerns with no overlap. ✓

### vs M2-007 (AgentSpec Zod Schema) — ✅ CONSISTENT

All `agentSpec.*` properties used in the prompt template (`systemPrompt`, `taskInstruction`, `outputFormat`, `selfVerificationChecklist`) are defined in the `AgentSpecSchema`. ✓

### vs M2-009 (Preflight Pass) — ✅ NO CONFLICT

M2-009 builds its own preflight-specific prompt (hardcoded role + task). It does not use `PromptBuilder`. No overlap. ✓

### vs M2-011 (ticket-run use case) — ⚠️ MINOR INCONSISTENCY

M2-011 step 6 calls `promptBuilder.buildPrompt()`. The use case receives `PromptBuilder` via constructor injection. However, M2-005 defines `buildPrompt` as a **standalone exported function**, not a class method. M2-011's constructor signature lists `promptBuilder: PromptBuilder` — this works if `PromptBuilder` is used as a type alias for the function, or if the function is wrapped.

M2-011 treats it as a class instance (`this.promptBuilder.buildPrompt()`), while M2-005 defines it as a bare function (`export function buildPrompt(...)`). Either approach works, but the convention should be consistent. Per M2-004 review, `ContextAssembler` is a class. `PromptBuilder` being a pure function is actually the cleaner design (no state, no dependencies), but M2-011's DI wiring assumes a class.

**Recommendation:** Keep as a pure function. M2-011's container can pass the function reference. Add a note: "M2-011 receives this function as a dependency — no class instantiation needed."

### vs M2-013 (reviewer-agent.yaml) — ✅ CONSISTENT

`reviewer-agent.yaml` defines `systemPrompt`, `taskInstruction`, `outputFormat`, and `selfVerificationChecklist` — all fields consumed by `buildPrompt()`. The reviewer agent's prompt would be built with the same function. ✓

### vs Prior Review (M2-004) — ✅ CONSISTENT

The M2-004 review recommended defining `AssembledContext` explicitly. The updated M2-004 task now includes the interface definition. M2-005's usage of `AssembledContext` properties is fully covered. ✓

---

## 5. Gaps That Would Block Implementation

### ⚠️ MAJOR (GAP-1): No handling of empty `selfVerificationChecklist`

The `AgentSpecSchema` (M2-007) defines `selfVerificationChecklist` with a default of `[]` (empty array). The task does not specify what happens when this array is empty. Options:

1. Omit the `[SELF-VERIFICATION]` section entirely
2. Fall back to the system design's generic instruction ("produce your own checklist")
3. Include the section header with no content (worst option — confusing to the model)

**Recommendation:** Omit the section when the checklist is empty. Add acceptance criterion: "Given an `AgentSpec` with empty `selfVerificationChecklist`, when building prompt, then the `[SELF-VERIFICATION]` section is omitted."

### ✅ No other blocking gaps

All types are defined (or will be defined by dependency tasks). File paths exist. Layer placement is correct. The function is pure and has no infrastructure dependencies.

---

## 6. Minor Issues and Recommendations

### m1: Return type is `string` — correct but consider future evolution

The function returns a plain `string`. This is correct for v1. If token counting or prompt metadata (e.g., estimated token count, section offsets) are needed in v2, the return type would need to change. No action needed now — just a forward reference.

### m2: Prompt section headers use `[SECTION]` format — confirm this is deliberate

The prompt uses `[ROLE]`, `[CONTEXT]`, etc. as section markers. This is a prompt engineering choice. The system design uses the same format. These are NOT valid Markdown headings — they serve as visual separators for the model, not for Markdown renderers. Consistent with system design §4.4. ✓

### m3: `## Prior Artifacts` omission when empty — good edge case handling

AC #4 says "Given an empty prior artifacts array, when building, then the `## Prior Artifacts` section is omitted." This is correct — prevents the model from seeing an empty section and generating filler. Well-specified. ✓

### m4: Task says "can be stubbed with a simple interface" re: AgentSpec

This note about M2-007/M2-008 is slightly misleading — by the time M2-005 is implemented, M2-007 should already be complete (it's a listed dependency). The stub note is appropriate only if M2-005 is implemented before M2-007.

**Recommendation:** Remove the stub note to avoid confusion.

---

## Findings Summary

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| GAP-1 | **Major** | No handling of empty `selfVerificationChecklist` — array defaults to `[]` | Specify: omit `[SELF-VERIFICATION]` section when checklist is empty. Add AC. |
| M1 | Medium | Codebase index not included in `[CONTEXT]` — not mentioned in Out of Scope | Add to Out of Scope: "Codebase index injection (future milestone)". |
| M2 | Medium | Self-verification wording diverges from system design §4.4 (pre-defined checklist vs. dynamic) | Document as deliberate improvement. Specify empty-checklist fallback. |
| m1 | Minor | Return type `string` — correct for v1; note for v2 evolution | No action needed. |
| m2 | Minor | M2-011 treats PromptBuilder as class; M2-005 defines as function | Add note that M2-011 can receive function reference directly. |
| m3 | Minor | Stub note for AgentSpec unnecessary given M2-007 dependency | Remove parenthetical "(can be stubbed...)" from Dependencies. |
| — | Info | File path `src/application/services/prompt-builder.ts` matches scaffold | ✓ |
| — | Info | Barrel export in `src/application/services/index.ts` already includes prompt-builder | ✓ |
| — | Info | All `agentSpec.*` properties align with `AgentSpecSchema` (M2-007) | ✓ |
| — | Info | `AssembledContext` properties align with M2-004 interface (post-review) | ✓ |

---

## Recommended Task Amendments

### 1. Add empty-checklist handling

Add to **Acceptance Criteria**:
```
- [ ] Given an AgentSpec with empty selfVerificationChecklist, when building prompt, then the [SELF-VERIFICATION] section is omitted entirely
```

Add to **Prompt structure** a conditional note:
```
[SELF-VERIFICATION]   ← omit this section if selfVerificationChecklist is empty
```

### 2. Add codebase index to Out of Scope

```
- Codebase index injection into [CONTEXT] (future milestone, per system design §8.1)
```

### 3. Document self-verification divergence

Add to **Technical Notes / Hints**:
```
- The [SELF-VERIFICATION] section uses a pre-defined checklist from AgentSpec rather than the system design's
  generic "produce your own checklist" instruction. This is a deliberate improvement: pre-defined checklists
  are deterministic and auditable. If the checklist is empty, the section is omitted.
```

### 4. Clarify function-vs-class for M2-011 integration

Add to **Technical Notes / Hints**:
```
- buildPrompt() is a pure function with no dependencies — no class instantiation needed.
  M2-011's container passes the function reference directly.
```

### 5. Remove stub note from Dependencies

Change:
```
- M2-007/M2-008: `AgentSpec` type (can be stubbed with a simple interface for this task)
```
To:
```
- M2-007/M2-008: `AgentSpec` type
```

---

## Verdict

**Approve with minor required changes:**

1. **Specify empty `selfVerificationChecklist` handling** — the default is `[]` per M2-007, and the task must define what happens (recommended: omit the section). This is the only finding that could cause implementation ambiguity.
2. **Add codebase index to Out of Scope** — prevents confusion about the `[CONTEXT]` section diverging from system design §4.4.
3. **Document self-verification approach** — deliberate improvement over system design should be explicit.

The task is otherwise well-specified. File paths match the scaffold, layer placement is correct, dependencies are accurate, and the prompt structure aligns with the system design. The pure function approach is the right design — no ports, no state, no infrastructure dependencies. Implementation should be straightforward after these minor amendments.