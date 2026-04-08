# Review: M6-006 — AEOS-20 DoD Gate Human Approval CLI Flow

**Reviewed:** 2026-04-08
**Task file:** `docs/tasks/M6-006-AEOS-20-dod-gate-cli.md`
**Reviewer:** Augment Agent (automated deep review)
**Cross-referenced against:**
- `docs/03-system-design.md` (System Design v0.3)
- `docs/02-prd.md` (PRD v0.1)
- `docs/05-action-plan-v1.md` (Action Plan)
- Same-milestone tasks: M6-001 (AEOS-15 deploy design), M6-002 (AEOS-16 qa-agent), M6-003 (AEOS-17 qa-report-template), M6-004 (AEOS-18 qa-structure-rubric), M6-005 (AEOS-19 dod-evaluation-rubric)
- Predecessor task: M2-012 (cli-ticket-approve, archived)
- Prior reviews: REVIEW-20260408-M6-000 through M6-005
- Source code: `src/cli/commands/ticket-dod-approve.command.ts`, `src/application/ticket-dod-approve.use-case.ts`, `src/domain/ports/driving/ticket-dod-approve.port.ts`, `src/cli/commands/ticket-approve.command.ts`, `src/application/ticket-approve.use-case.ts`, `src/domain/ports/driving/ticket-approve.port.ts`, `src/cli/container.ts`, `src/cli/index.ts`, `src/domain/model/column.ts`, `src/domain/model/sub-state.ts`, `src/domain/services/state-machine.ts`, `src/domain/ports/driven/cost-repository.port.ts`, `src/domain/ports/driven/rubric-loader.port.ts`, `src/infrastructure/filesystem/fs-rubric-loader.adapter.ts`, `src/domain/ports/driven/artifact-store.port.ts`

---

## 1. Verdict: ⛔ APPROVE WITH REQUIRED CHANGES

Two critical issues, two major issues, three medium issues, and three minor issues. The task correctly identifies the final human approval gate for the pipeline (system design §2.2: DOD_GATE reviewer = "Human approval") and correctly reuses the `ticket approve` transition pattern from M2-012. However, critical gaps in the driving port definition, container wiring, and CLI registration — combined with incorrect sub-state handling — would block implementation.

---

## 2. Correctness vs System Design

| Aspect | Task | System Design | Verdict |
|--------|------|---------------|---------|
| Command name | `aeos ticket dod-approve <id>` | §8.1: Not listed explicitly (§8.1 lists `ticket approve`) | ⚠️ See M1 |
| Column guard | DOD_GATE | §2.1: DOD_GATE column in DEPLOY phase | ✅ Match |
| Transition target | DONE | §2.1: DOD_GATE → DONE | ✅ Match |
| Human approval | Y/N prompt, operator-controlled | §2.2: "Human approval" at DOD_GATE | ✅ Match |
| Artifact displayed | DoD rubric as checklist + artifact paths | §2.2: DOD_GATE input = "All artifacts + ticket DoD" | ✅ Match |
| Sub-state on approve | `SIGNED_OFF` | §7.1: SIGNED_OFF = "Reviewer passed; card eligible to advance" | ⛔ See C2 |
| Cost summary | Print total cost from `cost_records` | §9.1–9.2: Cost views exist for tickets | ✅ Correct |
| Git commit on approval | Not specified in task | §8.3: All human moves produce `[human]` git commit | ⛔ See F-1 |

---

## 3. Findings

### ⛔ CRITICAL (C1): Driving port, use case, and CLI command are empty stubs — task provides no structural guidance

**Source code state:**
- `src/domain/ports/driving/ticket-dod-approve.port.ts`: 1-line stub (comment only)
- `src/application/ticket-dod-approve.use-case.ts`: 1-line stub (comment only)
- `src/cli/commands/ticket-dod-approve.command.ts`: 1-line stub (comment only)

**Problem:** The task says "Create" these files but provides no type signatures, constructor dependencies, or result types. Compare with M2-012 (`ticket-approve`) which provided:
- Full `TicketApproveResult` discriminated union type
- `TicketApproveUseCase` constructor signature with all dependencies
- `TicketApprovePort` interface definition
- Container wiring instructions
- Layer mapping table

The task relies on "reuse transition logic" from M2-012, but the DoD approval use case is fundamentally different:
1. It must guard on `DOD_GATE` column (not on `SIGNED_OFF` sub-state)
2. It transitions directly to `DONE` (not to "next column")
3. It requires interactive Y/N prompting (no other command does this)
4. It loads and displays the DoD rubric (requires `RubricLoader` or `ArtifactStore`)
5. It queries cost records (requires `CostRepository`)

Without port/use-case signatures, the implementer must infer the full API from prose — error-prone for agentic implementation.

**Recommendation:** Add a Layer Mapping section and explicit signatures:

```typescript
// Driving port
export type TicketDodApproveResult =
  | { status: 'approved'; ticketId: string; totalCostUsd: number }
  | { status: 'cancelled'; ticketId: string }
  | { status: 'error'; ticketId: string; error: string };

export interface TicketDodApprovePort {
  execute(projectId: string, projectPath: string, ticketId: string): TicketDodApproveResult;
}
```

### ⛔ CRITICAL (C2): Sub-state handling is incorrect — `setSubState(db, id, 'SIGNED_OFF')` is wrong

**Task step 1:** _"On Y: `transition(db, id, 'DONE')`, `setSubState(db, id, 'SIGNED_OFF')`"_

**Problem:** Two issues:

1. **API mismatch:** The task uses `transition(db, id, 'DONE')` — but `StateMachineService.transition()` takes `(projectId, ticketId, targetColumn)`, not `(db, ticketId, targetColumn)`. The `db` parameter doesn't exist. The actual call is `stateMachine.transition(projectId, ticketId, Column.DONE)`.

2. **DONE column should not have SIGNED_OFF sub-state:** When a ticket moves to DONE, the pipeline is complete. Looking at `TicketApproveUseCase`, after transition it sets `SubState.READY` — but DONE is a terminal state and should arguably have `null` sub-state (like BACKLOG). The `StateMachineService.transition()` already handles BACKLOG → null sub-state, but doesn't handle DONE specially. Setting SIGNED_OFF on a DONE ticket is semantically misleading — it implies the ticket is awaiting advance, but there is no next column.

**Recommendation:**
- Fix API call syntax to match actual `StateMachineService` signatures
- Set sub-state to `null` for DONE (terminal state) or document why SIGNED_OFF is appropriate
- Note: the state machine's `setSubState()` blocks sub-state changes on BACKLOG but does not block them on DONE — this may be a state machine gap

### 🔴 MAJOR (F-1): Missing git commit on approval — violates system design §8.3

**System design §8.3:** _"All operator actions that move state produce a `[human]` git commit."_

**Task step 1 (on Y):** `transition(db, id, 'DONE')`, `setSubState(db, id, 'SIGNED_OFF')`, print completion summary.

**No git commit step.** The `TicketApproveUseCase` (lines 70–83) commits `[${ticketId}][HUMAN][v1][advance: ${currentColumn} → ${nextColumn}]` after every approval. The DoD approval should follow the same pattern with a commit like `[${ticketId}][HUMAN][v1][dod-approve: DOD_GATE → DONE]`.

**Recommendation:** Add step: _"Commit approval to git: `gitGateway.commit(aeosDir, '[<ticketId>][HUMAN][v1][dod-approve: DOD_GATE → DONE]')`"_

### 🔴 MAJOR (F-2): Container wiring and CLI registration missing from task scope

**Problem:** The task says "Register the command in the CLI entry point" (step 4) but provides no specifics. Currently:

1. **Container (`src/cli/container.ts`):** No `ticketDodApprove` in the `Container` interface (lines 38–48). No wiring exists.
2. **CLI entry (`src/cli/index.ts`):** `registerTicketDodApproveCommand` is NOT imported (lines 8–15). NOT called in `buildProgram()` (lines 49–60). The command barrel export exists in `src/cli/commands/index.ts` but is never consumed by the CLI bootstrap.

The task must specify:
- What dependencies the use case constructor needs (`TicketRepository`, `StateMachineService`, `GitGateway`, `CostRepository`, `RubricLoader` or `ColumnSpecLoader`, `ArtifactStore`)
- How the container wires these
- The exact import and registration call in `src/cli/index.ts`

**Recommendation:** Add a Container Wiring section matching the M2-012 pattern:

```markdown
### Container Wiring (`src/cli/container.ts`)
- Add `ticketDodApprove: TicketDodApprovePort` to the `Container` interface
- Wire `TicketDodApproveUseCase` with: `TicketRepository`, `StateMachineService`,
  `GitGateway`, `CostRepository`, `RubricLoader` (or `ColumnSpecLoader` + `RubricLoader`),
  `ArtifactStore`

### CLI Registration (`src/cli/index.ts`)
- Import `registerTicketDodApproveCommand`
- Call: `registerTicketDodApproveCommand(program, () => container.ticketDodApprove, container.projectRepo)`
```

### ⚠️ MEDIUM (M1): Command `dod-approve` not in system design CLI surface

**System design §8.1:** The CLI command surface lists `ticket approve` but not `ticket dod-approve`. The system design §2.2 says DOD_GATE reviewer is "Human approval" but doesn't specify a separate CLI command.

**Question:** Should `aeos ticket approve` handle DOD_GATE → DONE transitions with special behaviour (detect column = DOD_GATE, show rubric, prompt), or should `dod-approve` be a distinct command?

**Arguments for separate command:**
- Different UX (interactive prompt vs instant advance)
- Different guards (column = DOD_GATE vs sub-state = SIGNED_OFF)
- Different output (completion summary with cost vs simple "advanced" message)

**Arguments for overloading `approve`:**
- System design only lists one `approve` command
- Simpler operator experience — one command for all approvals

**Recommendation:** The separate command is the right design choice given the UX differences. Add a note explaining the deviation from §8.1: _"The system design §8.1 `ticket approve` surface is extended with a dedicated `dod-approve` subcommand because DOD_GATE requires interactive human review (rubric display + Y/N prompt), distinct from the instant `approve` for other columns."_

### ⚠️ MEDIUM (M2): Rubric loading mechanism unspecified

**Task step 1:** _"Load DoD rubric from `dod-evaluation.md`, display as checklist"_

**Problem:** How does the use case locate and load the rubric? Two possible paths:

1. **Via column spec:** Load `dod-gate.yaml`, read `reviewerRubrics[0]`, use `RubricLoader.load()` to read the markdown. Requires `dod-gate.yaml` to exist (blocked by C1 from M6-005 review).
2. **Hardcoded path:** Use `RubricLoader.load('rubrics/dod/dod-evaluation.md', projectPath)` directly. Simpler but bypasses the column spec indirection used everywhere else.

M6-005 review (F-2, X1) flagged the same ambiguity. The AEOS-15 design (M6-001) should resolve this.

**Recommendation:** Add to Technical Notes: _"The rubric loading path depends on AEOS-15 design output. If DOD_GATE has a `dod-gate.yaml` column spec, load via `reviewerRubrics`. If human-only with no column spec, load via hardcoded path `rubrics/dod/dod-evaluation.md`."_

### ⚠️ MEDIUM (M3): "Show all artifact paths" lacks specifics

**Task step 1:** _"Show all artifact paths for the ticket"_

**Implementation question:** Use `ArtifactStore.listArtifacts(projectPath, ticketId)` which returns `string[]` of filenames in `.aeos/tickets/<ticketId>/`. The task should specify:
- Whether to show absolute paths or relative paths
- Whether to verify all expected artifacts exist (cross-check against system design §2.2 artifact table)
- Whether to show artifact sizes or modification dates

**Recommendation:** Specify: _"List artifact files using `ArtifactStore.listArtifacts()`, display as relative paths from project root (`.aeos/tickets/<ticketId>/<filename>`)."_

---

## 4. Minor Issues

### m1: Method header inconsistent with action plan

**Task header:** `Method: Agentic implementation`
**Action plan §M6:** _"Method: Dogfood."_

Same pattern as M6-004 (m1), M6-005 (m1). All M6 tickets should be `Dogfood — run through AEOS pipeline`.

**Recommendation:** Change to `Method: Dogfood — run through AEOS pipeline`.

### m2: Agent field "typescript-pro" inconsistent with sibling tasks

**Task header:** `Agent: typescript-pro`
**Sibling tasks:** M6-002 through M6-005 use `Agent: prompt-engineering` (except M6-001 which uses `backend-architect`).

This is actually correct — M6-006 produces TypeScript code (CLI command + use case), not a rubric/template. The agent assignment is appropriate.

**Verdict:** ✅ No action needed.

### m3: Definition of Done is weaker than acceptance criteria

**DoD:**
- `aeos ticket dod-approve` implemented and unit tested
- End-to-end: a ticket can move from DOD_GATE → DONE via this command

**Acceptance Criteria include additional checks not in DoD:**
- N → exit 0 with `DoD approval cancelled.`
- Ticket not in DOD_GATE → error and exit 1
- Unit tests cover all paths

**Recommendation:** Either strengthen DoD to match ACs or leave as-is (DoD as summary, ACs as detailed checklist). Current state is acceptable.

---

## 5. File Path Alignment with Hexagonal Scaffold

| Referenced Path / Component | Exists in `src/` | Status |
|----------------------------|-----------------|--------|
| `src/cli/commands/ticket-dod-approve.command.ts` | ✅ Exists | ⚠️ Stub (1-line comment) |
| `src/application/ticket-dod-approve.use-case.ts` | ✅ Exists | ⚠️ Stub (1-line comment) |
| `src/domain/ports/driving/ticket-dod-approve.port.ts` | ✅ Exists | ⚠️ Stub (1-line comment) |
| `src/cli/commands/index.ts` barrel export | ✅ Export present | Line 10: `export * from './ticket-dod-approve.command.js'` |
| `src/cli/index.ts` import + registration | ⛔ **Missing** | Not imported, not called in `buildProgram()` |
| `src/cli/container.ts` wiring | ⛔ **Missing** | No `ticketDodApprove` in `Container` interface |
| `Column.DOD_GATE` | ✅ `src/domain/model/column.ts` line 11 | |
| `Column.DONE` | ✅ `src/domain/model/column.ts` line 12 | |
| `SubState.SIGNED_OFF` | ✅ `src/domain/model/sub-state.ts` line 10 | |
| `StateMachineService.transition()` | ✅ `src/domain/services/state-machine.ts` line 23 | Signature: `(projectId, ticketId, targetColumn, comment?)` |
| `StateMachineService.setSubState()` | ✅ `src/domain/services/state-machine.ts` line 87 | Signature: `(projectId, ticketId, subState)` |
| `CostRepository.findByTicket()` | ✅ `src/domain/ports/driven/cost-repository.port.ts` line 13 | Returns `CostRecord[]` |
| `RubricLoader.load()` | ✅ `src/domain/ports/driven/rubric-loader.port.ts` line 8 | `async (rubricPath, projectPath) => string | null` |
| `ArtifactStore.listArtifacts()` | ✅ `src/domain/ports/driven/artifact-store.port.ts` line 15 | `(projectPath, ticketId) => string[]` |
| `GitGateway.commit()` | ✅ `src/domain/ports/driven/git-gateway.port.ts` | |
| `TicketRepository.findById()` | ✅ `src/domain/ports/driven/ticket-repository.port.ts` | Returns `Ticket | null` |

---

## 6. Dependency Validation

| Dependency | Status | Verified |
|-----------|--------|----------|
| M6-005: AEOS-19 (`dod-evaluation.md`) | ⬜ Not yet complete | Task file in `docs/tasks/` (not archived) |
| M2-012: `aeos ticket approve` pattern | ✅ Archived (complete) | `src/application/ticket-approve.use-case.ts` fully implemented |
| Implicit: `dod-gate.yaml` column spec | ⛔ Does not exist | See M6-005 review C1 — no task creates it |
| Implicit: DOD_GATE column design (AEOS-15) | ⬜ Not yet complete | Task file in `docs/tasks/` (not archived) |

**Transitive dependency chain:**
```
M6-001 (AEOS-15 design) → resolves DOD_GATE workflow
  └→ [M6-000b] (dod-gate.yaml) → column spec [MISSING TASK]
       └→ M6-005 (AEOS-19) → rubric content
            └→ M6-006 (AEOS-20, this task) → CLI command + use case
```

**Missing dependency:** AEOS-15 design (M6-001) is not listed as a dependency but is critical — the DoD approval workflow design directly determines how this command works (rubric loading, sub-state lifecycle, DOD_GATE column spec).

**Recommendation:** Add dependency:
```markdown
## Dependencies
- M6-005: AEOS-19 complete (`dod-evaluation.md` rubric exists)
- M6-001: AEOS-15 complete (DOD_GATE workflow design resolved)
- M2-012: `aeos ticket approve` pattern (reuse transition logic)
```

---

## 7. Consistency with Sibling CLI Command Tasks

| Aspect | M2-012 (ticket-approve) | **M6-006 (dod-approve)** |
|--------|-------------------------|--------------------------|
| Port type definition | ✅ Full `TicketApproveResult` union | ⛔ None |
| Use case constructor | ✅ Full signature with deps | ⛔ None |
| Container wiring | ✅ Explicit instructions | ⛔ None |
| CLI registration | ✅ Implicit (M2 pattern) | ⚠️ "Register in CLI entry point" (no specifics) |
| Layer mapping table | ✅ Full table | ⛔ None |
| Git commit spec | ✅ Full message format | ⛔ Missing |
| Error handling | ✅ Compensating rollback | ⛔ Not addressed |
| Technical Notes | ✅ Known limitations documented | ⛔ None |

**Key observation:** M6-006 is significantly less detailed than M2-012 despite being a more complex command (interactive prompting, rubric loading, cost querying). The implementer has insufficient guidance for the hexagonal architecture pattern used throughout the codebase.

---

## 8. Gaps That Would Block Implementation

### 8.1 Blocking gaps

1. **C1 (CRITICAL):** Empty driving port — no `TicketDodApproveResult` type, no `TicketDodApprovePort` interface. The implementer cannot build the use case without defining the API contract first.
2. **C2 (CRITICAL):** `setSubState(db, id, 'SIGNED_OFF')` uses wrong API signature and wrong sub-state for terminal DONE column.

### 8.2 Non-blocking but high-impact

3. **F-1 (MAJOR):** Missing git commit on approval violates system design §8.3.
4. **F-2 (MAJOR):** Container wiring and CLI registration unspecified — command will not be accessible even if implemented.

### 8.3 Non-blocking

5. **M1 (MEDIUM):** Command name not in system design — needs rationale note.
6. **M2 (MEDIUM):** Rubric loading mechanism unspecified — depends on AEOS-15 design.
7. **M3 (MEDIUM):** "Show all artifact paths" needs implementation specifics.

---

## 9. Recommendations Summary

| # | Severity | Finding | Action |
|---|----------|---------|--------|
| C1 | Critical | Driving port, use case, CLI command have no type signatures | Add full port type, use case constructor, layer mapping |
| C2 | Critical | Wrong sub-state (SIGNED_OFF) and wrong API syntax for DONE transition | Fix to `null` sub-state for DONE; fix API call syntax |
| F-1 | Major | No git commit on approval — violates §8.3 | Add git commit step per `TicketApproveUseCase` pattern |
| F-2 | Major | Container wiring and CLI registration unspecified | Add Container/CLI registration section per M2-012 |
| M1 | Medium | `dod-approve` not in system design CLI surface | Add rationale note for separate command |
| M2 | Medium | Rubric loading mechanism unspecified | Add Technical Notes with loading options |
| M3 | Medium | "Show all artifact paths" lacks specifics | Specify `ArtifactStore.listArtifacts()` usage |
| m1 | Minor | Method "Agentic implementation" ≠ action plan "Dogfood" | Align to `Dogfood — run through AEOS pipeline` |
| m3 | Minor | DoD weaker than ACs | Acceptable — no action needed |

---

## 10. Proposed Amendments

### 1. Add driving port type and use case signature (C1)

Add to task under "What needs to be done":

```markdown
### Driving Port (`src/domain/ports/driving/ticket-dod-approve.port.ts`)
```typescript
export type TicketDodApproveResult =
  | { status: 'approved'; ticketId: string; totalCostUsd: number }
  | { status: 'cancelled'; ticketId: string }
  | { status: 'error'; ticketId: string; error: string };

export interface TicketDodApprovePort {
  execute(projectId: string, projectPath: string, ticketId: string): TicketDodApproveResult;
}
```

### Use case constructor
```typescript
export class TicketDodApproveUseCase implements TicketDodApprovePort {
  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly stateMachine: StateMachineService,
    private readonly gitGateway: GitGateway,
    private readonly costRepo: CostRepository,
    private readonly rubricLoader: RubricLoader,
    private readonly artifactStore: ArtifactStore,
  ) {}
}
```

### Layer Mapping
```
CLI command:     src/cli/commands/ticket-dod-approve.command.ts
Use case:        src/application/ticket-dod-approve.use-case.ts
Driving port:    src/domain/ports/driving/ticket-dod-approve.port.ts
Domain service:  src/domain/services/state-machine.ts
Domain ports:    cost-repository.port.ts, rubric-loader.port.ts,
                 artifact-store.port.ts, git-gateway.port.ts
```
```

### 2. Fix sub-state and API syntax (C2)

Replace step 1 "On Y" with:
```markdown
- On Y: `stateMachine.transition(projectId, ticketId, Column.DONE)`,
  set sub-state to `null` (DONE is terminal — no active sub-state),
  commit `[<ticketId>][HUMAN][v1][dod-approve: DOD_GATE → DONE]` to git,
  print completion summary with total cost from `costRepo.findByTicket(projectId, ticketId)`
```

### 3. Add git commit step (F-1)

Add to step 1:
```markdown
- Commit approval to git: `gitGateway.commit(aeosDir, '[<ticketId>][HUMAN][v1][dod-approve: DOD_GATE → DONE]')`
- On commit failure: compensate by reverting column to DOD_GATE (follow `TicketApproveUseCase` error handling pattern, lines 76–83)
```

### 4. Add Container and CLI registration (F-2)

```markdown
### Container Wiring (`src/cli/container.ts`)
- Add `ticketDodApprove: TicketDodApprovePort` to the `Container` interface
- Wire as lazy getter:
  ```typescript
  get ticketDodApprove() {
    return new TicketDodApproveUseCase(
      getTicketRepo(), getStateMachine(), gitGateway,
      getCostRepo(), new FsRubricLoader(), artifactStore,
    );
  }
  ```

### CLI Registration (`src/cli/index.ts`)
- Import `registerTicketDodApproveCommand` from `./commands/ticket-dod-approve.command.js`
- Add call in `buildProgram()`:
  `registerTicketDodApproveCommand(program, () => container.ticketDodApprove, container.projectRepo)`
```

### 5. Add missing dependency (M6-001)

```markdown
## Dependencies
- M6-005: AEOS-19 complete (`dod-evaluation.md` rubric exists)
- M6-001: AEOS-15 complete (DOD_GATE workflow design resolved)
- M2-012: `aeos ticket approve` pattern (reuse transition logic)
```

### 6. Add Technical Notes section

```markdown
## Technical Notes / Hints
- The DoD rubric loading path depends on AEOS-15 design output. If DOD_GATE has a
  `dod-gate.yaml` column spec, load via `reviewerRubrics`. If human-only with no column
  spec, load via hardcoded path `rubrics/dod/dod-evaluation.md` using `RubricLoader`.
- Interactive Y/N prompting: use Node.js `readline` interface (or Commander's built-in
  prompt). The CLI command layer handles I/O; the use case receives a boolean `approved`
  parameter. Keep I/O out of the use case to maintain testability.
- `CostRecord.costUsd` is stored per-invocation. Sum all records for the ticket to get
  total cost: `costRepo.findByTicket(projectId, ticketId).reduce((sum, r) => sum + r.costUsd, 0)`.
- The `ticket-dod-approve` command barrel export already exists in
  `src/cli/commands/index.ts` (line 10) but the import and registration in
  `src/cli/index.ts` is missing — must be added.
- Follow `TicketApproveUseCase` compensating rollback pattern (lines 76–83) for git
  commit failure handling.
```

### 7. Fix Method header (m1)

```markdown
**Method:** Dogfood — run through AEOS pipeline
```

---

## 11. Summary

| Category | Count |
|----------|-------|
| Critical | 2 |
| Major | 2 |
| Medium | 3 |
| Minor | 2 (1 OK, 1 cosmetic) |

**Overall:** The task correctly identifies the final human approval gate and correctly delegates to the operator for a Y/N decision — matching the system design's "Human approval" at DOD_GATE (§2.2). The feature scope is right: guard on DOD_GATE, display rubric, prompt, transition to DONE, show cost summary.

The critical gap is structural: the task provides prose-level instructions but no type-level specifications for a codebase that rigorously follows hexagonal architecture with typed ports, use cases, and container wiring. Every other CLI command task (M2-012 being the direct precedent) provided full type signatures, constructor dependencies, result types, container wiring, and layer mappings. M6-006 must match this level of detail for consistent implementation.

The sub-state issue (C2) is a design question: should DONE tickets have `SIGNED_OFF` sub-state or `null`? The `StateMachineService.transition()` handles BACKLOG → null but not DONE → null. If DONE should be terminal with null sub-state, the state machine needs a corresponding guard or special case. This should be resolved before implementation.

Secondary issues — missing git commit, unspecified container wiring, rubric loading ambiguity — are all solvable with the proposed amendments and alignment with the M2-012 precedent and AEOS-15 design output.
