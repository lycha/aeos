# Task: Run Records with the Brief and the Reasoning Log

**Milestone:** I1-M1 — Measure
**Plan package:** 1.3
**Agent:** typescript-pro
**Method:** Agentic implementation, test-first
**Size:** M
**Human-owned inputs:** ⛔ `plugins/artefact-tree-pipeline/schemas/run-record.schema.json` (draft in `proposals/`)

## Context
The manifesto says AEOS "commits the agent's own reasoning output to the git repository, and every artefact an agent produces links back to that reasoning log". Today run events are streamed to the terminal through `TicketRunObserver` and then lost. Nothing is persisted per run. Run records are also the raw material for the cost report, the conformance report and, later, the override ledger.

## What needs to be done
1. **Model.** `src/domain/model/run-record.ts` mirroring the approved schema field for field.
2. **Port and adapter.** `run-record-store.port.ts` with `write(record, { brief, transcript })` and `list(projectPath, ticketId)`. A filesystem adapter writes three files under `.aeos/tickets/<ticket>/runs/`:
   - `<run_id>.json` — the record
   - `<run_id>.brief.md` — the exact prompt the agent received
   - `<run_id>.log` — the raw executor output (`ExecutorSuccess.transcript` from I1-M1-001)
3. **Run ids.** `RUN-<UTC timestamp>-<4 random base36>`. Generate in the application layer; `domain/` may not import `node:crypto`.
4. **Hooks.** In `ticket-run.use-case.ts`, write a record after every executor invocation: preflight, worker (`runAttempt`) and reviewer (`runReview`), on success, failure, interruption and timeout alike. The two `recordCost` call sites mark the places.
5. **Commit.** Add the three files to the same `commitFiles` call that commits the artefact or review, so the artefact and its record land in one commit in the `.aeos` repository. A failed run that produced no artefact commits its record alone.
6. **Link.** After validation and before commit, append `<!-- AEOS-RUN: <run_id> -->` as the last line of the artefact. Confirm `output-validation.ts` and `verdict-parser.ts` are unaffected; the verdict parser must still find exactly one `AEOS-VERDICT`.
7. **Validation.** A test loads the approved JSON Schema and validates every record the end-to-end test produces.
8. `ticket show` lists the run ids for the ticket.

## Acceptance Criteria
- [ ] Given the stub end-to-end run, when it finishes, then every preflight, worker and reviewer invocation has a record, a brief and a log
- [ ] Given any record written by the engine, when validated against the approved schema, then it passes
- [ ] Given an artefact, when read, then its last line names a run id whose record exists
- [ ] Given a worker that fails, when the attempt ends, then a record with `exit: failed` and the error is committed
- [ ] Given a brief file, when hashed, then the SHA-256 equals `brief.sha256` in its record
- [ ] Given an executor that cannot report cost, when recorded, then `cost_usd` is null and `cost_basis` is `unknown`

## Out of Scope
- Checks and generator records. I1-M2-001 and I1-M4-004d add those roles.
- Any reader beyond `ticket show`. Evaluation tooling is a later iteration.
- Redaction. Briefs and logs may contain source code; `.aeos/` has no remote by default. Note this in the README.

## Technical Notes / Hints
- `claude-cli-executor.adapter.ts` already has `redactArgsForDiagnostics`. Do not log API keys or environment into the transcript.
- Logs can be large. Do not load them back into memory in `list`.
- `spec_pin` stays `null` until I1-M3-002a.

## Layer Mapping
```
Domain model: src/domain/model/run-record.ts
Domain port:  src/domain/ports/driven/run-record-store.port.ts
Adapter:      src/infrastructure/filesystem/fs-run-record-store.adapter.ts
Application:  src/application/ticket-run.use-case.ts, services/preflight.ts, ticket-show.use-case.ts
Wiring:       src/cli/container.ts
```

## Dependencies
- I1-M1-001: `transcript` on the executor result
- I1-M1-002: nullable cost
- ⛔ approved `run-record.schema.json`

## Definition of Done
- [ ] Common Definition of Done in `README.md`
- [ ] Schema validation test runs over the end-to-end output
