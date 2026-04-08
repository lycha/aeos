# Deep Review: M2-009 — Implement Pre-flight Pass

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Task specification — `docs/tasks/M2-009-preflight-pass.md`
**Cross-referenced against:** System design (03-system-design.md §7.2, §7.1, §4.1, §4.2), PRD (02-prd.md §5.7), Action plan (05-action-plan-v1.md §M2), sibling tasks M2-001, M2-004, M2-005, M2-007, M2-008, M2-010, M2-011, M1-008, M1-009, existing scaffold in `src/`, prior reviews for M2-001 through M2-008

---

## Overall Assessment

The task correctly identifies the pre-flight pass as a lightweight executor invocation that gates the main column run. The concept, flow, and integration point with M2-011 (`ticket-run`) are sound. The layer mapping places the service in the application layer, which is correct for an orchestration concern.

However, the task has **two major issues**, **three medium issues**, and **several minor observations**. The major issues are API signature mismatches against implemented ports that would cause compile errors.

**Verdict:** Approve with required changes.

---

## 1. Correctness vs System Design

### ⚠️ MAJOR (GAP-1): `ArtifactStore.writeArtifact()` called with wrong arity — 3 args vs 4-arg port signature

The task shows:
```typescript
this.artifactStore.writeArtifact(ticketId, 'questions.md', content)
```

But the implemented `ArtifactStore` port (`src/domain/ports/driven/artifact-store.port.ts`) has a 4-parameter signature:
```typescript
writeArtifact(projectPath: string, ticketId: string, filename: string, content: string): void;
```

`projectPath` is missing. The `run()` method receives `projectId` (a logical ID, e.g. `"startup-a"`) but not `projectPath` (the filesystem path, e.g. `"/Users/kris/projects/startup-a"`). Every `ArtifactStore` method requires `projectPath` as its first argument.

**Impact:** Compile error. The service cannot call the port without the project path.

**Recommendation:** Either:
1. Add `projectPath: string` to the `run()` method signature, or
2. Add a `ProjectRepository` dependency to the constructor to resolve `projectPath` from `projectId`

### ⚠️ MAJOR (GAP-2): No mechanism to read executor output from temp path

Step 3 says: "Run the executor with the preflight prompt, output to a temp path."
Step 4 says: "Read the output."

The `Executor.run()` interface (from M2-001) returns `ExecutorResult { success, artifactPath, usage?, error? }`. The output is written to `artifactPath`. But the `PreflightService` has no way to read that file:

- `ArtifactStore.readArtifact()` (added by M2-004) reads from `.aeos/tickets/<ticketId>/` — NOT from an arbitrary temp path
- The service has no direct filesystem dependency (correct for hexagonal architecture)
- No port method exists to read an arbitrary file path

**Impact:** The service cannot read the executor's output to determine if it contains `NO_BLOCKERS`. Implementation is blocked.

**Recommendation:** Add a `readFile(path: string): string` method to `ArtifactStore` (or a separate `FileReader` port), or have the executor return the output content directly on `ExecutorResult` (e.g., `content?: string`). The cleanest fix is adding an optional `content` field to `ExecutorResult` — the executor already reads the output to write it; returning it avoids a redundant filesystem round-trip.

### ⚠️ MEDIUM (M1): Prompt diverges from system design — generic role vs agent's own system prompt

The task defines a hardcoded preflight prompt with `[ROLE] You are a requirements analyst.` But the system design §7.2 specifies:
```
[ROLE]
{agent system prompt}
```

The system design uses the **agent's own system prompt**, not a generic role. The task's approach is defensible (a generic analyst may be better at spotting gaps than a specialized agent), but this is an undocumented deviation from the system design.

Additionally, the task says `[CONTEXT] <ticket content only — no prior artifacts>`, while the system design §7.2 says `[CONTEXT] {same assembled context as the main run}`. This is another divergence.

**Impact:** Behavioral difference from system design. Not a compile error, but changes the pre-flight's effectiveness and should be a documented design decision.

**Recommendation:** Document the deviations explicitly as design notes in the task (similar to M2-001's rename of `AgentInvocation` → `ExecutorInvocation`). If "ticket content only" is intentional, explain why (e.g., cheaper, avoids context pollution).

### ⚠️ MEDIUM (M2): Artifact filename mismatch — `'questions.md'` vs `'${ticketId}-questions.md'`

The implementation shows `writeArtifact(ticketId, 'questions.md', content)`, which would create the file `.aeos/tickets/AEOS-1/questions.md`.

But:
- The acceptance criteria say: "`<id>-questions.md` is written to `.aeos/tickets/<id>/`" — i.e., `AEOS-1-questions.md`
- The system design §4.2 (Artifact Tree) shows: `SAAS-1-questions.md` (with ticket-ID prefix)
- All other artifacts follow the `<ticketId>-<name>.md` convention

The `ArtifactStore.writeArtifact()` takes `filename` as a literal string — it does not prepend the ticket ID. So the filename passed must be `${ticketId}-questions.md` to match the system design convention.

Additionally, `ColumnSpec.preflight.questionsArtifact` (from M2-007) defaults to `'questions.md'`. The task should use `columnSpec.preflight.questionsArtifact` rather than hardcoding `'questions.md'`, and the actual filename written should be `${ticketId}-${columnSpec.preflight.questionsArtifact}`.

**Impact:** Filename convention violated. M2-010 (`ticket answer`) would look for the wrong filename.

**Recommendation:** Change to:
```typescript
const questionsFilename = `${ticketId}-${columnSpec.preflight.questionsArtifact}`;
this.artifactStore.writeArtifact(projectPath, ticketId, questionsFilename, content);
```


### ⚠️ MEDIUM (M3): `agentSpec` parameter accepted but unused in preflight prompt

The `run()` method accepts `agentSpec: AgentSpec` as a parameter, but the hardcoded preflight prompt does not use any fields from the agent spec (no `agentSpec.systemPrompt`, no `agentSpec.outputFormat`). This parameter serves no purpose in the current implementation.

If the system design's approach is adopted (using the agent's own system prompt), then `agentSpec` is needed. If the generic "requirements analyst" approach is kept, the parameter should be removed to avoid confusion.

**Impact:** Misleading API — callers (M2-011) would assemble and pass an `agentSpec` that is never used.

**Recommendation:** Either use `agentSpec.systemPrompt` in the preflight prompt (aligning with system design), or remove `agentSpec` from the method signature and document why.

### ✅ `preflight.enabled: false` short-circuit — ALIGNED

Step 1 checks `columnSpec.preflight.enabled === false` and returns `{ blocked: false }` immediately. This matches the action plan risk register entry: "Make pre-flight optional per column spec." The `ColumnSpec` schema (M2-007) defines `preflight.enabled` with a default of `true`. ✓

### ✅ State machine call — ALIGNED

The call `this.stateMachine.setSubState(projectId, ticketId, 'BLOCKED')` matches the implemented `StateMachineService.setSubState(projectId, ticketId, subState: SubState)` signature in `src/domain/services/state-machine.ts`. The `SubState` type includes `'BLOCKED'` as a valid value. ✓

---

## 2. Dependencies

### ✅ M2-001 (Executor port) — CORRECT
The `Executor` interface is listed as a constructor dependency. `PreflightService` calls `executor.run()` with an `ExecutorInvocation`. ✓

### ✅ M1-008/M1-009 (StateMachineService) — CORRECT
`setSubState()` is implemented in `src/domain/services/state-machine.ts` with the expected 3-parameter signature. ✓

### ✅ M2-007/M2-008 (ColumnSpec and AgentSpec types) — CORRECT
`ColumnSpec` is received as a parameter. The `preflight.enabled` field exists in the Zod schema. ✓

### ⚠️ INFO: M2-004 (ContextAssembler) listed but not used in the implementation

The task lists M2-004 as a dependency "for reading ticket content," but the `PreflightService` constructor does not include `ContextAssembler`, and the implementation steps do not show any call to `contextAssembler.assemble()`. The preflight prompt is built inline with only ticket content.

If preflight needs ticket content, it must either:
1. Accept `ticketContent: string` as a parameter (caller reads it), or
2. Include `ContextAssembler` in the constructor

Currently, the task has no mechanism to obtain the ticket content at all — it's mentioned in the prompt template but never read.

**Impact:** Implementation gap. The preflight prompt references `<ticket content>` but the service has no way to obtain it.

**Recommendation:** Either add `ContextAssembler` to the constructor (and call `assemble()` for ticket content only), or add a `ticketContent: string` parameter to `run()` (simpler, since the caller — M2-011 — will have already assembled context).

### ⚠️ Missing dependency: `ExecutorInvocation` assembly

The `Executor.run()` method requires an `ExecutorInvocation` with fields: `prompt`, `outputPath`, `ticketId`, `column`. The task's step 3 says "output to a temp path" but does not specify:
- How to generate the temp path (e.g., `os.tmpdir()` + UUID)
- What `column` value to pass (should come from `ColumnSpec.column` or be passed as a parameter)

**Recommendation:** Add explicit construction of `ExecutorInvocation` to the implementation steps, including temp path generation and column mapping.

---

## 3. File Path Alignment with Hexagonal Scaffold

| Task path | Exists on disk | Content |
|-----------|---------------|---------|
| `src/application/services/preflight.ts` | ✗ (not yet created) | N/A — to be created by this task |
| `src/application/ticket-run.use-case.ts` | ✓ | Placeholder: `// Use case — TicketRun` |
| `src/domain/services/state-machine.ts` | ✓ | Full implementation with `setSubState()` |
| `src/domain/ports/driven/executor.port.ts` | ✓ | Placeholder: `// Driven port — Executor` |
| `src/domain/ports/driven/artifact-store.port.ts` | ✓ | Full interface with `writeArtifact(projectPath, ticketId, filename, content)` |

### ✅ Layer placement is correct

`src/application/services/preflight.ts` is in the application layer — correct for a service that orchestrates domain ports (executor, artifact store, state machine). This follows the same pattern as `ContextAssembler` and `PromptBuilder` in `src/application/services/`. ✓

### ⚠️ INFO: No barrel export mentioned

The task does not mention adding `PreflightService` to `src/application/services/index.ts`. The existing barrel (`src/application/services/index.ts`) re-exports `context-assembler` and `prompt-builder`. The new service should be added.

---

## 4. Consistency with Sibling Tasks

### vs M2-011 (ticket-run use case) — ✅ CONSISTENT (with GAP-1 caveat)

M2-011's orchestration step 3: "Run pre-flight (M2-009); if blocked → return blocked result." The M2-011 layer mapping lists `src/application/services/preflight.ts — PreflightService (optional extraction)`. The data flow is correct: M2-011 loads specs, creates PreflightService, calls `run()`, and branches on the result. ✓

However, M2-011's constructor does not list `PreflightService` as an injected dependency — it lists the raw ports. This means M2-011 would construct `PreflightService` internally or inline the preflight logic. Either approach works, but should be consistent with the task's assertion that preflight is "extracted for testability."

### vs M2-010 (ticket answer) — ⚠️ MEDIUM: Filename convention must match

M2-010 checks for the questions file via `ArtifactStore.artifactExists(ticketId, 'questions.md')`. This must match the filename written by M2-009. Per GAP M2 above, the actual filename should be `${ticketId}-questions.md`. Both M2-009 and M2-010 must agree on the same filename convention.

**Recommendation:** Align both tasks on `${ticketId}-${columnSpec.preflight.questionsArtifact}` as the filename.

### vs M2-004 (ContextAssembler) — ⚠️ Unused dependency

M2-004 is listed as a dependency but not used. See Dependencies §INFO above.

### vs M2-005 (PromptBuilder) — ✅ NOT a dependency, correctly excluded

The preflight builds its own simplified prompt rather than using `PromptBuilder.buildPrompt()`. This is correct — the preflight prompt structure is different from the main run's 5-section prompt. The system design §7.2 also shows a distinct prompt structure. ✓

### vs M2-007 (ColumnSpec schema) — ✅ `preflight` field ALIGNED

The `ColumnSpec` schema defines `preflight: { enabled: boolean, questionsArtifact: string }`. The task checks `preflight.enabled`. The `questionsArtifact` field should be used for the filename (see M2 above). ✓

### vs M1-009 (setSubState) — ✅ ALIGNED

`StateMachineService.setSubState()` is implemented with the expected signature. The `BLOCKED` sub-state is valid per `src/domain/model/sub-state.ts`. ✓

---

## 5. Gaps That Would Block Implementation

### ⚠️ MAJOR (GAP-1): `ArtifactStore.writeArtifact()` arity mismatch — BLOCKS compilation

The port requires 4 arguments (`projectPath`, `ticketId`, `filename`, `content`). The task shows 3. `projectPath` is not available in `run()` — it only receives `projectId` (logical ID) and `ticketId`. The implementer cannot call the port without the project filesystem path.

### ⚠️ MAJOR (GAP-2): No mechanism to read executor output — BLOCKS core logic

After `executor.run()`, the service must read the output to check for `NO_BLOCKERS`. No port method supports reading from an arbitrary temp path. The service cannot implement step 4 without filesystem access or an amended `ExecutorResult`.

### ⚠️ MEDIUM: Ticket content not obtainable — BLOCKS prompt construction

The preflight prompt includes `<ticket content>` but the service has no way to read it. No `ContextAssembler` in constructor, no `ticketContent` parameter, no `ArtifactStore.readArtifact()` call shown.

### ✅ No other blocking gaps

All other dependencies (executor, state machine, column spec types) are available and correctly referenced.

---

## 6. Minor Issues and Recommendations

### m1: `PreflightResult.questionsPath` — return value semantics undefined

The blocked result returns `questionsPath: string` but the task doesn't specify what this represents. Is it the absolute filesystem path? The artifact-store-relative path? The filename only? M2-011 (the caller) needs to know what to do with this value.

**Recommendation:** Define as the filename (e.g., `AEOS-1-questions.md`) — the caller can resolve the full path via `ArtifactStore` if needed.

### m2: `ExecutorInvocation.column` — type is `Column` enum but the task doesn't show how to derive it

`ExecutorInvocation` (from M2-001) requires a `column: Column` field. `ColumnSpec` has a `column: string` field (e.g., `"product-scoping"`). There's no mapping from the string value back to the `Column` enum. The task should specify how to obtain the `Column` enum value for the invocation.

### m3: No unit test guidance for the temp-file read scenario

The DoD requires "Unit tests with stubbed executor (both blocker and clear cases)" but doesn't address how to stub the file-read step (which is currently impossible without a port).

### m4: Barrel export missing

`src/application/services/index.ts` should re-export `PreflightService`. Not mentioned in the task.

---

## Findings Summary

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| GAP-1 | **Major** | `writeArtifact()` called with 3 args — port requires 4 (`projectPath` missing) | Add `projectPath` to `run()` parameters or inject `ProjectRepository` |
| GAP-2 | **Major** | No mechanism to read executor output from temp path — no port supports arbitrary file reads | Add `content?: string` to `ExecutorResult` or add a file-reader port |
| M1 | Medium | Preflight prompt uses generic role and ticket-only context — diverges from system design §7.2 which uses agent's system prompt and full context | Document as design decision; consider aligning |
| M2 | Medium | Filename `'questions.md'` vs convention `'${ticketId}-questions.md'` — mismatches AC and system design §4.2 | Use `${ticketId}-${columnSpec.preflight.questionsArtifact}` |
| M3 | Medium | `agentSpec` parameter accepted but unused in preflight prompt | Remove or use; document decision |
| — | Medium | Ticket content not obtainable — prompt references it but no read mechanism exists | Add `ticketContent` param or `ContextAssembler` dependency |
| — | Medium | M2-010 filename must match M2-009 — both must agree on questions artifact naming | Align on `${ticketId}-questions.md` |
| m1 | Minor | `PreflightResult.questionsPath` semantics undefined | Define as filename |
| m2 | Minor | `ExecutorInvocation.column` — no mapping from `ColumnSpec.column` string to `Column` enum | Specify mapping |
| m3 | Minor | No test guidance for file-read stub | Address after GAP-2 resolution |
| m4 | Minor | Barrel export for `PreflightService` not mentioned | Add to `src/application/services/index.ts` |
| — | Info | `src/application/services/preflight.ts` does not exist yet — to be created | ✓ |
| — | Info | `StateMachineService.setSubState()` fully implemented and tested | ✓ |
| — | Info | `SubState.BLOCKED` is a valid enum value in `src/domain/model/sub-state.ts` | ✓ |

---

## Recommended Task Amendments

### 1. Fix `writeArtifact()` call — add `projectPath`

Change `run()` signature to include `projectPath`:
```typescript
async run(
  ticketId: string,
  projectId: string,
  projectPath: string,       // ← ADD: filesystem path for port calls
  ticketContent: string,     // ← ADD: ticket markdown content for prompt
  columnSpec: ColumnSpec,
): Promise<PreflightResult>
```

Remove `agentSpec` (unused with generic prompt) or keep it if aligning with system design.

Update the `writeArtifact` call:
```typescript
const questionsFilename = `${ticketId}-${columnSpec.preflight.questionsArtifact}`;
this.artifactStore.writeArtifact(projectPath, ticketId, questionsFilename, content);
```

### 2. Resolve executor output reading — add `content` to `ExecutorResult`

The cleanest cross-cutting fix is to add `content?: string` to `ExecutorResult` (amending M2-001). The executor already captures stdout — returning it avoids a filesystem round-trip and a new port:
```typescript
export interface ExecutorResult {
  success: boolean;
  artifactPath: string;
  content?: string;     // ← ADD: raw output text (for preflight NO_BLOCKERS check)
  usage?: { inputTokens: number; outputTokens: number; costUsd: number };
  error?: string;
}
```

Alternatively, add a `readFile(absolutePath: string): string` method to `ArtifactStore` or create a dedicated `FileReader` port.

### 3. Document system design deviations

Add a Design Notes section:
```markdown
## Design Notes

### Preflight prompt — generic role vs agent system prompt
System design §7.2 uses the agent's own system prompt for preflight. This task uses a
generic "requirements analyst" role instead. Rationale: the preflight is a meta-task
(identifying gaps, not producing the artifact), so a specialist prompt produces better
gap detection than the domain-specific agent prompt. This is a deliberate deviation.

### Context scope — ticket only vs full context
System design §7.2 injects the same assembled context as the main run. This task injects
ticket content only. Rationale: prior artifacts are irrelevant for gap detection in the
current column's input; including them would increase cost with no benefit.
```

### 4. Fix artifact filename convention

Update implementation step 4:
```typescript
const questionsFilename = `${ticketId}-${columnSpec.preflight.questionsArtifact}`;
this.artifactStore.writeArtifact(projectPath, ticketId, questionsFilename, content);
```

Update AC:
> Given an underspecified ticket, when model responds with questions, then `AEOS-1-questions.md` is written to `.aeos/tickets/AEOS-1/`

### 5. Add barrel export

Add to layer mapping:
```
Barrel:          src/application/services/index.ts — re-export PreflightService
```

---

## Verdict

**Approve with required changes:**

1. **Fix `writeArtifact()` arity** — the port requires `projectPath` as the first argument. Add `projectPath` to the `run()` method signature.
2. **Resolve executor output reading** — the service must read the executor's output to check for `NO_BLOCKERS`. Either add `content` to `ExecutorResult` (preferred, amends M2-001) or add a file-reader port.
3. **Provide ticket content** — the preflight prompt references ticket content but the service has no mechanism to obtain it. Add `ticketContent` parameter to `run()`.
4. **Fix artifact filename** — use `${ticketId}-${columnSpec.preflight.questionsArtifact}` to match system design's naming convention and ensure M2-010 compatibility.
5. **Document system design deviations** — the generic prompt role and ticket-only context are defensible choices but must be documented as deliberate deviations.

The task is otherwise well-conceived. The pre-flight concept correctly addresses the system design's requirement to prevent expensive main runs on underspecified tickets. The `PreflightResult` discriminated union is clean. The `preflight.enabled` short-circuit is correctly aligned with the column spec schema. The dependency on M2-010 (`ticket answer`) is correctly scoped as out-of-scope. After the amendments above, the task should be implementable without ambiguity.
