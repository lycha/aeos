# Task: Write Comprehensive State Machine Unit Tests

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** tdd-orchestrator
**Method:** Manual (bootstrapping)

## Context
The state machine is the core correctness guarantee of the entire pipeline. These tests must prove legal transitions, illegal transition rejection, and sub-state lifecycle before any executor or orchestrator is built on top. Requires M1-006 through M1-009 to be complete.

## What needs to be done
Create `src/state-machine/state-machine.test.ts` covering:

**Legal transition tests**
- Every adjacent forward step in `COLUMN_ORDER` (8 transitions) passes
- Reset to `BACKLOG` from any column passes

**Illegal transition tests**
- Skip one column (e.g., BACKLOG → ARCH_SPIKE) returns `{ ok: false }`
- Skip multiple columns returns `{ ok: false }`
- Transition to the current column (no-op) returns `{ ok: false }`
- Transition to a previous column (except BACKLOG reset) returns `{ ok: false }`

**Sub-state lifecycle tests**
- `setSubState` sequences: BLOCKED → WORKING → IN_REVIEW → SIGNED_OFF
- `setSubState` with non-existent ticket returns `{ ok: false }`

**DB integrity tests**
- After a legal transition, one row appears in `transitions` table
- After two transitions, two rows appear in `transitions` table
- `updated_at` changes on each operation

**Setup / teardown**
- Each test uses an in-memory SQLite DB (`:memory:`) — no disk I/O
- `initSchema` called before each test group to reset state

## Acceptance Criteria
- [ ] Given all 8 forward-step transition tests, when run, then all pass
- [ ] Given all illegal transition tests, when run, then all return `{ ok: false }` with a reason string
- [ ] Given sub-state lifecycle tests, when run, then all pass
- [ ] Given `npx vitest run`, when executing, then all state machine tests pass and 0 failures reported
- [ ] Given `npx vitest run --coverage`, when executed, then `src/state-machine/` has ≥ 90% line coverage

## Out of Scope
- Integration tests involving the CLI commands (covered in CLI command tasks)
- Tests for executor or orchestrator behaviour (M2)

## Technical Notes / Hints
- Use `:memory:` database: `new Database(':memory:')` — faster, isolated, no cleanup needed
- Use `beforeEach` to call `initSchema()` to ensure a clean state per test
- Group tests with `describe` blocks: "legal transitions", "illegal transitions", "sub-state lifecycle", "DB integrity"

## Dependencies
- M1-006: SQLite schema + `initSchema()`
- M1-007: Enums
- M1-008: `transition()`
- M1-009: `setSubState()`

## Definition of Done
- [ ] All test categories implemented and passing
- [ ] ≥ 90% line coverage on `src/state-machine/`
- [ ] `npx vitest run` exits 0
- [ ] Tests reviewed and approved
