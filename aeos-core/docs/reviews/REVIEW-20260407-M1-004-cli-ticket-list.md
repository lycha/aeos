# Code Review: M1-004 — `aeos ticket list` CLI Command

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Task specification document — `docs/tasks/M1-004-cli-ticket-list.md`

---

## Overall Assessment

The task is correctly scoped as a simple read-only query-and-display command. The acceptance criteria cover the core scenarios (happy path, empty state, column filter), and the dependency chain is correct. The tabular output format is clean and appropriate for a CLI.

However, there are two Major issues: the task does not account for `sub_state` being nullable (BACKLOG tickets have `NULL` sub_state per the updated M1-003), and the `--column` filter accepts free-text strings without validating against the `Column` enum, which will silently return zero results on typos. Three Minor issues cover a missing dependency, missing error handling for corrupt DB state, and a sorting edge case.

**Verdict:** Approve with changes

---

## Major Issues

### M1. Display breaks on `NULL` sub_state — BACKLOG tickets will show blank or "null"

**File:** `docs/tasks/M1-004-cli-ticket-list.md` — Step 3 (table format)

**Problem:**
The example output shows:
```
AEOS-1    Add rate limiting              BACKLOG             BLOCKED
```

But M1-003 (updated) inserts BACKLOG tickets with `sub_state = NULL`:
> `{ id, title, column: 'BACKLOG', subState: null, createdAt }`

When the query returns `null` for `sub_state`, `String.padEnd()` on `null` will produce `"null"` in JavaScript, or throw if the implementer tries to call `.padEnd()` on `null` directly. The task needs to specify how to render null sub-state values.

The system design dashboard mockup (Section 8.2) shows BACKLOG tickets with sub-state `WAITING` (⚪ emoji). However, `WAITING` is not a sub-state in the `SubState` enum (M1-007). The dashboard uses attention tiers (URGENT, PENDING, RUNNING, BLOCKED, WAITING) as a *display layer* on top of sub-states, not as DB values.

**Impact:**
Every freshly created ticket will display incorrectly. Since `ticket list` is the first thing an operator runs after `ticket create`, this is the first impression of the CLI and will look broken.

**Recommendation:**
Add a display rule: "If `sub_state` is `NULL`, display `—` (em-dash) in the SUB-STATE column." Update the example output:
```
ID        TITLE                          COLUMN              SUB-STATE
AEOS-1    Add rate limiting              BACKLOG             —
AEOS-2    Implement PM agent             PRODUCT_SCOPING     WORKING
```

---

### M2. `--column` filter accepts arbitrary strings — typos silently return empty results

**File:** `docs/tasks/M1-004-cli-ticket-list.md` — Step 5

**Problem:**
The task says "Support optional `--column <column>` filter flag" and the Technical Notes say "Column name filter should be case-insensitive." But there is no validation that the supplied value is a valid column name from the `Column` enum (M1-007).

If the operator types `aeos ticket list --column BACKLG` (typo), the query will return zero rows and print the "No tickets found" message — indistinguishable from genuinely having no tickets in that column. This is a silent failure that wastes operator time.

**Impact:**
Operator confusion — especially early in usage when they're learning column names. The operator will think the column is empty when it's actually a typo.

**Recommendation:**
Add a validation step: "Before querying, validate the `--column` value against `isValidColumn()` from M1-007 (case-insensitive, uppercased before comparison). If invalid, print `Error: Unknown column '<value>'. Valid columns: BACKLOG, PRODUCT_SCOPING, ...` and exit with code 1."

This also creates a dependency on M1-007 that should be listed.

---

## Minor Issues

### m1. Missing dependency on M1-007 (Column/SubState enums)

**File:** `docs/tasks/M1-004-cli-ticket-list.md` — Dependencies

**Problem:**
The task implicitly depends on M1-007 for two reasons:
1. The `--column` filter should validate against the `Column` enum (per M2 above)
2. The display logic needs to understand valid sub-state values to format them correctly

The Dependencies section lists only M1-006 and M1-012. M1-007 is missing.

**Recommendation:**
Add: `- M1-007: Column and SubState enums (for --column validation via isValidColumn())`

---

### m2. No error handling for DB query failure or project not found

**File:** `docs/tasks/M1-004-cli-ticket-list.md`

**Problem:**
The task has no guidance on what happens when:
- `projectRoot()` throws `ProjectRootNotFoundError` (operator runs `ticket list` outside any project)
- `state.db` doesn't exist yet (operator runs `ticket list` before `ticket create` — `getDb()` may create it, but this should be explicit)
- The DB query itself fails (corrupt DB)

Every other reviewed task (M1-001, M1-002) has explicit error handling guidance in Technical Notes. This task should follow the same pattern.

**Recommendation:**
Add to Technical Notes: "Catch `ProjectRootNotFoundError` and print: `Error: Not inside an AEOS project. Run 'aeos project init' first.` Exit with code 1. Wrap DB access in try/catch; on failure print: `Error: Cannot read state database. Run 'aeos project init' to re-initialise.`"

---

### m3. Sort order "by `id` ascending" will sort lexicographically, not numerically

**File:** `docs/tasks/M1-004-cli-ticket-list.md` — Step 2

**Problem:**
The task says "ordered by `id` ascending." The `id` field is `TEXT` (e.g. `"AEOS-1"`, `"AEOS-2"`, `"AEOS-10"`). SQLite text sorting is lexicographic, so `AEOS-10` sorts *before* `AEOS-2` (because `'1' < '2'` character-by-character).

With more than 9 tickets, the list order becomes confusing:
```
AEOS-1, AEOS-10, AEOS-11, AEOS-2, AEOS-3, ...
```

**Impact:**
Low for MVP (unlikely to have 10+ tickets in M1), but will surface as a usability issue in M3+ when dogfood tickets accumulate.

**Recommendation:**
Add a Technical Note: "Sort by extracting the numeric suffix from the ticket ID. In SQLite: `ORDER BY CAST(SUBSTR(id, INSTR(id, '-') + 1) AS INTEGER) ASC`. Alternatively, sort in application code after query by parsing the numeric part."

---

## Positive Observations

1. **Empty state message includes the next command** (`Run 'aeos ticket create <title>'`) — consistent with the bootstrapping UX pattern established in M1-001 and M1-002.
2. **Case-insensitive filter** — good UX decision; operators shouldn't need to remember exact casing.
3. **`String.padEnd()` hint** — practical, avoids pulling in a table-formatting dependency for a simple 4-column layout.
4. **Out of Scope correctly defers** the interactive TUI (M7-003) and advanced sorting.

---

## Verification Notes

- After M1 fix: create a ticket (`aeos ticket create "Test"`) and immediately run `aeos ticket list`. Confirm the BACKLOG ticket displays `—` in the SUB-STATE column, not `null` or blank.
- After M2 fix: run `aeos ticket list --column BACKLG` (typo) and confirm a validation error is printed with the list of valid column names.
- Sorting test: create tickets AEOS-1 through AEOS-11, run `aeos ticket list`, and confirm AEOS-10 and AEOS-11 appear after AEOS-9, not after AEOS-1.

---

## Draft PR Summary

**Scope:** M1-004 task specification document
**Changes needed before implementation:**

- **Step 3:** Add display rule for null `sub_state` — render as `—` (em-dash). Update example output.
- **Step 5:** Add `--column` validation against `isValidColumn()` from M1-007. Print valid column names on invalid input.
- **Dependencies:** Add M1-007 (Column/SubState enums).
- **Technical Notes:** Add error handling guidance for `ProjectRootNotFoundError` and DB failures.
- **Step 2 / Technical Notes:** Add numeric sort hint for ticket IDs to avoid lexicographic ordering issues.

Please review this summary and confirm it matches the intended changes before updating the task document.
