# Deep Review: M2-001 — Define `Executor` TypeScript Interface

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Task specification — `docs/tasks/M2-001-executor-interface.md`
**Cross-referenced against:** System design (03-system-design.md §5/4.1), PRD (02-prd.md FR-13, FR-30), Action plan (05-action-plan-v1.md M2), sibling tasks M1-007, M2-002, M2-003, M2-004, M2-011, M2-014, existing scaffold in `src/`

---

## Overall Assessment

The task correctly identifies the three files, their hexagonal layer placement, and the dependency on M1-007 (Column enum). File paths align exactly with the scaffold. Barrel exports are pre-wired. The `ExecutorInvocation` and `ExecutorResult` interfaces are well-designed and consistent with all downstream consumers (M2-002, M2-003, M2-011).

However, there is one **major divergence** from the system design: the `Executor` interface in the task omits `interrupt(): Promise<void>`, which the system design explicitly defines. There is also an intentional but undocumented field evolution from the system design's `exitCode?`/`stderr?` to the task's `usage?`/`error?`. Both require explicit acknowledgement.

**Verdict:** Approve with one required change (add `interrupt()`) and one recommended documentation note.

---

## 1. Correctness vs System Design

### ⚠️ MAJOR: Missing `interrupt()` method on Executor interface

**System design §5 / 4.1 defines:**
```typescript
interface Executor {
  run(invocation: AgentInvocation): Promise<ExecutorResult>
  interrupt(): Promise<void>
}
```

**Task defines:**
```typescript
export interface Executor {
  run(invocation: ExecutorInvocation): Promise<ExecutorResult>;
}
```

`interrupt()` is absent. This is not a future concern — it is required by:
- **System design §7.1:** Sub-state `INTERRUPTED` = "Operator stopped it deliberately"
- **PRD FR-13:** "Operator can interrupt a running agent; agent restarts from step 1 on resume"
- **Action plan M1:** `aeos ticket interrupt` is a listed CLI command
- **M2-011 (`ticket run`):** Must be interruptible during WORKING state

**Impact:** M2-002 (`StubExecutor`) and M2-003 (`ClaudeCodeCliExecutor`) would not implement `interrupt()`, leaving the `aeos ticket interrupt` command unimplementable. The state machine can transition to INTERRUPTED but nothing stops the running process.

**Recommendation:** Add `interrupt(): Promise<void>` to the `Executor` interface. For `StubExecutor` it can be a no-op. For `ClaudeCodeCliExecutor` it should kill the child process.

### ✅ ExecutorInvocation fields — ALIGNED (evolved)

The system design uses the name `AgentInvocation` and does not detail its fields. The task renames it to `ExecutorInvocation` (clearer — the executor receives it, not the agent) and adds explicit fields: `prompt`, `outputPath`, `ticketId`, `column`. This is a sound design evolution:
- `prompt`: matches system design §5/4.4 — orchestrator assembles prompt, hands to executor
- `outputPath`: matches system design §4.2 — executor writes to specified path
- `ticketId`: needed for cost attribution (PRD FR-30) and logging
- `column`: needed for cost records (system design §9.1 shows `column` field)

### ✅ ExecutorResult fields — ALIGNED (evolved)

System design §4.1 defines `exitCode?` and `stderr?`. The task replaces these with:
- `usage?` (inputTokens, outputTokens, costUsd) — supports cost tracking (PRD FR-30, FR-31)
- `error?` — replaces `stderr?` with a more general error string

This is a deliberate improvement. `exitCode` is an implementation detail of CLI executors — API executors have no exit code. The task's `error?` is executor-agnostic. The `usage?` object directly maps to cost records (system design §9.1).

**Minor note:** The system design's `artifactPath` is retained. ✓

### ✅ Single-method run contract — ALIGNED

The system design states: "The orchestrator assembles the invocation … and hands it to the executor. The executor runs it and returns a result. All state management, git commits, and validation happen in the orchestrator, not the executor." The task's interface enforces this — no side-channel methods beyond `run()` (plus the missing `interrupt()`).

---

## 2. Dependencies

### ✅ M1-007 (Column enum) — CORRECT and verified

The task lists M1-007 as its only dependency. The `Column` type is already implemented in `src/domain/model/column.ts` and exported via the barrel. The `ExecutorInvocation.column` field is typed as `Column`. ✓

### ✅ No circular dependencies

M2-001 depends on M1-007. M2-002 and M2-003 depend on M2-001. M2-011 depends on M2-001 transitively. Clean DAG. ✓

### ✅ No missing dependencies

All types referenced in the interfaces (`string`, `boolean`, `number`, `Column`) are either primitives or already-implemented domain types. No external packages needed.

---

## 3. File Path Alignment with Hexagonal Scaffold

### ✅ All three target files exist as scaffolded placeholders

| Task path | Exists on disk | Content |
|-----------|---------------|---------|
| `src/domain/model/executor-invocation.ts` | ✓ | Comment-only placeholder |
| `src/domain/model/executor-result.ts` | ✓ | Comment-only placeholder |
| `src/domain/ports/driven/executor.port.ts` | ✓ | Comment-only placeholder |

### ✅ Barrel exports pre-wired

- `src/domain/model/index.ts` line 10–11: exports `executor-invocation.js` and `executor-result.js` ✓
- `src/domain/ports/driven/index.ts` line 2: exports `executor.port.js` ✓

### ✅ Infrastructure adapters scaffolded for downstream

- `src/infrastructure/executor/stub-executor.adapter.ts` exists (for M2-002) ✓
- `src/infrastructure/executor/claude-cli-executor.adapter.ts` exists (for M2-003) ✓
- `src/infrastructure/executor/index.ts` barrel exists ✓

### ✅ Layer placement is correct

Value objects (`ExecutorInvocation`, `ExecutorResult`) in `domain/model/` — correct per hexagonal architecture.
Port interface (`Executor`) in `domain/ports/driven/` — correct; executor is a driven (secondary) port.

---

## 4. Consistency with Sibling Tasks

### vs M2-002 (StubExecutor) — ✅ CONSISTENT
- Implements `Executor` with `run(invocation: ExecutorInvocation): Promise<ExecutorResult>` ✓
- Uses `invocation.outputPath`, `invocation.ticketId`, `invocation.column` — all present on `ExecutorInvocation` ✓
- Returns `usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }` — matches optional `usage?` field ✓
- **Gap:** Does not implement `interrupt()` — consistent with M2-001's omission, but both need updating

### vs M2-003 (ClaudeCodeCliExecutor) — ✅ CONSISTENT
- Same `run()` signature ✓
- Returns `{ success: false, artifactPath, error: stderr }` — matches interface ✓
- `usage` is `undefined` — matches optional field ✓
- **Gap:** Does not implement `interrupt()` — same issue as M2-002

### vs M2-004 (ContextAssembler) — ✅ NO CONFLICT
ContextAssembler produces `AssembledContext`, which PromptBuilder converts to the `prompt` string on `ExecutorInvocation`. No direct dependency on M2-001, but no conflict either. ✓

### vs M2-011 (ticket run) — ✅ CONSISTENT
- Receives `executor: Executor` via constructor injection ✓
- Calls `executor.run()` with assembled invocation ✓
- Reads `ExecutorResult.success` for branching ✓

### vs M1-007 (Column enum) — ✅ CONSISTENT
- Task uses `Column` type from `src/domain/model/column.ts` ✓
- Already implemented as `const Column = { ... } as const; type Column = ...` ✓

---

## 5. Gaps That Would Block Implementation

### No blocking gaps for the current task scope.

The three files are scaffolded, barrels are wired, and the dependency (Column enum) is implemented. Implementation is straightforward: write three interfaces with JSDoc comments.


## 6. Naming and Convention Review

### ✅ `ExecutorInvocation` naming — IMPROVEMENT over system design
System design uses `AgentInvocation`. The task's `ExecutorInvocation` is more precise — the invocation is sent to the executor, not to an abstract agent. The agent is a configuration; the executor is the runtime component. Good rename.

### ✅ JSDoc on all fields — specified in Definition of Done
The task requires JSDoc comments on all fields. The interface definition in the task includes doc comments for every field. ✓

### ✅ Interface-only — correct for a port
The task explicitly states "No implementation in this file — interface only." This is correct for a driven port in hexagonal architecture. ✓

---

## 7. Test Coverage Considerations

The task does not require unit tests beyond `tsc --noEmit` compilation. This is appropriate — interfaces have no runtime behaviour to test. The downstream tasks (M2-002, M2-003) own the implementation tests. ✓

---

## Findings Summary

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| M1 | **Major** | `interrupt(): Promise<void>` missing from `Executor` interface; system design §4.1 defines it; PRD FR-13 requires it; action plan lists `aeos ticket interrupt` CLI command | Add `interrupt()` to the `Executor` interface. Update M2-002 and M2-003 task specs to implement it. |
| m1 | Minor | Field evolution from system design (`exitCode?`/`stderr?` → `usage?`/`error?`) is sound but undocumented | Add a note in the task explaining the deliberate divergence and rationale (executor-agnostic error, cost tracking support) |
| m2 | Minor | `AgentInvocation` → `ExecutorInvocation` rename is undocumented | Add a note acknowledging the naming change from system design |
| — | Info | All three file paths match scaffolded placeholders exactly | No action needed |
| — | Info | Barrel exports in `domain/model/index.ts` and `domain/ports/driven/index.ts` pre-wired | No action needed |
| — | Info | Column enum dependency (M1-007) already implemented | No action needed |
| — | Info | M2-002 and M2-003 consume the interface consistently | No action needed |

---

## Recommended Updated Interface

```typescript
export interface Executor {
  /** Execute a prompt and write the artifact to the specified output path. */
  run(invocation: ExecutorInvocation): Promise<ExecutorResult>;

  /**
   * Interrupt a running execution. Kills any in-flight process.
   * No-op if nothing is running. Used by `aeos ticket interrupt`.
   */
  interrupt(): Promise<void>;
}
```

---

## Verdict

**Approve with required change:** Add `interrupt(): Promise<void>` to the `Executor` interface before implementation. This is not optional — the system design, PRD, and action plan all require interrupt capability, and omitting it would force rework of M2-001, M2-002, and M2-003 during M2-011 integration.

After adding `interrupt()`, cascade the change to:
- M2-002: `StubExecutor.interrupt()` → no-op (`async interrupt(): Promise<void> {}`)
- M2-003: `ClaudeCodeCliExecutor.interrupt()` → kill child process
