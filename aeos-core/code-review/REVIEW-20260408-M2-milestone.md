# Code & Architecture Review: Milestone 2 — Dogfood Harness

**Date:** 2026-04-08
**Reviewer:** Augment Agent
**Scope:** All M2 source code — executor, prompt assembly, validation, spec loaders, preflight, ticket-run/approve/answer
**Source lines:** ~3,700 (source), ~2,800 (tests) — 334 tests passing

---

## Overall Assessment

Strong M2 delivery. The orchestration pipeline (`ticket-run`) correctly implements the full column cycle: preflight → agent run → validate → review → sign-off. The executor abstraction is clean. Prompt building and context assembly follow the hexagonal pattern correctly. Two critical gaps: cost tracking is not wired (schema exists, no recording), and reviewer rejection doesn't block sign-off. Several architectural concerns around Zod in the domain layer and container re-instantiation.

**Verdict:** Approve with changes — 2 Critical, 4 Major, 5 Minor

---

## Architecture Compliance

- [x] Dependency direction: `cli → application → domain ← infrastructure`
- [ ] Domain purity: Zod imported in `src/domain/model/` (see M1 below)
- [x] Barrel exports updated for all new modules
- [x] Lazy container getters for all DB-dependent use cases
- [x] ESM compliance: all `.js` extensions, no CommonJS

---

## Critical Issues

### C1. Cost tracking not wired — `cost_records` table exists but is never written to

**Files:** `src/application/ticket-run.use-case.ts`, `src/cli/container.ts`

**Problem:**
The `cost_records` table exists in the DDL (database.ts), `SqliteCostRepository` is implemented, `CostRepository` port is defined, and `ExecutorResult` contains `inputTokens`, `outputTokens`, and `costUsd` fields. However:
- `TicketRunUseCase` does not inject `CostRepository`
- After `executor.run()` returns, `result.inputTokens / outputTokens / costUsd` are never persisted
- `aeos costs` (M7) will report "No cost data" for all tickets

**Impact:** Zero cost visibility. Users cannot track LLM spend. The entire cost reporting feature (M7-004) is dead on arrival.

**Recommendation:** Add `CostRepository` as the 12th constructor dependency and persist after each executor call:
```typescript
if (result.ok) {
  this.costRepo.record({
    ticketId, projectId, column,
    model: result.model ?? 'unknown',
    inputTokens: result.inputTokens ?? 0,
    outputTokens: result.outputTokens ?? 0,
    costUsd: result.costUsd ?? 0,
    recordedAt: new Date().toISOString(),
  });
}
```

### C2. Reviewer rejection does not prevent sign-off — ticket auto-advances regardless

**File:** `src/application/ticket-run.use-case.ts`, lines 198–214

**Problem:**
After the reviewer agent runs (step 11), the use case unconditionally proceeds to:
```typescript
// 12. Set sub-state to IN_REVIEW
this.stateMachine.setSubState(projectId, ticketId, 'IN_REVIEW');
// 13. Auto sign-off (v1)
this.stateMachine.setSubState(projectId, ticketId, 'SIGNED_OFF');
```
This happens even if the reviewer output contains "REJECTED" or "FAIL". The reviewer's conclusion is never parsed or checked.

**Impact:** The reviewer is decorative — its output is written but never enforced. A ticket with a "REJECTED" review auto-signs-off and can be approved to the next column.

**Recommendation:**
At minimum, parse the reviewer output for a conclusion keyword. If `REJECTED`:
```typescript
this.stateMachine.setSubState(projectId, ticketId, 'FAILED');
return { status: 'failed', ticketId, error: 'Reviewer rejected the artifact', reviewPath };
```


---

## Major Issues

### M1. Zod schemas live in `src/domain/model/` — breaks domain purity

**Files:** `src/domain/model/column-spec.ts`, `src/domain/model/agent-spec.ts`

**Problem:**
Both files import `{ z } from 'zod'` and define Zod schemas (`ColumnSpecSchema`, `AgentSpecSchema`). Zod is a runtime validation library — it's an external dependency in the pure domain layer. The domain should only define TypeScript types/interfaces; validation schemas belong in the infrastructure or application layer.

**Impact:** Domain layer is no longer dependency-free.

**Recommendation:** Move Zod schemas to `src/infrastructure/spec-loader/`. Keep plain TypeScript interfaces in `src/domain/model/`.

### M2. Container creates new `StateMachineService` + `TransitionRepository` on every getter call

**File:** `src/cli/container.ts`

**Problem:** Each `get ticketRun()`, `get ticketApprove()`, `get ticketAnswer()` creates new `SqliteTransitionRepository` and `StateMachineService` instances. 3 accesses = 9 instantiations.

**Recommendation:** Cache alongside `TicketRepository` using the `??=` pattern.

### M3. `TicketRunUseCase` has 11 constructor dependencies — too many

**File:** `src/application/ticket-run.use-case.ts`

**Problem:** 11 dependencies (12 with cost repo). Violates SRP. The use case orchestrates everything.

**Recommendation:** Extract `RunOrchestrator` and `ReviewService`. Keep `TicketRunUseCase` as a thin entry point.

### M4. `StubExecutor` hardcoded — no way to switch to `ClaudeCliExecutor`

**File:** `src/cli/container.ts`, line 85

**Problem:** `const executor = new StubExecutor()` always. No config switch.

**Recommendation:** Use `process.env.AEOS_EXECUTOR` or `config.json` to select executor.

---

## Minor Issues

### m1. `promptBuilder` passed as function, not a port interface
Inconsistent with other dependencies. Acceptable for v1.

### m2. No retry mechanism for executor failures
Ticket goes to FAILED on first error. Acceptable for v1; consider retry in v2.

### m3. `ValidationResult.violations` uses `string[]` — consider structured types for v2

### m4. `RubricLoader` port exists but no clear rubric file format defined
Works with plain markdown files, which is flexible but unstructured.

### m5. No YAML spec files committed
The YAML loaders exist but there are no actual `.yaml` column/agent spec files in the repo yet. These come in M3–M5. The loaders will throw "file not found" if `aeos ticket run` is invoked before specs are authored.

---

## Positive Observations

1. **Clean executor abstraction** — StubExecutor and ClaudeCliExecutor both implement the same port. Swapping is trivial.
2. **ContextAssembler** — correctly reads prior-column artifacts and CONSTRAINTS.md into structured context.
3. **Preflight** — blocking-questions with BLOCKED sub-state is well-designed.
4. **Output validation** — lightweight structural checks before reviewer.
5. **334 tests passing** — excellent coverage across all layers with mocked ports.
6. **Git artifact commits** — structured commit messages for all artifacts and reviews.

---

## Verification Notes

- `npm run typecheck` — PASS (0 errors)
- `npm run lint` — PASS (0 violations)
- `npm test` — PASS (334 tests, 30 test files)
- Architecture violations — Zod in domain (M1)
- Explicit `any` usage — none
- ESM compliance — all `.js` extensions correct

---

## Draft PR Summary

**M2 Implementation — Dogfood Harness**

Summary:
- Executor port + StubExecutor + ClaudeCliExecutor adapters
- ContextAssembler, PromptBuilder, OutputValidation, PreflightService
- TicketRunUseCase: full orchestration (preflight → execute → validate → review → sign-off)
- TicketApproveUseCase + TicketAnswerUseCase
- ColumnSpec + AgentSpec Zod schemas and YAML loaders
- CostRepository implemented but not wired (C1)

Testing:
- 334 tests across 30 test files