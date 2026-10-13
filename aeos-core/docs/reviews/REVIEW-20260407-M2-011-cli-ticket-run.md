# Deep Review: M2-011 — Implement `aeos ticket run <id>` CLI Command

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Task specification — `docs/tasks/M2-011-cli-ticket-run.md`
**Cross-referenced against:** System design (03-system-design.md §4–§7), PRD (02-prd.md §5.7–§5.8), Action plan (05-action-plan-v1.md §M2), sibling tasks M2-001 through M2-014, existing scaffold in `src/`, prior reviews (M2-009, M2-010)

---

## Overall Assessment

This is the keystone task of M2 — the full orchestration command that ties together every subsystem built in M2-001 through M2-009. The orchestration sequence is conceptually correct and aligns with the system design's pipeline flow. File paths match the hexagonal scaffold. The dependency scope is appropriate.

However, the task has **four major issues**, **three medium issues**, and **several minor observations**. The major issues involve constructor signature mismatches with sibling tasks, missing git commit steps, missing rollback logic, and an incorrect acceptance criterion. Without amendments, an implementer would hit compilation errors and produce an incomplete orchestration.

**Verdict:** Approve with required changes.

---

## 1. Correctness vs System Design

### ⚠️ MAJOR (GAP-1): `PromptBuilder` is a pure function, not a class — constructor mismatch

The task's constructor lists:
```
promptBuilder: PromptBuilder
```

But M2-005 explicitly defines `buildPrompt` as a **pure function**, not a class:
```typescript
export function buildPrompt(context: AssembledContext, agentSpec: AgentSpec): string
```

M2-005's technical notes state: *"`buildPrompt()` is a pure function with no dependencies — no class instantiation needed. M2-011's container passes the function reference directly."*

**Impact:** The constructor cannot accept `PromptBuilder` as a type — no such class or interface exists. TypeScript will not compile.

**Recommendation:** Change the constructor parameter to a function type:
```typescript
buildPrompt: (context: AssembledContext, agentSpec: AgentSpec) => string
```
Or define a `PromptBuilder` type alias in `prompt-builder.ts` and import it.

### ⚠️ MAJOR (GAP-2): No git commit steps in orchestration — contradicts AC #5 and system design

AC #5 requires: *"two commits exist: artifact + review"*. System design §3.3 mandates structured git commits for every artifact.

The orchestration sequence (steps 1–13) contains **zero git commit calls**. After the executor writes output and after the reviewer produces its artifact, the use case must:
1. Write the worker artifact to the artifact store via `ArtifactStore.writeArtifact()`
2. Commit via `GitGateway.commitFiles()` with message `[TICKET-ID][ARTIFACT][v1][worker-agent][create]`
3. Write the reviewer artifact to the artifact store
4. Commit via `GitGateway.commitFiles()` with message `[TICKET-ID][REVIEW][v1][reviewer-agent][create]`

**Impact:** Without commit steps, artifacts are never persisted to `.aeos/.git`. AC #5 cannot pass. The artifact store would have no durable history.

**Recommendation:** Insert explicit commit steps after step 7 (worker artifact) and after step 10 (reviewer artifact). Show the commit message format per system design §3.3.

### ⚠️ MAJOR (GAP-3): No rollback on failure — contradicts system design §7.4

System design §7.4 states: *"Uncommitted artifact changes discarded (rollback to last clean git commit)"* on failure.

Task step 8 sets sub-state to FAILED on executor failure but does **not** mention rolling back any partial writes. If the executor wrote a partial file to the output path, it must be cleaned up.

**Impact:** On failure, stale partial artifacts could remain in the working directory, corrupting subsequent retry attempts.

**Recommendation:** Add rollback logic after step 8 and step 9:
```
If executor fails or validation fails:
  - Remove any partial artifact from ArtifactStore (via removeArtifact)
  - Set sub-state to FAILED
  - Return error
```

### ⚠️ MAJOR (GAP-4): AC #1 — "ticket in BACKLOG" cannot be run

AC #1: *"Given a ticket in BACKLOG with a stub column spec, when running `aeos ticket run AEOS-1`, then the ticket reaches SIGNED_OFF"*

But system design §2.1 says: *"Backlog is human-only. No agent runs."* And M2-008 explicitly throws `ColumnSpecNotFoundError` for `BACKLOG` (no column spec exists). The `COLUMN_SPEC_FILENAMES` mapping excludes BACKLOG, DOD_GATE, and DONE.

**Impact:** This AC is impossible to satisfy as written. A BACKLOG ticket has no column spec and cannot have an agent run.

**Recommendation:** Change AC #1 to specify a valid column:
```
Given a ticket in PRODUCT_SCOPING with a stub column spec, when running `aeos ticket run AEOS-1`, then the ticket reaches SIGNED_OFF and an artifact is written
```

---

### ⚠️ MEDIUM (M1): `outputValidation.validateOutput()` — not in constructor and not a class

Step 9 calls `outputValidation.validateOutput()` as if it is an injected service. But M2-006 defines `validateOutput` as a **pure function**:
```typescript
export function validateOutput(content: string, columnSpec: ColumnSpec): ValidationResult
```

It is not listed in the constructor dependencies. It has no class to instantiate.

**Impact:** The step implies an injected dependency that does not exist. Minor confusion for implementers, but the function can simply be imported directly.

**Recommendation:** Either:
1. Import `validateOutput` directly in the use case (it's a pure function with no ports), or
2. Add it to the constructor as a function type: `validateOutput: (content: string, columnSpec: ColumnSpec) => ValidationResult`

Option 1 is preferred — pure functions don't need injection.

### ⚠️ MEDIUM (M2): Missing `projectId` and `projectPath` parameters

The `StateMachineService.setSubState()` method requires `(projectId, ticketId, subState)` — confirmed in the actual implementation. The `ContextAssembler.assemble()` method requires `(ticketId, projectRoot)` per M2-004.

The orchestration steps reference `ticketRepo`, `stateMachine`, `contextAssembler` etc. but never show where `projectId` or `projectPath` originate. The use case `execute()` method signature is not defined.

**Impact:** Implementer must guess the method signature. All port calls requiring `projectId`/`projectPath` would fail.

**Recommendation:** Define the execute method explicitly:
```typescript
async execute(projectId: string, projectPath: string, ticketId: string): Promise<TicketRunResult>
```
This matches the pattern established by sibling tasks M2-010 and M2-012.

### ⚠️ MEDIUM (M3): Reviewer artifact naming is too generic

Step 10 says the reviewer produces `<id>-review.md`. But system design §2.2 uses column-specific review names:
- `SAAS-1-prd-review.md` (Product Scoping)
- `SAAS-1-spike-review.md` (Arch Spike)
- `SAAS-1-spec-review.md` (Tech Spec)
- `SAAS-1-impl-review.md` (Implementation)

A single `<id>-review.md` would collide across columns — the second column's review would overwrite the first's.

**Impact:** Multi-column runs would lose earlier review artifacts.

**Recommendation:** Derive the review artifact name from the column spec or use a convention like `${ticketId}-${columnSpec.outputArtifact.replace('.md', '-review.md')}`.

---

## 2. Dependencies

### ✅ "M2-002 through M2-009: All harness subsystems" — CORRECT
Broadly correct. Every subsystem is needed for the full orchestration. ✓

### ✅ "M2-013: reviewer-agent.yaml exists" — CORRECT
The reviewer invocation in step 10 requires loading the reviewer agent spec. ✓

### ⚠️ Missing: M1-008/M1-009 (StateMachineService)
`StateMachineService` is used in steps 4, 8, 9, 11, 12 but not listed as a dependency. While it's implicitly covered by "M2-002 through M2-009", the state machine is from M1, not M2.

### ⚠️ Missing: TransitionRepository
`StateMachineService` constructor requires both `TicketRepository` and `TransitionRepository`. The task's constructor lists `stateMachine: StateMachineService` (correct — it's pre-constructed), but the container wiring must provide both repos. This is a container concern, not a task gap per se, but worth noting.

### ⚠️ Missing: `readArtifact()` on ArtifactStore
Step 9 needs to read the executor's output for validation. Step 10 needs to include the new artifact in the reviewer's context. The `ArtifactStore` port needs `readArtifact()` (added per M2-004/M2-010 reviews). Not explicitly mentioned as a prerequisite.

---

## 3. File Path Alignment with Hexagonal Scaffold

| Task path | Exists on disk | Content |
|-----------|---------------|---------|
| `src/cli/commands/ticket-run.command.ts` | ✓ | Placeholder: `// CLI command — aeos ticket run` |
| `src/application/ticket-run.use-case.ts` | ✓ | Placeholder: `// Use case — TicketRun (orchestration: preflight → executor → validate → review → sign-off)` |
| `src/application/services/context-assembler.ts` | ✓ | Placeholder comment only |
| `src/application/services/prompt-builder.ts` | ✓ | Placeholder comment only |
| `src/application/services/preflight.ts` | ✗ | **Does not exist** — Layer Mapping says "(optional extraction)" |
| `src/domain/services/state-machine.ts` | ✓ | Full implementation with `transition()` + `setSubState()` |
| `src/domain/services/output-validation.ts` | ✓ | Placeholder comment only |
| `src/domain/ports/driven/executor.port.ts` | ✓ | Placeholder comment only |
| `src/domain/ports/driven/artifact-store.port.ts` | ✓ | 3-method interface (needs `readArtifact` per M2-004/M2-010 reviews) |
| `src/domain/ports/driven/git-gateway.port.ts` | ✓ | Full interface with `init()`, `commit()`, `commitFiles()` |
| `src/domain/ports/driven/column-spec-loader.port.ts` | ✓ | Placeholder comment only |
| `src/domain/ports/driven/agent-spec-loader.port.ts` | ✓ | Placeholder comment only |
| `src/domain/ports/driving/ticket-run.port.ts` | ✓ | Placeholder comment only |

### ✅ Layer placement is correct
CLI → Application use case → Application services → Domain services/ports. The hexagonal architecture is respected. ✓

### ⚠️ INFO: `preflight.ts` not created
The Layer Mapping lists `src/application/services/preflight.ts` as "(optional extraction)". This file does not exist on disk. M2-009 says the preflight logic can be inline in `ticket-run.use-case.ts` or extracted. Either way, no scaffold file exists. Not blocking — the implementer chooses.

### ⚠️ INFO: Driving port not defined
`src/domain/ports/driving/ticket-run.port.ts` exists as a placeholder. The task does not define the driving port interface. Should specify:
```typescript
export interface TicketRunPort {
  execute(projectId: string, projectPath: string, ticketId: string): Promise<TicketRunResult>;
}
```

---

## 4. Consistency with Sibling Tasks

### vs M2-005 (PromptBuilder) — ⚠️ MISMATCH
M2-005 exports a pure function `buildPrompt()`. Task treats it as a class `PromptBuilder` in the constructor. See GAP-1.

### vs M2-006 (Output Validation) — ⚠️ MISMATCH
M2-006 exports a pure function `validateOutput()`. Task calls it as `outputValidation.validateOutput()` (instance method notation). See M1.

### vs M2-009 (Preflight Pass) — ✅ ALIGNED
Task step 3 invokes preflight; M2-009 returns `PreflightResult { blocked: boolean }`. If blocked, the task returns early. The flow is consistent. ✓

### vs M2-010 (Ticket Answer) — ✅ ALIGNED
M2-010 handles the BLOCKED state that M2-011's preflight creates. The interaction is correct: M2-011 blocks → M2-010 unblocks → M2-011 re-runs. ✓

### vs M2-012 (Ticket Approve) — ✅ ALIGNED
M2-012 advances SIGNED_OFF tickets. M2-011 sets SIGNED_OFF at step 12. The handoff is correct. ✓

### vs M2-013 (Reviewer Agent YAML) — ✅ ALIGNED
M2-013 creates the `reviewer-agent.yaml` that step 10 loads via `agentSpecLoader`. ✓

### vs M2-001 (Executor Interface) — ⚠️ CONTENT FIELD
M2-009's review established that `ExecutorResult` needs a `content?: string` field for the preflight NO_BLOCKERS check. Task step 9 also needs content to call `validateOutput(content, columnSpec)`. The task does not mention how executor output content is obtained — it could come from `ExecutorResult.content` or from reading the artifact file.

### vs M2-004 (ContextAssembler) — ⚠️ SIGNATURE DRIFT
M2-004 defines: `assemble(ticketId: string, projectRoot: string): Promise<AssembledContext>`. Task step 5 says `contextAssembler.assemble()` with no parameters shown. Step 10 says "contextAssembler.assemble with the new artifact included" — but ContextAssembler reads from the artifact store, so the new artifact must be written to the store first. The task doesn't show this write step before the reviewer's context assembly.

---

## 5. Gaps That Would Block Implementation

### ⚠️ BLOCKER (GAP-1): `PromptBuilder` is not a class — constructor won't compile
No `PromptBuilder` class exists. Pure function `buildPrompt` from M2-005 must be injected as a function type.

### ⚠️ BLOCKER (GAP-2): No git commit steps — AC #5 cannot pass
The orchestration sequence contains no calls to `GitGateway`. Artifacts are never committed. The "two commits" acceptance criterion is impossible without them.

### ⚠️ BLOCKER (GAP-3): No rollback on failure — system design §7.4 requires it
Partial artifacts on failure are not cleaned up. `ArtifactStore.removeArtifact()` and/or git reset must be called.

### ⚠️ BLOCKER (GAP-4): AC #1 references BACKLOG — no column spec exists for BACKLOG
`YamlColumnSpecLoader.load()` throws `ColumnSpecNotFoundError` for BACKLOG. The AC is impossible.

### ⚠️ MEDIUM: No `execute()` method signature — `projectId`/`projectPath` unavailable
All port calls needing these parameters will fail without a defined entry point.

---

## 6. Minor Issues and Recommendations

### m1: Step 1 — "not DONE, not already WORKING" is incomplete guard
Should also check for BACKLOG (no column spec), DOD_GATE (no column spec), and BLOCKED (must answer first). A more complete guard:
```
if column is BACKLOG or DONE → error: cannot run
if column is DOD_GATE → error: DoD gate is human-only
if subState is WORKING → error: already running
if subState is BLOCKED → error: ticket is blocked, run `aeos ticket answer` first
```

### m2: Step 10 — reviewer rubrics injection not specified
The column spec has a `reviewerRubrics: string[]` field (per M2-007) containing paths to rubric markdown files. The task doesn't mention loading these rubrics and injecting them into the reviewer's context. The reviewer agent's quality depends entirely on rubric injection (system design §5.4–§5.5).

### m3: Container wiring not addressed
The existing `src/cli/container.ts` has no M2 use cases. The task says "build the container (use cases + ports)" but doesn't specify what to add. Should document the container changes needed:
- Add `TicketRunUseCase` with all 9 constructor dependencies
- Wire `StubExecutor` for tests, `ClaudeCodeCliExecutor` for production

### m4: No result type defined
Sibling tasks define their result types (e.g., `TicketAnswerResult`, `TransitionResult`). This task's use case should define `TicketRunResult` with success/failure/blocked variants.

### m5: Step 10 — reviewer artifact output path not specified
The executor invocation needs an `outputPath`. Where does the reviewer's artifact get written? Should be `${ticketId}-<column-specific-review>.md` in the artifact store.

### m6: Executor selection at runtime
The task says "executor to use is determined by container wiring." This is correct architecturally, but the CLI command needs to know which executor to wire. Should mention how the container selects the executor (e.g., based on agent spec's `executor.type` field or a CLI flag like `--stub`).

### m7: AC #5 commit message format not specified
AC #5 says "two commits exist" but doesn't specify the expected commit message format. Should reference system design §3.3: `[TICKET-ID][ARTIFACT][v1][agent][create]`.

---

## Findings Summary

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| GAP-1 | **Major** | `PromptBuilder` is a pure function, not a class — constructor won't compile | Use function type: `(context, agentSpec) => string` |
| GAP-2 | **Major** | No git commit steps — AC #5 impossible | Add explicit `GitGateway.commitFiles()` calls after steps 7 and 10 |
| GAP-3 | **Major** | No rollback on failure — system design §7.4 requires cleanup | Add `ArtifactStore.removeArtifact()` on failure paths |
| GAP-4 | **Major** | AC #1 references BACKLOG — no column spec exists | Change to PRODUCT_SCOPING or another valid column |
| M1 | Medium | `validateOutput()` is a pure function, not an injected service | Import directly or inject as function type |
| M2 | Medium | `projectId`/`projectPath` not available — no `execute()` signature | Define `execute(projectId, projectPath, ticketId)` |
| M3 | Medium | Reviewer artifact name `<id>-review.md` collides across columns | Derive from column spec: `${ticketId}-${column}-review.md` |
| m1 | Minor | Step 1 guards incomplete — missing BACKLOG, DOD_GATE, BLOCKED checks | Expand guard logic |
| m2 | Minor | Reviewer rubrics not loaded or injected into context | Load from `columnSpec.reviewerRubrics` paths |
| m3 | Minor | Container wiring changes not specified | Document additions to `src/cli/container.ts` |
| m4 | Minor | No `TicketRunResult` type defined | Define success/failure/blocked result variants |
| m5 | Minor | Reviewer artifact output path unspecified | Derive from column spec naming convention |
| m6 | Minor | Executor selection mechanism unclear | Reference agent spec `executor.type` or CLI flag |
| m7 | Minor | AC #5 commit message format not specified | Reference system design §3.3 convention |
| — | Info | `preflight.ts` not scaffolded — optional extraction | Implementer chooses inline vs extracted |
| — | Info | `ticket-run.port.ts` driving port placeholder exists but undefined | Define interface |
| — | Info | `ExecutorResult.content` needed for validation — established in M2-009 review | Ensure M2-001 amendment is applied |

---

## Recommended Task Amendments

### 1. Fix constructor signature

```typescript
constructor(
  private ticketRepo: TicketRepository,
  private stateMachine: StateMachineService,
  private contextAssembler: ContextAssembler,
  private buildPrompt: (context: AssembledContext, agentSpec: AgentSpec) => string,
  private executor: Executor,
  private artifactStore: ArtifactStore,
  private gitGateway: GitGateway,
  private columnSpecLoader: ColumnSpecLoader,
  private agentSpecLoader: AgentSpecLoader,
)
```

Remove `PromptBuilder` class reference. Remove `outputValidation` — import the pure function directly. The `PreflightService` can be constructed internally or injected.

### 2. Define `execute()` method signature

```typescript
async execute(
  projectId: string,
  projectPath: string,
  ticketId: string,
): Promise<TicketRunResult>
```

### 3. Add git commit steps to orchestration

Insert after step 7:
```
7a. artifactStore.writeArtifact(projectPath, ticketId, artifactFilename, executorResult.content)
7b. gitGateway.commitFiles(aeosDir, [artifactPath], `[${ticketId}][${artifactName}][v1][${agentSpec.name}][create]`)
```

Insert after step 10:
```
10a. artifactStore.writeArtifact(projectPath, ticketId, reviewFilename, reviewResult.content)
10b. gitGateway.commitFiles(aeosDir, [reviewPath], `[${ticketId}][REVIEW][v1][reviewer-agent][create]`)
```

### 4. Add rollback on failure

After step 8 (executor failure):
```
8a. artifactStore.removeArtifact(projectPath, ticketId, artifactFilename) // if written
```

After step 9 (validation failure):
```
9a. artifactStore.removeArtifact(projectPath, ticketId, artifactFilename)
```

### 5. Fix AC #1

Change from:
```
Given a ticket in BACKLOG with a stub column spec
```
To:
```
Given a ticket in PRODUCT_SCOPING with a stub column spec
```

### 6. Add rubric loading to step 10

```
10-pre. Load rubric files from columnSpec.reviewerRubrics paths
10-pre. Include rubric content in the reviewer's assembled context
```

### 7. Add dependencies

```
- M1-008/M1-009: StateMachineService (transition + setSubState)
- ArtifactStore.readArtifact() (cross-cutting amendment from M2-004/M2-010 reviews)
- ExecutorResult.content (cross-cutting amendment from M2-009 review)
```

---

## Verdict

**Approve with required changes:**

1. **Fix `PromptBuilder` constructor parameter** — change from class instance to function type to match M2-005's pure function export. Without this, the code will not compile.
2. **Add git commit steps** — the orchestration must commit both the worker artifact and the reviewer artifact. Without this, AC #5 fails and the artifact store has no durable history.
3. **Add rollback on failure** — system design §7.4 explicitly requires discarding uncommitted changes on failure. Without this, partial artifacts corrupt retry attempts.
4. **Fix AC #1** — BACKLOG has no column spec. Change to a valid column (e.g., PRODUCT_SCOPING).
5. **Define `execute()` method signature** — include `projectId` and `projectPath` parameters. Without these, every port call fails.
6. **Use column-specific reviewer artifact names** — `<id>-review.md` collides across columns. Derive from column spec.
7. **Import `validateOutput` directly** — it's a pure function, not an injected service.

The task's orchestration sequence is conceptually sound and aligns with the system design's pipeline flow. The layer mapping is correct. The dependency scope is broadly right. After the amendments above, the task should be implementable without ambiguity and produce a fully functional orchestration command.
