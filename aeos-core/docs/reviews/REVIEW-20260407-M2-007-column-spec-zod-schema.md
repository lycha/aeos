# Deep Review: M2-007 — Define YAML Column Spec Zod Schema

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Task specification — `docs/tasks/M2-007-column-spec-zod-schema.md`
**Cross-referenced against:** System design (03-system-design.md §5.4, §5.1, §4.2, §7.2, §7.5), PRD (02-prd.md §5.4, §5.5, §5.7), Action plan (05-action-plan-v1.md M2), sibling tasks M2-001, M2-002, M2-003, M2-004, M2-005, M2-006, M2-008, M2-009, M2-011, M2-013, existing scaffold in `src/`, prior reviews for M2-001 through M2-006

---

## Overall Assessment

The task correctly identifies file paths (`src/domain/model/column-spec.ts`, `src/domain/model/agent-spec.ts`), hexagonal layer (domain model value objects), and the relationship between Zod runtime validation and inferred TypeScript types. The acceptance criteria cover basic parse/fail/default scenarios. Scaffold files and barrel exports are already in place.

However, the task has **two major gaps**, **three medium issues**, and **several minor observations**. The major gaps would cause downstream failures if not addressed before implementation.

**Verdict:** Approve with required changes.

---

## 1. Correctness vs System Design

### ⚠️ MAJOR (GAP-1): `ColumnSpecSchema` is missing `max_iterations` and `escalation` fields

System design §5.4 defines the column spec with:
```yaml
max_iterations: 3
escalation: escalate_to_human
```

PRD FR-07: "Max iteration limit is configurable per column." PRD FR-08: "Escalation behaviour on max iterations is configurable per column (`escalate_to_human` or `mark_done`)." System design §5.5 (Reviewer Prompt Assembly) shows `max_iterations: 3` and `escalation: escalate_to_human` injected into the reviewer prompt. The Review Cycle (system design §6) uses `max_iterations` to determine worker rework vs human escalation.

The task's `ColumnSpecSchema` omits both fields entirely. Downstream consumer M2-011 (`ticket-run` use case, step 10–12) orchestrates the review loop and needs `max_iterations` to know when to stop reworking and `escalation` to know what to do at the limit.

**Impact:** Blocks correct implementation of the review cycle in M2-011 and reviewer prompt assembly.

**Recommendation:** Add to `ColumnSpecSchema`:
```typescript
maxIterations: z.number().int().positive().default(3),
escalation: z.enum(['escalate_to_human', 'mark_done']).default('escalate_to_human'),
```

### ⚠️ MAJOR (GAP-2): `ColumnSpecSchema` has only one `agentFile` — system design specifies both worker and reviewer agents per column

System design §5.4:
```yaml
worker_agent: pm-agent
reviewer_agent: reviewer-agent
```

PRD §5.5: "Each column is configured independently" with `worker_agent` and `reviewer_agent` as distinct fields.

The task's schema has a single `agentFile: z.string()` with comment "relative path to agent YAML." This conflates the worker agent with the column config and provides no way to specify the reviewer agent. M2-011's orchestration sequence (step 10) needs a reviewer agent spec to build the reviewer prompt. M2-013 (`reviewer-agent.yaml`) is authored as a standalone agent spec and must be referenced from the column spec.

**Impact:** M2-011 cannot determine which reviewer agent to use for a given column without a `reviewerAgentFile` field (or equivalent). The action plan §M2 exit criteria require "reviewer running in each column."

**Recommendation:** Rename `agentFile` to `workerAgentFile` and add `reviewerAgentFile`:
```typescript
workerAgentFile: z.string(),     // e.g. "agents/pm-agent.yaml"
reviewerAgentFile: z.string(),   // e.g. "agents/reviewer-agent.yaml"
```

### ⚠️ MEDIUM (M1): Missing `phase` field on `ColumnSpecSchema`

System design §5.4 includes `phase: PLAN` on the column spec. M2-004 (ContextAssembler) notes that phase-based context scoping is deferred for v1, but the `phase` field is still present in the system design's canonical column spec definition. Future context scoping (system design §8.1) depends on knowing which phase a column belongs to.

**Assessment:** Not immediately blocking for v1 since context scoping is deferred. However, omitting it means it must be retrofitted later.

**Recommendation:** Add `phase: z.enum(['PLAN', 'PREPARE', 'BUILD', 'DEPLOY']).optional()` — optional for v1, required when phase scoping is implemented.

### ⚠️ MEDIUM (M2): Executor type enum value `claude-cli` vs system design's `claude-code-cli`

The task defines `executor.type: z.enum(['claude-cli', 'stub'])`. System design §4.2 uses `claude-code-cli` consistently. The executor table (system design §4.3) lists `claude-code-cli` as the v1 default. M2-003's file is named `claude-cli-executor.adapter.ts` (shortened), and M2-013's `reviewer-agent.yaml` uses `type: claude-cli`.

The M2 tasks internally agree on `claude-cli`, but this deviates from the system design. This should be a conscious, documented decision.

**Recommendation:** Either update system design to use `claude-cli` or update task + M2-013 to use `claude-code-cli`. The shorter form is fine — but document the rename in a Design Notes section.

### ⚠️ MEDIUM (M3): `AgentSpecSchema` is missing `role` field

System design §5.1 defines agents with a `role` field (`worker` or `reviewer`). PRD §5.4 lists `role` as a field on the agent object. The `reviewer-agent.yaml` (M2-013) is distinguished from worker agents by role, and M2-011's orchestration needs to differentiate worker invocations from reviewer invocations.

The task's `AgentSpecSchema` omits `role` entirely. While M2-011 currently distinguishes by loading worker vs reviewer agent files separately (via column spec), the `role` field is part of the canonical agent model and enables runtime validation (e.g., preventing a worker agent from being assigned as a reviewer).

**Recommendation:** Add `role: z.enum(['worker', 'reviewer']).optional()` — optional for v1 to avoid breaking M2-013's existing YAML, but present in the type for forward compatibility.

### ✅ `preflight` nested object — ALIGNED with M2-009

M2-009 (PreflightService) checks `columnSpec.preflight.enabled` and uses `columnSpec.outputArtifact`. The task's schema defines:
```typescript
preflight: z.object({
  enabled: z.boolean().default(true),
  questionsArtifact: z.string().default('questions.md'),
}).default({}),
```
This matches M2-009's expectations. The `questionsArtifact` field goes beyond M2-009's current needs (M2-009 hardcodes `'questions.md'`) but provides configurability. ✓

### ✅ `minWordCount` and `requiredSections` — ALIGNED with M2-006

M2-006 (output validation) uses `columnSpec.minWordCount` and `columnSpec.requiredSections`. Both are present with matching defaults (`50` and `[]`). ✓

### ✅ `advanceMode` — ALIGNED with system design and PRD

PRD FR-14: "configure advance mode (auto / manual) per column." System design §5.4: `advance_mode: manual | auto`. Task: `advanceMode: z.enum(['manual', 'auto']).default('manual')`. ✓

---

## 2. Dependencies

### ✅ M0-002 (TypeScript configured) — CORRECT

The only explicit dependency. Zod installation is handled within the task itself (`npm install zod`). ✓

### ✅ No circular dependencies

M2-007 has no dependencies on other M2 tasks. M2-008, M2-006, M2-005, M2-009, M2-011, and M2-013 all depend on M2-007. Clean DAG. ✓

### ⚠️ INFO: No dependency on M1-007 (Column enum)

The `column` field is typed as `z.string()`, not as the `Column` enum from M1-007. This is intentional — YAML values are strings, and Zod validates at the string level. However, the task could use `z.enum([...Column values...])` for stricter validation. Minor — the loader (M2-008) can do this mapping.

---

## 3. File Path Alignment with Hexagonal Scaffold

| Task path | Exists on disk | Content |
|-----------|---------------|---------|
| `src/domain/model/column-spec.ts` | ✓ | `// Value Object — ColumnSpec...` (placeholder) |
| `src/domain/model/agent-spec.ts` | ✓ | `// Value Object — AgentSpec...` (placeholder) |
| `src/domain/model/index.ts` | ✓ | Already re-exports both modules (lines 8–9) |


### ✅ Layer placement is correct

Zod schemas in domain model files is a pragmatic choice. Zod serves dual purpose: runtime validation (infrastructure concern) and TypeScript type inference (domain concern). Placing schemas alongside the types they define keeps the type and validator co-located. The alternative — schemas in infrastructure — would require the domain layer to define interfaces separately, adding duplication. Acceptable for v1. ✓

### ✅ Barrel exports already wired

`src/domain/model/index.ts` lines 8–9 already re-export `column-spec.js` and `agent-spec.js`. No barrel changes needed. ✓

### ✅ Downstream scaffold files exist

Consumers are scaffolded and ready:
- `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts` — placeholder ✓
- `src/infrastructure/spec-loader/yaml-agent-spec-loader.adapter.ts` — placeholder ✓
- `src/domain/ports/driven/column-spec-loader.port.ts` — placeholder ✓
- `src/domain/ports/driven/agent-spec-loader.port.ts` — placeholder ✓

---

## 4. Consistency with Sibling Tasks

### vs M2-008 (Column Spec Loader) — ✅ CONSISTENT (with GAP-1/GAP-2 caveat)

M2-008 references `ColumnSpecSchema.parse()` and `AgentSpecSchema.parse()` for validation. M2-008's layer mapping lists `src/domain/model/column-spec.ts — ColumnSpec type` and `src/domain/model/agent-spec.ts — AgentSpec type`. Both align with this task. However, M2-008 defines two separate loaders and two separate ports (`ColumnSpecLoader` and `AgentSpecLoader`), implying column specs and agent specs are loaded independently. This is consistent with the task's separation into two schemas/files. ✓

### vs M2-005 (PromptBuilder) — ✅ CONSISTENT

M2-005 uses `AgentSpec` fields: `systemPrompt`, `taskInstruction`, `outputFormat`, `selfVerificationChecklist`. All four are present in this task's `AgentSpecSchema`. ✓

### vs M2-006 (Output Validation) — ✅ CONSISTENT

M2-006 uses `columnSpec.minWordCount` and `columnSpec.requiredSections`. Both present with matching defaults. ✓

### vs M2-009 (Preflight Pass) — ✅ CONSISTENT

M2-009 uses `columnSpec.preflight.enabled`, `columnSpec.outputArtifact`, and `columnSpec.preflight` (implicit). All present. M2-009 also uses `agentSpec` (passed to `PreflightService.run()`). ✓

### vs M2-011 (ticket-run use case) — ⚠️ PARTIAL ALIGNMENT

M2-011's constructor takes both `columnSpecLoader: ColumnSpecLoader` and `agentSpecLoader: AgentSpecLoader`. Step 2: "Load ColumnSpec via columnSpecLoader; load AgentSpec via agentSpecLoader." Step 10: "Run reviewer agent... promptBuilder.buildPrompt using reviewer-agent spec + reviewer rubrics."

M2-011 assumes the column spec provides enough information to identify both the worker and reviewer agent files. With only a single `agentFile`, M2-011 cannot load the reviewer agent spec from the column spec alone. This confirms GAP-2.

### vs M2-013 (reviewer-agent.yaml) — ✅ CONSISTENT (schema compatibility)

M2-013's YAML structure (`name`, `systemPrompt`, `taskInstruction`, `outputFormat`, `selfVerificationChecklist`, `executor.type`, `executor.timeoutSeconds`) matches `AgentSpecSchema` exactly. The `executor.type: claude-cli` value is in the task's enum. ✓

### vs M2-001 (Executor interface) — ℹ️ OBSERVATION

M2-001 defines `ExecutorInvocation` with a `column: Column` field (typed as the domain enum). The `AgentSpecSchema.executor.type` enum (`['claude-cli', 'stub']`) is a separate concept — it determines which executor adapter to instantiate, not the Column enum value. No conflict. ✓

---

## 5. Gaps That Would Block Implementation

### ⚠️ MAJOR (GAP-1): Missing `maxIterations` and `escalation` — BLOCKS M2-011 review loop

Without these fields, M2-011's review loop (steps 10–12) cannot determine when to stop iterating or what to do at the limit. The v1 simplification in M2-011 (step 12: "reviewer pass = automatic sign-off") works for the initial stub flow but not for the real review cycle in M3+. These fields must be present in the schema for forward compatibility even if M2-011's v1 implementation doesn't fully use them.

### ⚠️ MAJOR (GAP-2): Single `agentFile` prevents reviewer agent loading — BLOCKS M2-011 step 10

M2-011 step 10 loads a reviewer agent spec. With only one `agentFile` on the column spec, the orchestrator has no way to know which agent YAML to load for the reviewer. The column spec must reference both worker and reviewer agents.

### ✅ No other blocking gaps

All scaffold files exist. Barrel exports are wired. Zod is not yet installed but the task includes the install command. The acceptance criteria are testable. The Zod schema definitions are syntactically correct.

---

## 6. Minor Issues and Recommendations

### m1: `column` field typed as `z.string()` — consider enum validation

The `column` field accepts any string. M1-007 defines a `Column` enum with specific values (`BACKLOG`, `PRODUCT_SCOPING`, etc.). Using `z.enum([...])` with the column values would catch typos in YAML files at parse time. However, this couples the Zod schema to the domain enum import, which may be undesirable in the model layer.

**Recommendation:** Keep as `z.string()` for v1; the loader (M2-008) can validate against the `Column` enum after parsing.

### m2: `AgentSpecSchema` has no `context_scope` field

System design §5.1 lists `context_scope` on agents (e.g., `- ticket.md`, `- business_context`). M2-004 (ContextAssembler) defers phase-based scoping for v1 and always includes all context. Since `context_scope` is not used in v1, omitting it is acceptable.

**Recommendation:** No action for v1. Add when phase-based context scoping is implemented.

### m3: `executor.timeoutSeconds` on `AgentSpecSchema` but not on `ColumnSpecSchema`

System design §4.2 shows executor config on the column spec. The task puts executor config on `AgentSpecSchema` instead. M2-013's `reviewer-agent.yaml` has `executor` on the agent spec. This is a deliberate design choice — the agent spec determines its own executor requirements. However, system design places executor config on the column spec. This is a minor inconsistency.

**Assessment:** Agent-level executor config is arguably better — different agents may need different timeouts regardless of column. No action needed, but worth documenting the deviation.

### m4: `reviewerRubrics` is a flat string array — system design uses structured rubric keys

System design §5.4 uses named rubric slots:
```yaml
rubrics:
  pass1_structure: rubrics/structure/prd-structure.md
  pass2_drift: rubrics/drift/intent-drift.md
```

The task uses `reviewerRubrics: z.array(z.string()).default([])` — a flat list of paths. This loses the pass-1/pass-2 structure. M2-005 (PromptBuilder) and M2-011 (ticket-run) need to know which rubric is for structure (pass 1) and which is for drift (pass 2) to assemble the reviewer prompt correctly (system design §5.5).

**Assessment:** Medium risk. The flat list works if rubrics are injected in order (first = structure, second = drift), but this is fragile and implicit. A structured object would be more robust.

**Recommendation:** Consider replacing with:
```typescript
reviewerRubrics: z.object({
  structureRubric: z.string().optional(),
  driftRubric: z.string().optional(),
}).default({}),
```

### m5: No `model` field on executor config

System design §4.2 includes `model: claude-opus-4-6` in executor config. The task's `AgentSpecSchema.executor` only has `type` and `timeoutSeconds`. Model selection is a system design requirement (PRD FR-32). This can be deferred to global config for v1 (`aeos config set model`), but the per-agent override path is lost.

**Recommendation:** Add `model: z.string().optional()` to the executor object for forward compatibility.

---

## Findings Summary

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| GAP-1 | **Major** | Missing `maxIterations` and `escalation` on `ColumnSpecSchema` — required by PRD FR-07/FR-08 and M2-011 review loop | Add both fields with defaults (3 and `escalate_to_human`) |
| GAP-2 | **Major** | Single `agentFile` prevents reviewer agent loading — M2-011 step 10 needs both worker and reviewer agent references | Rename to `workerAgentFile`, add `reviewerAgentFile` |
| M1 | Medium | Missing `phase` field — system design §5.4 includes phase per column | Add as optional enum for forward compatibility |
| M2 | Medium | Executor type `claude-cli` deviates from system design's `claude-code-cli` | Document as deliberate rename or align with system design |
| M3 | Medium | `AgentSpecSchema` missing `role` field — system design §5.1 distinguishes worker/reviewer | Add as optional enum |
| m1 | Minor | `column` field is `z.string()`, not validated against `Column` enum | Keep; validate in loader (M2-008) |
| m2 | Minor | `AgentSpecSchema` missing `context_scope` | Deferred to v2; no action |
| m3 | Minor | Executor config on agent spec vs system design's column spec placement | Acceptable deviation; document |
| m4 | Minor | `reviewerRubrics` flat array loses pass-1/pass-2 structure from system design §5.4 | Consider structured object |
| m5 | Minor | No `model` field on executor config | Add as optional for forward compatibility |
| — | Info | `src/domain/model/column-spec.ts` exists as scaffold placeholder | ✓ |
| — | Info | `src/domain/model/agent-spec.ts` exists as scaffold placeholder | ✓ |
| — | Info | `src/domain/model/index.ts` already re-exports both modules | ✓ |
| — | Info | Barrel exports in `src/domain/ports/driven/index.ts` include loader ports | ✓ |
| — | Info | Infrastructure adapters scaffolded in `src/infrastructure/spec-loader/` | ✓ |
| — | Info | Zod not yet in `package.json` — task includes install command | ✓ |

---

## Recommended Task Amendments

### 1. Add missing fields to `ColumnSpecSchema`

```typescript
export const ColumnSpecSchema = z.object({
  column:            z.string(),
  phase:             z.enum(['PLAN', 'PREPARE', 'BUILD', 'DEPLOY']).optional(),
  workerAgentFile:   z.string(),   // renamed from agentFile
  reviewerAgentFile: z.string(),   // NEW — path to reviewer agent YAML
  outputArtifact:    z.string(),
  minWordCount:      z.number().int().positive().default(50),
  requiredSections:  z.array(z.string()).default([]),
  reviewerRubrics:   z.array(z.string()).default([]),
  maxIterations:     z.number().int().positive().default(3),
  escalation:        z.enum(['escalate_to_human', 'mark_done']).default('escalate_to_human'),
  advanceMode:       z.enum(['manual', 'auto']).default('manual'),
  preflight: z.object({
    enabled: z.boolean().default(true),
    questionsArtifact: z.string().default('questions.md'),
  }).default({}),
});
```

### 2. Add `role` and `model` to `AgentSpecSchema`

```typescript
export const AgentSpecSchema = z.object({
  name:         z.string(),
  role:         z.enum(['worker', 'reviewer']).optional(),
  systemPrompt: z.string(),
  taskInstruction: z.string(),
  outputFormat: z.string(),
  selfVerificationChecklist: z.array(z.string()).default([]),
  executor: z.object({
    type: z.enum(['claude-cli', 'stub']),
    model: z.string().optional(),
    timeoutSeconds: z.number().int().positive().default(300),
  }),
});
```

### 3. Add Design Notes section

```markdown
## Design Notes

### Executor type rename: `claude-code-cli` → `claude-cli`
System design §4.2 uses `claude-code-cli`. This task and M2-013 use the shorter `claude-cli`.
This is a deliberate simplification — the full name adds no clarity. All M2 tasks are aligned
on `claude-cli`. The system design should be updated to match.

### Zod in the domain layer
Zod schemas live in domain model files alongside the inferred types. This is a pragmatic choice:
the schema IS the type definition (via `z.infer`), so separating them would create duplication.
The Zod runtime dependency in the domain layer is accepted.

### Executor config on agent spec vs column spec
System design §4.2 places executor config on the column spec. This task places it on the agent spec.
Agent-level config is preferred: different agents may need different timeouts and models regardless
of which column they run in. The reviewer agent (M2-013) already defines its own executor config.
```

### 4. Add acceptance criteria for new fields

```markdown
- [ ] Given a column spec with `maxIterations: 5`, when parsing, then `5` is returned
- [ ] Given a column spec with no `maxIterations`, when parsing, then default `3` is applied
- [ ] Given a column spec with `escalation: "mark_done"`, when parsing, then `"mark_done"` is returned
- [ ] Given a column spec with `workerAgentFile` and `reviewerAgentFile`, when parsing, then both paths are returned
```

### 5. Update downstream sibling tasks

After amending this task, verify M2-008's `loadColumnSpec()` uses the renamed `workerAgentFile`/`reviewerAgentFile` fields, and M2-011's orchestration loads both agent specs from the column spec.

---

## Verdict

**Approve with required changes:**

1. **Add `maxIterations` and `escalation`** to `ColumnSpecSchema` — these are PRD must-haves (FR-07, FR-08) and required by M2-011's review loop. Their omission would block the review cycle from M3 onward.
2. **Split `agentFile` into `workerAgentFile` and `reviewerAgentFile`** — system design defines two agents per column, and M2-011 needs both to orchestrate worker + reviewer runs.
3. **Add `role` to `AgentSpecSchema`** and `phase` to `ColumnSpecSchema` as optional fields for forward compatibility.
4. **Document the `claude-cli` vs `claude-code-cli` rename** as a deliberate deviation from system design.

The task is otherwise well-structured. File paths match the scaffold, barrel exports are already wired, the Zod schema definitions are syntactically correct, and the acceptance criteria cover the core parse/fail/default scenarios. The `AgentSpecSchema` aligns perfectly with M2-013's hand-authored reviewer YAML and M2-005's PromptBuilder field requirements. Implementation should be straightforward after the amendments above.
