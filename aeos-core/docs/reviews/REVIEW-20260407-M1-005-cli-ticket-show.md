# Code Review: M1-005 — `aeos ticket show <id>` CLI Command

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Task specification document — `docs/tasks/M1-005-cli-ticket-show.md`

---

## Overall Assessment

The task is straightforward — DB lookup, artifact listing, formatted output. The acceptance criteria cover the happy path, error path, and case-insensitive lookup. The scope is correctly bounded (no file content display, no transition history).

However, there are two Major issues: the artifact listing reads from the wrong path (`.aeos/` flat instead of `.aeos/tickets/<ID>/`), diverging from the directory structure established in the M1-003 review fix; and the task doesn't use the `listArtifacts()` helper from M1-013, which exists specifically for this purpose. Three Minor issues cover a command name inconsistency with the system design doc, missing handling for nullable `sub_state`, and missing error handling guidance.

**Verdict:** Approve with changes

---

## Major Issues

### M1. Artifact listing uses wrong path — reads `.aeos/` instead of `.aeos/tickets/<ID>/`

**File:** `docs/tasks/M1-005-cli-ticket-show.md` — Step 3

**Problem:**
Step 3 says "List all files in `.aeos/` matching `<id>-*.md` to show artifacts." After the M1-003 review fix, ticket artifacts live in `.aeos/tickets/<ID>/` (per system design Section 3.3), not flat in `.aeos/`. Reading from `.aeos/` root will find zero artifacts and will also risk matching non-artifact files.

The example output in step 4 also lists bare filenames (`AEOS-1-ticket.md`, `AEOS-1-prd.md`) without the `tickets/AEOS-1/` path context.

**Impact:**
The "Artifacts" section of `ticket show` will always be empty, making the command useless for its primary purpose — giving the operator visibility into what artifacts exist for a ticket.

**Recommendation:**
Change step 3 to: "List all artifacts for the ticket using `listArtifacts(ticketId)` from M1-013, which reads from `.aeos/tickets/<ID>/`."

Update the example output to show the relative path from `.aeos/`:
```
Artifacts:
  • tickets/AEOS-1/AEOS-1-ticket.md
  • tickets/AEOS-1/AEOS-1-prd.md
```

Or display just the filename (since the ticket directory is implicit) — either way, the underlying read must target the correct directory.

---

### M2. Missing dependency on M1-013 (`listArtifacts()`) — reimplements existing helper

**File:** `docs/tasks/M1-005-cli-ticket-show.md` — Step 3, Dependencies

**Problem:**
Step 3 describes inline logic to list files matching `<id>-*.md`. M1-013 defines `listArtifacts(ticketId)` as exactly this function — it reads the ticket directory, filters by ticket ID prefix, and returns matching paths. Reimplementing this logic in `ticket-show.ts` creates two code paths that must stay in sync.

M1-013 is listed in M1-003's dependencies but not in M1-005's, even though M1-005 is the primary *consumer* of `listArtifacts()`.

**Impact:**
If `artifactPath()` conventions change (e.g., the ticket directory naming pattern), `ticket-show.ts` will break because it has its own copy of the listing logic. M1-005 (`ticket show`) and M1-004 (`ticket list`) would diverge from the canonical path helper.

**Recommendation:**
Add M1-013 to the dependency list. Replace step 3 with: "Use `listArtifacts(ticketId)` from M1-013 to get all artifact file paths for the ticket."

---

## Minor Issues

### m1. Command name inconsistency: `ticket show` vs `ticket status` in system design

**File:** `docs/tasks/M1-005-cli-ticket-show.md` — title and throughout

**Problem:**
The system design doc (Section 8.1) defines the command as `aeos ticket status ticket-001` with the description "sub-state, column, artifact tree" — which is exactly what this task implements. The action plan (Section M1) uses `aeos ticket show <id>`. The task uses `show`.

Two different names for the same command will confuse implementers and create a discrepancy between the CLI surface and the system design reference.

**Recommendation:**
Pick one and update the other. The action plan uses `show` and the task uses `show`, so `show` has more momentum. Update the system design doc's command surface (Section 8.1) to use `ticket show` instead of `ticket status`, or vice versa. Document the decision in this task's Technical Notes.

---

### m2. No handling for nullable `sub_state` (BACKLOG tickets)

**File:** `docs/tasks/M1-005-cli-ticket-show.md` — Step 4

**Problem:**
After the M1-003 review fix, BACKLOG tickets have `sub_state = NULL` in the DB. The example output shows `State: WORKING`, but for a BACKLOG ticket the DB query will return `null`. The task doesn't specify what to display in this case.

M1-004 (`ticket list`) was already updated to display `—` (em-dash) for null sub-states. `ticket show` should be consistent.

**Recommendation:**
Add to step 4: "If `sub_state` is `null` (e.g. BACKLOG tickets), display `State: —`."

Add an AC: "Given a BACKLOG ticket with `sub_state = NULL`, when running `aeos ticket show AEOS-1`, then the State line displays `—`."

---

### m3. No error handling for missing project context

**File:** `docs/tasks/M1-005-cli-ticket-show.md`

**Problem:**
Step 1 calls `projectRoot()` which throws `ProjectRootNotFoundError` if CWD is not inside an AEOS project. The task doesn't specify what to print in this case. M1-004 (`ticket list`) was updated with guidance to catch this error and print a helpful message.

Similarly, no guidance for DB access failures.

**Recommendation:**
Add a Technical Note: "Catch `ProjectRootNotFoundError` and print: `Error: Not inside an AEOS project. Run 'aeos project init' first.` Exit with code 1. Wrap DB access in try/catch; on failure print: `Error: Cannot read state database.`"

---

## Positive Observations

1. **Case-insensitive lookup** is explicitly called out as an AC — good UX decision for a CLI where the operator may type `aeos-1` instead of `AEOS-1`.
2. **Out of Scope is well-bounded** — correctly defers file content display and transition history, keeping the command focused.
3. **Exit code 1 on missing ticket** — correct CLI convention for error cases, explicitly specified.

---

## Verification Notes

- After applying M1 and M2 fixes: verify that `listArtifacts()` returns the correct paths by creating a ticket, adding a second artifact file manually to `.aeos/tickets/AEOS-1/`, and running `aeos ticket show AEOS-1`.
- Test case-insensitive lookup by running `aeos ticket show aeos-1` and `aeos ticket show Aeos-1` — both should resolve.
- Test with a BACKLOG ticket (null sub_state) and a PRODUCT_SCOPING ticket (WORKING sub_state) to confirm both render correctly.

---

## Draft PR Summary

**Scope:** M1-005 task specification document
**Changes needed before implementation:**

- **Step 3:** Replace inline file listing logic with `listArtifacts(ticketId)` from M1-013; update to read from `.aeos/tickets/<ID>/` not `.aeos/` root.
- **Step 4:** Add null sub_state handling — display `—` for BACKLOG tickets, matching M1-004 convention.
- **Dependencies:** Add M1-013 (`listArtifacts()` helper).
- **Technical Notes:** Add error handling guidance for `ProjectRootNotFoundError` and DB failures.
- **Note:** Command name `show` vs `status` discrepancy with system design doc to be resolved (recommend keeping `show`).

Please review this summary and confirm it matches the intended changes before updating the task document.
