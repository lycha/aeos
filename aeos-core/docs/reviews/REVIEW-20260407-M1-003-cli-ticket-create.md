# Code Review: M1-003 — `aeos ticket create <title>` CLI Command

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Task specification document — `docs/tasks/M1-003-cli-ticket-create.md`

---

## Overall Assessment

The task covers the essential happy path for ticket creation: ID generation, file writing, DB insertion, and git commit. The dependency chain (M1-002, M1-006, M1-012, M1-014) is correctly identified and the acceptance criteria are testable.

However, there are two Major issues: the artifact filesystem layout contradicts the system design doc (flat files in `.aeos/` vs per-ticket subdirectories under `.aeos/tickets/`), and the ticket markdown template is missing critical sections defined in the system design. Three Minor issues address a wrong initial sub-state for BACKLOG tickets, a missing `artifactPath()` dependency, and a commit message format that doesn't match the system design convention.

**Verdict:** Approve with changes

---

## Major Issues

### M1. Artifact layout contradicts system design — missing `tickets/<ID>/` subdirectory

**File:** `docs/tasks/M1-003-cli-ticket-create.md` — Step 5

**Problem:**
The task writes the ticket file to `.aeos/<KEY>-<N>-ticket.md` (flat in `.aeos/`). The system design doc (Section 3.3) specifies a `tickets/` subdirectory with per-ticket directories:

```
.aeos/
  tickets/
    T001/
      T001-ticket.md
      T001-prd.md
      ...
```

Section 3.2 further reinforces this: "Each ticket has its own directory. Artifacts are stored flat inside it." The "flat" means flat *within the ticket directory*, not flat in `.aeos/` root.

Placing artifacts directly in `.aeos/` will collide with other AEOS files (`project.json`, `state.db`, `column-specs/`, `CONSTRAINTS.md`) and make `listArtifacts()` (M1-013) fragile — it would need to filter out non-artifact files from the `.aeos/` root.

**Impact:**
Every downstream task that reads or writes artifacts (M1-005, M1-013, M2-004, M2-005, and all agent runs) will build on the wrong path convention. Fixing this later requires a coordinated change across the entire codebase.

**Recommendation:**
Change step 5 to:
1. Create `.aeos/tickets/<KEY>-<N>/` directory if it does not exist
2. Write `.aeos/tickets/<KEY>-<N>/<KEY>-<N>-ticket.md`

Update AC #1 accordingly: "then `AEOS-1-ticket.md` exists in `.aeos/tickets/AEOS-1/`"

Also update M1-013 (`artifactPath()`) to use `.aeos/tickets/<ticketId>/` as the base path rather than `.aeos/` directly. This should be noted as a cross-task coordination item.

---

### M2. Ticket markdown template missing required sections from system design

**File:** `docs/tasks/M1-003-cli-ticket-create.md` — Step 5, markdown template

**Problem:**
The task specifies this template:
```markdown
# <title>
**ID:** <KEY>-<N>
**Created:** <ISO date>
**Column:** BACKLOG
## Description
<!-- Fill in the ticket description here -->
```

The system design doc (Section 4, subsection 3.1) defines the ticket structure as:
```markdown
# Ticket: {ticket-id}
## Title
{title}
## Description
{description}
## Definition of Done
{acceptance criteria — evaluated only at DoD Gate}
## Notes
{additional context, links, constraints}
```

Two critical sections are missing:
1. **Definition of Done** — this is the core quality gate evaluated at the final DoD Gate column (Section 5.7 of the PRD, FR-18). Without it in the template, operators will forget to add it, and the DoD Gate agent in M6 will have nothing to evaluate against.
2. **Notes** — supplementary context that agents use during execution.

Additionally, the heading format differs (`# <title>` vs `# Ticket: {ticket-id}`), and metadata like `**Column:** BACKLOG` is not part of the system design template — column state lives in the DB, not in the file (the file is "immutable after creation" per Section 4).

**Impact:**
Tickets created without a DoD section will fail at the DoD Gate (M6). Agents expecting `## Notes` will find nothing. Embedding mutable state (`Column: BACKLOG`) in an immutable file creates a stale data problem.

**Recommendation:**
Replace the template with:
```markdown
# Ticket: <KEY>-<N>

## Title
<title>

## Description
<!-- Fill in the ticket description here -->

## Definition of Done
<!-- Define acceptance criteria — evaluated at DoD Gate -->

## Notes
<!-- Additional context, links, constraints -->
```

Remove the `**Column:** BACKLOG` and `**Created:**` metadata lines — column state is in the DB, and creation date is in the git commit timestamp.

---

## Minor Issues

### m1. Initial sub-state for BACKLOG should not be BLOCKED

**File:** `docs/tasks/M1-003-cli-ticket-create.md` — Step 6

**Problem:**
Step 6 inserts the ticket with `subState: 'BLOCKED'`. The system design doc (Section 7.1) defines BLOCKED as "Pre-flight pass found open questions. Operator must answer before main run starts." A ticket in BACKLOG has not been run through any agent — there is no pre-flight pass, no questions, no blocker. BLOCKED is semantically wrong.

The action plan (Section M1) describes Backlog as "human-only. No agent runs. Cards sit until the operator moves them forward." The M0 review's dashboard mockup (Section 8.2) shows BACKLOG tickets as `⚪ WAITING`.

There is no `WAITING` sub-state in the enum (M1-007), so the closest correct value would be to not assign a sub-state at all (null) or to treat BACKLOG as a special column that doesn't use the sub-state machine. Alternatively, the DB schema could allow `sub_state` to be nullable for BACKLOG.

**Recommendation:**
Either:
(a) Make `sub_state` nullable in the DB schema (M1-006) and insert BACKLOG tickets with `sub_state: null`, or
(b) Add a `WAITING` value to the `SubState` enum (M1-007) and use it for BACKLOG tickets, or
(c) If neither is acceptable for v1 scope, use `SIGNED_OFF` (since BACKLOG has no review — the ticket is "ready to advance" as soon as the operator decides) and document the choice.

Option (a) is cleanest. Coordinate with M1-006 and M1-007.

---

### m2. Missing dependency on M1-013 (`artifactPath()`)

**File:** `docs/tasks/M1-003-cli-ticket-create.md` — Dependencies

**Problem:**
Step 5 constructs a file path for the ticket artifact. M1-013 defines `artifactPath(ticketId, artifactName)` as the canonical path resolution utility for exactly this purpose. The task should use `artifactPath('AEOS-1', 'ticket.md')` rather than constructing the path inline.

Without this dependency, `ticket-create.ts` will hardcode path construction that may diverge from `artifactPath()`, breaking `listArtifacts()` and `ticket show`.

**Recommendation:**
Add M1-013 to the dependency list. Use `artifactPath(ticketId, 'ticket.md')` in step 5 instead of inline path construction.

---

### m3. Git commit message format doesn't match system design convention

**File:** `docs/tasks/M1-003-cli-ticket-create.md` — Step 7

**Problem:**
Step 7 says to use `gitCommit()` (M1-014) but doesn't specify the commit message. M1-014 defines the format as:
```
aeos(<ticketId>/<column>): <description>
```
But the system design doc (Section 3.3) defines the commit convention as:
```
[TICKET-ID][ARTIFACT][vN][AGENT][action: reason]
```
With the ticket creation example: `[SAAS-2][TICKET][v1][human][create]`

M1-014's format and the system design format are already misaligned (a separate issue for M1-014's review), but this task should at least specify which message to use so the implementer doesn't guess.

**Recommendation:**
Add the explicit commit message to step 7:
```
Commit message: `[<KEY>-<N>][TICKET][v1][human][create]`
```
This matches the system design convention. Flag the M1-014 format discrepancy for that task's review.

---

## Positive Observations

1. **Auto-incrementing ID via MAX query** — simple, correct approach for a single-user SQLite system. No UUID-based ticket IDs that would make the operator's life harder.
2. **Dependencies are correctly identified** — M1-002, M1-006, M1-012, M1-014 form a clean dependency chain. The task doesn't try to do too much.
3. **Sequential ticket numbering AC** — "Given running the command twice, then two distinct ticket files exist (AEOS-1 and AEOS-2)" is a well-written acceptance criterion that catches off-by-one and duplicate ID bugs.
4. **Out of Scope is well-bounded** — correctly defers template injection (M2) and manual editing (operator responsibility).

---

## Verification Notes

- After fixing M1, verify that `listArtifacts()` in M1-013 works correctly with the `tickets/<ID>/` subdirectory structure.
- The ticket markdown template should be verified by running it through the PM agent in M3 — confirm the agent finds `## Definition of Done` and `## Notes` sections.
- Confirm that the git commit for ticket creation is visible via `git -C .aeos log --oneline` and matches the expected format.
- Test the MAX+1 ID generation with a fresh DB (no tickets → AEOS-1) and after deleting the highest-numbered ticket (should still increment, not reuse).

---

## Draft PR Summary

**Scope:** M1-003 task specification document
**Changes needed before implementation:**

- **Step 5:** Change artifact path from `.aeos/<KEY>-<N>-ticket.md` to `.aeos/tickets/<KEY>-<N>/<KEY>-<N>-ticket.md` to match system design Section 3.3.
- **Step 5 template:** Replace with the system design's ticket structure (add `## Definition of Done`, `## Notes`; remove inline metadata `**Column:**`, `**Created:**`).
- **Step 6:** Change initial `subState` from `'BLOCKED'` to `null` (coordinate with M1-006 schema) or add `WAITING` to enum (coordinate with M1-007).
- **Step 7:** Add explicit commit message: `[<KEY>-<N>][TICKET][v1][human][create]`.
- **Dependencies:** Add M1-013 (`artifactPath()`) and use it for path construction.

Please review this summary and confirm it matches the intended changes before updating the task document.
