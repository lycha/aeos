# Task: The Bug Track

**Milestone:** I1-M4 — Prove
**Plan package:** 4.3
**Agent:** typescript-pro
**Method:** Agentic implementation, test-first
**Size:** M
**Human-owned inputs:** none

## Context
"Ceremony scales with the change … A bug needs a failing test that reproduces it before any fix." A bug should not travel the epic pipeline. The model already allows a task with no parent (`TASK`: `BACKLOG → IMPLEMENTATION → CODE_REVIEW → QA → DONE`), and I1-M2-003 gives it a branch and a pull request. What is missing is the proof: that a test was red before the fix and green after, and that the fix did not quietly weaken the test.

## What needs to be done
1. **Create.** `aeos ticket create "<title>" --bug [--body-file <path>]` creates a standalone `TASK` flagged as a bug (migration: `track TEXT` on `tickets`, `'bug'` or null). Reject `--bug` with `--parent` or `--spec`.
2. **Two-phase implementation.** For a bug, `IMPLEMENTATION` runs the worker twice inside one attempt:
   - **Phase A — reproduce.** The worker is instructed to add a failing test only and to end its notes with a block naming the command that runs it:
     ```
     <!-- AEOS-REPRO
     command: npx vitest run src/foo.test.ts -t "returns 404 for a missing ticket"
     -->
     ```
     The engine parses the block, runs the command through the checks runner, and requires a **non-zero** exit. Zero means the test does not reproduce the bug: the attempt is rejected with that feedback. The engine then records the SHA-256 of every file the phase added or changed, and commits them as `[<id>][REPRO]`.
   - **Phase B — fix.** The worker is instructed to make the test pass without editing it. Afterwards the engine checks the recorded hashes are unchanged (else the attempt fails: "the reproducing test was modified"), runs the same command and requires exit **zero**.
3. **Then as usual:** the configured checks (I1-M2-001), the reviewer, the gate.
4. **Evidence.** Two run records with `role: checks` capture the red and the green run. Write `<id>-repro.md` with the command, both exit codes and both output tails, committed with the artefact. The pull request body includes it.
5. **Agent templates.** Add the two instructions to `templates/agents/engineer-agent.yaml` as a bug-track section selected by the engine, not a second agent file.
6. **Stub.** Teach the stub the two phases so the end-to-end test can drive a bug: phase A writes a test file that fails, phase B writes the fix.

## Acceptance Criteria
- [ ] Given a bug task, when phase A's test passes immediately, then the attempt is rejected with "the test does not reproduce the bug"
- [ ] Given a red test in phase A and a fix in phase B, when run, then the task proceeds to review with a `repro.md` showing non-zero then zero
- [ ] Given phase B edits the reproducing test, when checked, then the attempt fails naming the file
- [ ] Given phase A with no `AEOS-REPRO` block, when parsed, then the ticket is `ESCALATED`
- [ ] Given `--bug` with `--parent`, when create runs, then it is refused
- [ ] Given a finished bug, when its branch is read, then the `[REPRO]` commit precedes the fix commit
- [ ] Given the end-to-end test, when the bug path runs with the stub, then it reaches `DONE` with a stub pull request URL

## Out of Scope
- A behaviour-change track and a wording track. Same idea; add after this one is proven.
- Bugs that need a contract change. The task stops with a needs-human message saying it is a behaviour change (the contract gate in I1-M4-004d detects the diff).
- Flaky tests. One red run and one green run are the evidence; do not add retries.

## Technical Notes / Hints
- Parse the `AEOS-REPRO` block the way `verdict-parser.ts` parses its trailer: exactly one block, or escalate. Put the parser in `domain/services/`.
- The repro command runs in the project root with the developer's dependencies installed. Do not use a worktree at the repro commit: dependencies would be missing.
- I1-M2-002's protected paths do not cover the reproducing test; the hash check here does that job for the duration of the attempt.
- `--bug` is in the proposed CLI contract.

## Layer Mapping
```
Domain svc:  src/domain/services/repro-parser.ts (new)
Model:       src/domain/model/ticket.ts (track)
Application: src/application/ticket-create.use-case.ts, ticket-run.use-case.ts
CLI:         src/cli/commands/ticket-create.command.ts
Persistence: src/infrastructure/persistence/database.ts, sqlite-ticket.repository.ts
Adapter:     src/infrastructure/executor/stub-executor.adapter.ts
Templates:   templates/agents/engineer-agent.yaml
```

## Dependencies
- I1-M2-001 (checks runner), I1-M2-003 (branch and pull request for standalone tasks)

## Definition of Done
- [ ] Common Definition of Done in `README.md`
