# Code Review: M1-010 — Comprehensive State Machine Unit Tests

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Task specification document — `docs/tasks/M1-010-state-machine-tests.md`

---

## Overall Assessment

The task is well-structured and comprehensive after the cascading updates from the M1-008 and M1-009 reviews. The eight `describe` groups cover legal forward, legal backward, illegal, comments, audit trail, sub-state lifecycle, cross-project isolation, and DB integrity — this is the right decomposition. The `:memory:` DB strategy, `beforeEach` reset, and composite key awareness are all correct.

There is one Major issue: the test plan does not include a helper function or fixture for inserting test tickets into the DB, which means every test will duplicate raw SQL inserts with the composite key, column, sub_state, timestamps, etc. This is a test maintainability problem that will surface immediately during implementation. Two Minor issues cover a missing backward-movement sub-state preservation test and a missing `initSchema` called on `beforeEach` vs `beforeAll` clarification.

**Verdict:** Approve with changes

---

## Major Issues

### M1. No shared test helper for ticket insertion — raw SQL duplication across 30+ tests

**File:** `docs/tasks/M1-010-state-machine-tests.md` — Setup / teardown

**Problem:**
The setup section says "Test fixtures use a constant `projectId`" and "All test ticket inserts must include `project_id`". But it doesn't define a helper function for inserting test tickets.

Each test needs a ticket in a specific column and sub-state. Without a helper, every test will contain:
```typescript
db.prepare(`INSERT INTO tickets (id, project_id, title, column, sub_state, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)`).run('T-1', 'test-proj', 'Test', 'BACKLOG', null, iso, iso);
```

With 30+ tests across 8 groups, this SQL will be duplicated extensively. When the schema changes (e.g. a new column is added to `tickets`), every test breaks and every INSERT must be updated.

**Impact:**
Test maintainability — the most common reason state machine tests become unmaintainable is fixture duplication. This is the kind of problem that causes developers to skip writing tests.

**Recommendation:**
Add a Technical Note specifying a shared helper:
```typescript
function insertTicket(
  db: Database,
  overrides: Partial<{ id: string; projectId: string; column: Column; subState: SubStateOrNull }> = {}
): void
```
Defaults: `id = 'T-1'`, `projectId = 'test-proj'`, `column = Column.BACKLOG`, `subState = null`, timestamps = `new Date().toISOString()`. Tests override only what matters for their scenario.

Also add a helper to read a ticket back:
```typescript
function getTicket(db: Database, id: string, projectId?: string): TicketRow | undefined
```

These helpers centralise the SQL and make tests read as pure state machine assertions.

---

## Minor Issues

### m1. Missing test: backward transition preserves sub-state (non-BACKLOG target)

**File:** `docs/tasks/M1-010-state-machine-tests.md` — Legal backward transition tests

**Problem:**
The backward tests cover:
- Backward one column ✓
- Backward multiple columns ✓
- Backward to BACKLOG → sub_state = NULL ✓
- Backward from DONE ✓

But there is no test for what happens to `sub_state` on a backward transition to a non-BACKLOG column. Per M1-008 (updated), `transition()` does not touch `sub_state` for non-BACKLOG targets — the caller is responsible. But this means the ticket arrives in the target column with its *old* sub-state from the source column (e.g. `IN_REVIEW` from CODE_REVIEW landing in ARCH_SPIKE).

This is technically correct per the M1-008 contract, but should be explicitly tested to document the behaviour and prevent future regressions if someone assumes transition clears sub-state on all backward moves.

**Recommendation:**
Add to "Legal backward transition tests":
- "Backward to a non-BACKLOG column (e.g. TECH_SPEC → ARCH_SPIKE) does NOT reset `sub_state` — the ticket retains its previous sub-state until the caller explicitly calls `setSubState()`"

This is a documentation test — it asserts the current contract, not a new requirement.

---

### m2. `beforeEach` vs `beforeAll` for `initSchema` is ambiguous

**File:** `docs/tasks/M1-010-state-machine-tests.md` — Setup / teardown and Technical Notes

**Problem:**
Line 56 says "`initSchema` called before each test group to reset state." Line 75 says "Use `beforeEach` to call `initSchema()` to ensure a clean state per test."

"Before each test group" (once per `describe`) is `beforeAll` inside each `describe`. "Before each test" is `beforeEach`. These are different:
- `beforeAll` + `initSchema`: schema created once, ticket data accumulates across tests within the group — tests are coupled.
- `beforeEach` + fresh `:memory:` DB: each test gets a completely fresh database — tests are isolated.

The second approach (fresh DB per test) is correct for a state machine test suite where each test needs to start from a known state. But `initSchema` on an existing `:memory:` DB doesn't reset data — `CREATE TABLE IF NOT EXISTS` is a no-op if tables exist.

**Recommendation:**
Clarify: "Create a new `:memory:` Database instance in `beforeEach` and call `initSchema(db)` on it. This gives each test a completely fresh, empty database. Store the `db` instance in a `let` variable scoped to the `describe` block."

```typescript
let db: Database;
beforeEach(() => {
  db = new Database(':memory:');
  initSchema(db);
});
```

This eliminates cross-test coupling entirely.

---

## Positive Observations

1. **Eight well-defined test groups** — the decomposition matches the state machine's concerns exactly. Forward, backward, illegal, comments, audit trail, sub-state, cross-project, and DB integrity are all distinct concerns that benefit from separate `describe` blocks.
2. **Cross-project isolation tests** — this is often forgotten. Testing that `transition(db, 'proj-a', 'T-1', ...)` doesn't affect `T-1` in `proj-b` is critical for a global DB with composite keys.
3. **Coverage requirement (≥ 90%)** — appropriate for the state machine, which is the correctness backbone of the system.
4. **`:memory:` DB strategy** — fast, isolated, no cleanup needed. Correct for unit tests.
5. **Cascading updates from M1-008/M1-009 reviews** are well-integrated — backward tests, comment tests, audit trail tests, BACKLOG guard, and idempotency tests all made it into the plan.

---

## Verification Notes

- After M1 fix: confirm that test files use `insertTicket()` and `getTicket()` helpers, not raw SQL.
- After m2 fix: confirm each test starts with a fresh DB — run two tests that insert the same ticket ID and verify no unique constraint violation.
- Coverage: after all tests pass, run `npx vitest run --coverage` and verify `src/state-machine/` ≥ 90%.

---

## Draft PR Summary

**Scope:** M1-010 task specification document
**Changes needed before implementation:**

- **Setup / teardown:** Add `insertTicket()` and `getTicket()` shared helpers to Technical Notes. Document default values and override pattern.
- **Legal backward tests:** Add test for sub-state preservation on non-BACKLOG backward transitions.
- **Setup / teardown:** Clarify `beforeEach` creates a fresh `:memory:` DB + `initSchema()` per test (not `beforeAll`).
