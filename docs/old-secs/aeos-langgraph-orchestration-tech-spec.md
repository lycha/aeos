# AEOS LangGraph Orchestration Tech Spec

**Status:** Proposed
**Date:** 2026-07-20
**Scope:** Intra-column run orchestration (`TicketRunUseCase`) only

## Summary

`TicketRunUseCase.execute()` is a 961-line linear method that hard-codes the entire column cycle — eligibility → context → preflight → worker → validation → artifact commit → reviewer → sign-off — plus roughly ten near-identical failure blocks and three mutable fields used for interrupt bookkeeping. It is the single largest and least testable unit in the codebase.

LangGraph is a plausible fit for that method, but **not** for the outer pipeline. This spec recommends a **narrowly scoped, staged adoption**:

| Layer | Recommendation |
|---|---|
| Intra-column run cycle (`TicketRunUseCase`) | **Adopt** — model as a `StateGraph` behind the existing `TicketRunPort` |
| Column pipeline (`BACKLOG → … → DONE`) | **Do not adopt** — keep in SQLite + `StateMachineService` |
| Durable checkpoint/resume | **Defer** to Phase 2, only if a retry cycle is actually built |

The decisive point is that most of the value on the table — killing the duplicated failure handling and making stages independently testable — comes from **decomposing the method**, not from LangGraph itself. LangGraph earns its place only if AEOS wants reviewer→worker retry cycles and mid-column resume. This spec therefore front-loads a decomposition phase that is valuable standalone and is a prerequisite for the graph either way.

## Current architecture

### What "orchestration" means in AEOS today

Two distinct state machines are conflated by the phrase "orchestration layer":

1. **The column pipeline** — `BACKLOG → PRODUCT_SCOPING → … → DONE`. Human-paced, spanning days. Each advance is a *separate CLI process invocation* (`aeos ticket approve`). State lives in `~/.aeos/state.db` and is mirrored to git-committed markdown. Governed by `StateMachineService` (`src/domain/services/state-machine.ts`), which is deliberately permissive — it allows any non-same-column move and lets callers own workflow policy.

2. **The intra-column run cycle** — one `aeos ticket run` invocation. Machine-paced, minutes. Starts and ends inside a single process. Governed entirely by `TicketRunUseCase`.

Only (2) is a candidate for LangGraph. (1) is already durable, already correctly modeled, and already has human-in-the-loop via process boundaries.

### The intra-column cycle as it stands

`src/application/ticket-run.use-case.ts` executes this sequence, with `emitStageEvent` calls bracketing each stage:

````
eligibility guards → load specs → resolve executor config → agentic-support check
  → assembleContext → preflight → [blocked ⇒ BLOCKED, END]
  → WORKING → runWorker → [fail ⇒ FAILED, END] [interrupt ⇒ INTERRUPTED, END]
  → validate (agentic diff check + validateOutput) → [fail ⇒ FAILED, END]
  → write + commit artifact
  → load rubrics → assemble review context → runReviewer → [interrupt ⇒ INTERRUPTED, END]
  → write + commit review → rejection check → [rejected ⇒ FAILED, END]
  → IN_REVIEW → SIGNED_OFF → END
````

Three structural problems:

- **Duplicated terminal handling.** The pattern `transitionSubState(FAILED)` → check `.ok` → emit `sub-state.changed` → emit `ticket-run.failed` → `return { status: 'failed' }` appears verbatim at lines 377–404, 427–454, 463–489, and 666–699. Each copy independently re-handles the case where the transition *itself* fails.
- **Interrupt via mutable instance state.** `currentExecutor`, `interruptStage`, and `interruptRequested` (lines 36–38) are set and cleared around every executor call, with a `finally` block resetting all three. `isInterruptedReason()` (line 920) conflates an explicit interrupt flag with string-matching `'Execution interrupted by operator'` in the failure reason. This makes `TicketRunUseCase` stateful and non-reentrant — two concurrent runs on one instance would corrupt each other.
- **No seam for retry.** There is no cycle anywhere. A reviewer rejection is terminal: sub-state `FAILED`, operator re-runs the whole column from scratch, paying for a fresh worker *and* preflight pass.

### What already works and must not regress

- **The event model.** `src/domain/model/ticket-run-event.ts` and `TicketRunEventEmitter` implement the design in [the event model proposal](aeos-ticket-run-event-model-proposal.md): a single run-scoped sequencer assigns monotonic `sequence`, stamps run metadata, and forwards to an optional observer. The doc's `TicketRunPhase` union is *already* an enumeration of orchestration stages — it maps 1:1 onto graph nodes, which is strong evidence the decomposition below is natural rather than imposed.
- **Streaming.** Executor adapters forward `stdout`/`stderr` chunks live via `onChunk` → emitter → Ink. LangGraph's streaming adds nothing here.
- **The Ink TUI.** `src/cli/ui/ticket-run-shell-state.ts` (475 lines) consumes the event stream. It must be left untouched by this migration.

## What LangGraph actually buys us

Measured against what AEOS already has:

| LangGraph capability | AEOS today | Net value |
|---|---|---|
| Declarative node/edge topology | 961-line method | **High** — but achievable without the dependency |
| Cycles / conditional retry | None; rejection is terminal | **High** — the strongest single argument |
| Durable checkpoint + resume | SQLite ticket state; re-run from scratch | **Low, and risky** — see below |
| Human-in-the-loop `interrupt()` | Cross-process; `approve` is a separate command | **None** — already solved better |
| Token/step streaming | `onChunk` → emitter → Ink | **None** — already solved |
| Model/provider abstraction | Shells out to CLIs; no SDK calls | **None** — AEOS makes no LLM API calls |
| Tracing (LangSmith) | Cost records in SQLite | **Low** — and adds a telemetry surface |

Two entries deserve elaboration.

**Checkpoint/resume is not the win it appears to be.** AEOS's durability contract is "the ticket's sub-state in SQLite, plus a git commit." A crashed run leaves the ticket `WORKING` or `FAILED` and the operator re-runs the column. Resuming mid-column would be *new* behaviour, and for agentic `IMPLEMENTATION` runs it is actively hazardous: those nodes mutate the working repository and commit to `.aeos/.git`. Replaying a node after a partial repo mutation is not idempotent. A checkpointer would also introduce a **second source of truth** competing with SQLite + git.

**Human-in-the-loop does not apply.** LangGraph's `interrupt()`/`Command({ resume })` is built for pausing a graph mid-execution pending human input. AEOS's human gate sits *between* columns and is a separate process invocation, potentially days later. The intra-column `BLOCKED` state is likewise terminal for the run — preflight writes a questions artifact and the process exits. Neither is a LangGraph interrupt.

### Dependency cost (measured)

`npm install --dry-run @langchain/langgraph` on this project:

````
added 22 packages
@langchain/langgraph 1.4.8 (4.3 MB unpacked)
  + @langchain/core 1.2.3, @langchain/protocol, @langchain/langgraph-sdk,
    @langchain/langgraph-checkpoint, langsmith, js-tiktoken, mustache,
    @cfworker/json-schema, p-queue ×2, p-timeout, eventemitter3, zod 4.4.3
````

22 packages against a current runtime dependency list of 7. Notably `@langchain/core` *does* arrive transitively despite not being a direct dependency, and it brings `langsmith` and `js-tiktoken` — neither of which AEOS has any use for, since it never touches an LLM SDK or tokenizer. `zod` dedupes cleanly against the existing `^4.3.6`.

This is a modest but non-trivial cost for a CLI whose current dependency set is deliberately lean, and it would be the **first external runtime dependency in the application layer**, which today imports nothing outside `node:` builtins and domain types.

## Recommendation

Adopt LangGraph for the intra-column run cycle, in three phases, with a hard scope boundary.

### In scope

- Replacing the body of `TicketRunUseCase.execute()` with a compiled `StateGraph`.
- Reviewer→worker retry cycles (Phase 3, the feature that justifies the dependency).

### Explicitly out of scope

- **The column pipeline.** `StateMachineService`, `TicketApproveUseCase`, `TicketMoveUseCase`, and the SQLite transition log stay exactly as they are. Modelling a multi-day, human-gated, cross-process workflow as a LangGraph graph would require a durable checkpointer to become the authority on ticket state, duplicating SQLite and the git-mirrored markdown. That is a strictly worse architecture.
- **Rewriting the event model or the Ink UI.** The existing emitter stays; graph nodes call it. The TUI does not learn that LangGraph exists.
- **Replacing the `Executor` port.** Nodes invoke the same `Executor` adapters through the same port.

### Layering

The graph is an **application-layer** concern and lives in `src/application/orchestration/`. This preserves the dependency rule:

- `domain/` stays pure — it must not import `@langchain/*`. Node *logic* that is genuinely domain (e.g. `validateOutput`) stays in `domain/services/` and is called by nodes.
- `TicketRunPort` (driving port) is unchanged, so `cli/` and `container.ts` see no difference beyond which implementation is constructed.

The public contract does not move:

````typescript
// unchanged
export class LangGraphTicketRunUseCase implements TicketRunPort {
  async execute(
    projectId: string,
    projectPath: string,
    ticketId: string,
    executorOverrides?: ExecutorOverrides,
    observer?: TicketRunObserver,
  ): Promise<TicketRunResult>;

  async interrupt(): Promise<void>;
}
````

## Target design

### Graph topology

````
        ┌──────────────┐
        │  eligibility │──(ineligible)──▶ END(failed|blocked)
        └──────┬───────┘
               ▼
        ┌──────────────┐
        │  loadSpecs   │──(unsupported agentic)──▶ END(failed)
        └──────┬───────┘
               ▼
     ┌──────────────────┐
     │ assembleContext  │
     └────────┬─────────┘
              ▼
        ┌──────────┐
        │ preflight│──(blocked)──▶ blockRun ──▶ END
        └────┬─────┘
             ▼
      ┌─────────────┐
      │ markWorking │
      └──────┬──────┘
             ▼
      ┌─────────────┐
      │  runWorker  │──(fail)──▶ failRun ──▶ END
      └──────┬──────┘──(interrupt)──▶ interruptRun ──▶ END
             ▼
      ┌─────────────┐
      │  validate   │──(fail)──▶ failRun ──▶ END      ◀── Phase 3: retry edge
      └──────┬──────┘
             ▼
     ┌────────────────┐
     │ commitArtifact │
     └───────┬────────┘
             ▼
     ┌────────────────┐
     │ prepareReview  │   (rubrics + review context)
     └───────┬────────┘
             ▼
      ┌─────────────┐
      │ runReviewer │──(interrupt)──▶ interruptRun ──▶ END
      └──────┬──────┘
             ▼
     ┌────────────────┐
     │  commitReview  │──(rejected)──▶ failRun ──▶ END  ◀── Phase 3: retry edge
     └───────┬────────┘
             ▼
        ┌─────────┐
        │ signOff │──▶ END(success)
        └─────────┘
````

Four terminal nodes — `failRun`, `blockRun`, `interruptRun`, `signOff` — replace the ten duplicated inline blocks. Each is the *single* place that performs its sub-state transition, emits `sub-state.changed`, emits the terminal lifecycle event, and sets the outcome. This alone removes an estimated 200+ lines.

Node names are deliberately aligned with the existing `TicketRunPhase` union so the documented event sequences in the event-model proposal remain literally true.

### State schema

LangGraph 1.x accepts a Standard Schema state definition, so the existing `zod` dependency can define graph state rather than adding a second schema idiom:

````typescript
// src/application/orchestration/run-state.ts
export const RunState = z.object({
  // inputs — set once
  projectId: z.string(),
  projectPath: z.string(),
  ticketId: z.string(),
  overrides: executorOverridesSchema.optional(),

  // resolved during the run
  ticket: ticketSchema.optional(),
  columnSpec: columnSpecSchema.optional(),
  workerAgentSpec: agentSpecSchema.optional(),
  reviewerAgentSpec: agentSpecSchema.optional(),
  resolvedWorkerConfig: executorConfigSchema.optional(),
  resolvedReviewerConfig: executorConfigSchema.optional(),
  workerMode: z.enum(['artifact', 'agentic']).optional(),
  assembledContext: assembledContextSchema.optional(),

  // stage results
  workerResult: executorResultSchema.optional(),
  reviewResult: executorResultSchema.optional(),
  artifactPath: z.string().optional(),
  reviewPath: z.string().optional(),

  // Phase 3
  attempt: z.number().default(1),
  reviewFeedback: z.string().optional(),

  // terminal
  outcome: ticketRunResultSchema.optional(),
});
````

`mirroredTicket` — currently threaded manually through the method as a reassigned local — becomes `state.ticket`, updated by node return values. This removes a whole class of "did I remember to reassign after the transition" bugs.

**Collaborators are not state.** `ticketRepo`, `stateMachine`, `gitGateway`, the emitter, and `createExecutor` are captured by closure when the graph is built per-run, or passed via the runtime config object — never serialized into state. This matters for Phase 2: a checkpointer must never attempt to persist a `GitGateway`.

### Node contract

Every node is a pure-ish async function of `(state, config) → Partial<RunState>`:

````typescript
type RunNode = (
  state: RunState,
  config: RunnableConfig<{ deps: RunDeps }>,
) => Promise<Partial<RunState>>;
````

Routing is by conditional edge reading `state`, so a node signals a terminal path by setting fields, not by returning early. Example:

````typescript
const runWorker: RunNode = async (state, { configurable: { deps } }) => {
  deps.emitter.stage('started', 'worker', 'Running worker executor', { role: 'worker', ... });
  const result = await deps.workerExecutor.run({ /* ... */ });
  return { workerResult: result };
};

const routeAfterWorker = (state: RunState) =>
  state.workerResult?.ok === false
    ? (isInterrupt(state) ? 'interruptRun' : 'failRun')
    : 'validate';
```` 

### Event integration

**The emitter stays authoritative.** Nodes call `deps.emitter` exactly where the current code calls `emitStageEvent`. LangGraph's own `stream()` / `streamEvents()` is **not** wired to the observer.

Rationale: the event model proposal specifies that `sequence` is assigned by a single run-scoped sequencer, and that observer delivery is in-process, best-effort, and non-durable. Layering LangGraph's stream underneath would produce two interleaved orderings and break the `runId + sequence` contract the Ink shell relies on. Keeping the emitter also means the 475-line `ticket-run-shell-state.ts` and its tests need zero changes — the strongest available de-risking lever.

### Interrupt and cancellation

Replace the three mutable fields with an `AbortController` created per `execute()` call:

- The controller's signal is threaded into the graph invocation config and into each `ExecutorInvocation`.
- `interrupt()` calls `controller.abort()` and, as today, `await currentExecutor.interrupt()` to kill the in-flight child process. A handle to the active executor still has to be tracked, because aborting the graph does not itself SIGKILL a spawned CLI.
- `isInterruptedReason()`'s string-matching on `'Execution interrupted by operator'` is replaced by checking `signal.aborted`. The string check should be retained only as a transitional fallback and deleted once executor adapters are confirmed to reject with a typed `ExecutorInterruptedError`.

Making the controller per-call also fixes the current re-entrancy defect: `LangGraphTicketRunUseCase` becomes safe to invoke concurrently.

> **Verify at implementation time:** the exact config key for abort signal propagation and the Standard Schema state API against the pinned `@langchain/langgraph` version (1.4.8 at time of writing). API surface in the 1.x line has moved; do not treat the sketches above as copy-paste ready.

### Checkpointing (Phase 2 only)

If and when checkpointing is enabled:

- Use `@langchain/langgraph-checkpoint-sqlite` (1.0.3) pointed at a **separate table namespace** in `~/.aeos/state.db`, not at the `tickets` table. SQLite remains the authority on ticket state; the checkpointer stores only graph-execution position.
- `thread_id` = `${projectId}:${ticketId}:${column}:${attemptId}` — scoped per column run, not per ticket, so a resumed run cannot cross a column boundary.
- **Non-resumable nodes must be marked.** `commitArtifact`, `commitReview`, and any agentic `runWorker` perform git commits and repo mutations. Resume must restart from the last *safe* node boundary, or refuse to resume and require a clean re-run. Encode this explicitly rather than assuming replay safety.

This phase should not be started without a concrete user-facing requirement for it.

## Migration plan

### Phase 0 — Decompose in place (no dependency)

Extract the body of `execute()` into stage functions over an explicit `RunState` object, with **one** shared terminal-handling helper replacing the four duplicated failure blocks. Keep the current control flow, the emitter, and the port contract.

This is independently valuable, ships immediately, and is a prerequisite for the graph regardless of whether Phases 1–3 ever happen. **If the project only ever does Phase 0, most of the maintainability win is already banked.** That is the honest cost/benefit picture and the reason this phase is separated rather than bundled.

Exit criteria: `execute()` under ~120 lines; all 29 existing tests in `ticket-run.use-case.test.ts` pass unmodified.

### Phase 1 — Graph behind a flag

Add `@langchain/langgraph`. Implement `LangGraphTicketRunUseCase` using the Phase 0 stage functions as node bodies. No checkpointer (`MemorySaver` or none). Select the implementation in `container.ts` via env flag:

````typescript
const ticketRun = process.env.AEOS_ORCHESTRATOR === 'langgraph'
  ? new LangGraphTicketRunUseCase(/* same deps */)
  : new TicketRunUseCase(/* same deps */);
````

Both implementations satisfy `TicketRunPort` and run against the **same test suite**, parameterised over the two constructors. Any behavioural divergence is a bug in the new implementation, not an accepted difference.

Exit criteria: full suite green under both orchestrators; `AEOS_EXECUTOR=stub` runs produce byte-identical event sequences (`runId` and timestamps normalised).

### Phase 2 — Flip the default, delete the old path

After a period of dogfooding through AEOS's own pipeline, flip the default and remove `TicketRunUseCase`. Do **not** enable a checkpointer here.

### Phase 3 — Retry cycles (the actual payoff)

Add conditional edges from `validate` and `commitReview` back to `runWorker`, carrying `reviewFeedback` and incrementing `attempt`, bounded by a per-column `maxAttempts` in the column spec YAML — consistent with the existing convention that pipeline behaviour is data, not code:

````yaml
# .aeos/column-specs/tech-spec.yaml
retry:
  maxAttempts: 2
  onValidationFailure: true
  onReviewRejection: true
````

This requires new event types (`run.retry.started`, or an `attempt` field on the envelope) and corresponding TUI work. It also needs a decision on whether a retried worker run re-runs preflight — it should not.

## Testing strategy

- **Reuse, don't rewrite.** The 29 existing use-case tests are the migration's correctness oracle. Parameterising them across both implementations (Phase 1) is what makes this migration safe. Rewriting them in graph terms would discard exactly the signal needed.
- **Node-level unit tests** become newly possible — each stage function is testable without driving the full cycle, which is not practical today.
- **Event-sequence snapshot tests** against the documented success / blocked / rejected / interrupted paths in the event model proposal, asserted at the observer boundary.
- **Concurrency test** — two simultaneous `execute()` calls on one instance, which the current implementation cannot pass.
- Smoke tests (`npm run smoke-test:*`) are unaffected; they exercise executor adapters below the orchestration layer.

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Two sources of truth for state | High | No checkpointer before Phase 3; SQLite stays authoritative; checkpoint tables namespaced separately |
| Non-idempotent nodes replayed after resume | High | Mark commit/agentic nodes non-resumable; restart from safe boundaries only |
| Event ordering regressions break the Ink TUI | Medium | Keep `TicketRunEventEmitter` authoritative; do not wire LangGraph streaming to the observer |
| Dependency weight / supply chain (22 packages) | Medium | Pin exact versions; the flag in Phase 1 keeps rollback to a one-line change |
| LangGraph 1.x API churn | Medium | Confine all `@langchain/*` imports to `src/application/orchestration/`; nodes depend on ports, not on the framework |
| Migration stalls half-done | Medium | Phase 0 is independently shippable and valuable; each phase has explicit exit criteria |
| Layering erosion — framework types leaking into `domain/` | Low | Lint rule forbidding `@langchain/*` imports outside `src/application/orchestration/` |

## Decision gate

**Proceed to Phase 1 only if the answer to this is yes:** does AEOS want reviewer→worker retry cycles within a column?

If yes, LangGraph is a reasonable way to get them and the dependency is justified. If no — if a rejected review should continue to mean "operator re-runs the column" — then **stop after Phase 0**. The decomposition delivers the readability and testability wins, and 22 packages buy a topology that a linear pipeline already expresses adequately.

A secondary consideration, not decisive: `docs/01-product-brief.md` positions AEOS against "current agentic tools (LangChain, AutoGen, CrewAI…)" as developer-facing pipelines. That is a statement about product positioning, not internal implementation, and adopting LangGraph internally does not contradict it — but it is worth a deliberate nod rather than an accidental collision.

## Open questions

1. Should a Phase 3 retry re-run preflight? (Recommended: no — preflight blockers are answered by a human, not by a retry.)
2. Should `attempt` be persisted to the transition log so cost reports can attribute spend per attempt?
3. Does a retried worker run get the *previous* artifact as context, the review feedback, or both?
4. Should the graph be constructed once and reused, or rebuilt per run? (Per-run is simpler given closure-captured deps; measure before optimising.)
5. Is LangSmith tracing wanted, or should it be explicitly disabled via env to avoid an unintended telemetry surface?

## See also

- [AEOS Ticket Run Event Model Proposal](aeos-ticket-run-event-model-proposal.md)
- [AEOS Ticket Run Implementation Plan](aeos-ticket-run-implementation-plan.md)
- [System Design](03-system-design.md)
