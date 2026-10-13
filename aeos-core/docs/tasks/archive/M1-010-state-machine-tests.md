# Task: Write Comprehensive State Machine Unit Tests

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** tdd-orchestrator
**Method:** Manual (bootstrapping)

## Context
The state machine is the core correctness guarantee of the entire pipeline. These tests must prove legal transitions, illegal transition rejection, and sub-state lifecycle before any executor or orchestrator is built on top. Requires M1-006 through M1-009 to be complete.

## What needs to be done
Create `src/domain/services/state-machine.test.ts` covering:

**Legal forward transition tests**
- Every adjacent forward step in `COLUMN_ORDER` (8 transitions) passes

**Legal backward transition tests**
- Backward one column (e.g., TECH_SPEC → ARCH_SPIKE) passes
- Backward multiple columns (e.g., CODE_REVIEW → PRODUCT_SCOPING) passes
- Backward to BACKLOG from any column passes
- Backward from DONE to any prior column passes
- Backward to BACKLOG resets `sub_state` to `NULL`
- Backward to a non-BACKLOG column (e.g., TECH_SPEC → ARCH_SPIKE) does NOT reset `sub_state` — the ticket retains its previous sub-state until the caller explicitly calls `setSubState()` (documents M1-008 caller contract)

**Illegal transition tests**
- Skip one column forward (e.g., BACKLOG → ARCH_SPIKE) returns `{ ok: false }`
- Skip multiple columns forward returns `{ ok: false }`
- Transition to the current column (same-column) returns `{ ok: false }`
- Forward from DONE returns `{ ok: false }` (terminal state)

**Transition comment tests**
- Transition with `comment = "Scope too broad"` persists the comment in the `transitions` row
- Transition without comment leaves `comment` as `NULL` in the `transitions` row

**Transition audit trail tests**
- After a transition, `from_sub_state` in the `transitions` row reflects the ticket's sub-state before the move
- After a BACKLOG reset, `to_sub_state` in the `transitions` row is `NULL`

**Sub-state lifecycle tests**
- `setSubState` sequences: BLOCKED → WORKING → IN_REVIEW → SIGNED_OFF (pass `projectId` to all calls)
- `setSubState` with non-existent ticket returns `{ ok: false }`
- `setSubState` with wrong `projectId` returns `{ ok: false }` (composite key isolation)
- `setSubState` on a BACKLOG ticket returns `{ ok: false }` (BACKLOG guard)
- `setSubState` with invalid sub-state string returns `{ ok: false }` (runtime validation)
- `setSubState` with same sub-state as current returns `{ ok: true }` and refreshes `updated_at` (idempotency)

**DB integrity tests**
- After a legal transition, one row appears in `transitions` table
- After two transitions, two rows appear in `transitions` table
- `updated_at` changes on each operation

**Cross-project isolation tests**
- Insert tickets with the same `id` but different `project_id` values — verify they are independent
- `stateMachine.transition('proj-a', 'T-1', ...)` must not affect ticket `T-1` in `proj-b`

**Setup / teardown**
- Each test creates a `StateMachineService` with **stub ports** (in-memory `TicketRepository` and `TransitionRepository` implementations)
- Stub `TicketRepository` stores tickets in a `Map<string, Ticket>` keyed by `projectId:ticketId`
- Stub `TransitionRepository` stores transition records in an array
- Test fixtures use a constant `projectId` (e.g. `'test-proj'`); cross-project tests use two IDs
- Use shared helpers (see Technical Notes) to insert and read tickets via the stubs

## Acceptance Criteria
- [ ] Given all 8 forward-step transition tests, when run, then all pass
- [ ] Given all backward transition tests (one-back, multi-back, to BACKLOG, from DONE), when run, then all pass
- [ ] Given all illegal transition tests, when run, then all return `{ ok: false }` with a reason string
- [ ] Given BACKLOG reset tests, when run, then `sub_state` is `NULL` after transition
- [ ] Given transition comment tests, when run, then comment is persisted or NULL as expected
- [ ] Given sub-state lifecycle tests, when run, then all pass
- [ ] Given `npx vitest run`, when executing, then all state machine tests pass and 0 failures reported
- [ ] Given `npx vitest run --coverage`, when executed, then `src/domain/services/state-machine.ts` has ≥ 90% line coverage

## Out of Scope
- Integration tests involving the CLI commands (covered in CLI command tasks)
- Tests for executor or orchestrator behaviour (M2)

## Layer Mapping
```
Test file:       src/domain/services/state-machine.test.ts
Under test:      src/domain/services/state-machine.ts (StateMachineService)
Test doubles:    Stub TicketRepository + Stub TransitionRepository (defined in test file)
```

## Technical Notes / Hints
- Tests use **stub ports**, NOT `:memory:` SQLite — domain service tests must not depend on infrastructure:
  ```typescript
  let ticketRepo: StubTicketRepository;
  let transitionRepo: StubTransitionRepository;
  let stateMachine: StateMachineService;
  beforeEach(() => {
    ticketRepo = new StubTicketRepository();
    transitionRepo = new StubTransitionRepository();
    stateMachine = new StateMachineService(ticketRepo, transitionRepo);
  });
  ```
- Define shared test helpers:
  ```typescript
  function seedTicket(
    repo: StubTicketRepository,
    overrides: Partial<{
      id: string; projectId: string; column: Column; subState: SubStateOrNull;
    }> = {}
  ): void
  // Defaults: id='T-1', projectId='test-proj', column=BACKLOG, subState=null
  ```
  Tests override only what matters for their scenario, e.g.:
  `seedTicket(ticketRepo, { column: Column.TECH_SPEC, subState: SubState.WORKING })`
- Group tests with `describe` blocks: "legal forward transitions", "legal backward transitions", "illegal transitions", "transition comments", "transition audit trail", "sub-state lifecycle", "cross-project isolation"
- All `transition()` and `setSubState()` calls on the service pass `projectId` as the first argument

## Dependencies
- M1-006: SQLite schema + `initSchema()`
- M1-007: Enums
- M1-008: `transition()`
- M1-009: `setSubState()`

## Definition of Done
- [ ] All test categories implemented and passing
- [ ] ≥ 90% line coverage on `src/domain/services/state-machine.ts`
- [ ] Tests use stub ports only — no SQLite dependency in test file
- [ ] `npx vitest run` exits 0
- [ ] Tests reviewed and approved
