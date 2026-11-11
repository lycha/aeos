# Task: Gate Records, and Overrides Need a Reason

**Milestone:** I1-M3 — Specify
**Plan package:** 3.4
**Agent:** typescript-pro
**Method:** Agentic implementation, test-first
**Size:** M
**Human-owned inputs:** ⛔ `plugins/artefact-tree-pipeline/schemas/gates.schema.json` (draft in `proposals/`)

## Context
Human decisions at gates are the most valuable data the pipeline produces, and today they are a row in the SQLite `transitions` table on one machine. `aeos ticket move` and `aeos ticket sign-off` override the normal path with no reason asked or kept. The manifesto: "A human can override a blocking reviewer with a written reason. The override is recorded next to the agent's reasoning log." These records are also the future input to the override ledger that decides which gates can earn autonomy.

## What needs to be done
1. **Model and port.** `gate-record.ts` mirroring the approved schema. `gate-record-store.port.ts` with `append(projectPath, record)` and `list(projectPath, { feature?, ticketId? })`.
2. **Adapter.** YAML file, append-only, using the existing `js-yaml` dependency:
   - spec-backed ticket (own pin or parent's): `.aeos/features/<feature>/gates.yaml`
   - otherwise: `.aeos/tickets/<id>/<id>-gates.yaml`
   Ids are `GATE-<n>`, sequential within the file. Commit to the `.aeos` repository after each append.
3. **Who.** `decided_by` is the project repository's git identity. Add `userIdentity(dir)` to `GitGateway`. If none is configured, refuse the gate command with the fix.
4. **Recorder service.** `application/services/gate-recorder.ts` builds the record: gate kind, ticket, columns, verdict, reason, the spec pin, and `evidence` (the review artefact, checks artefact and run records for the column being decided).
5. **Hook every human action:**

   | Command | `gate` | `verdict` |
   |---|---|---|
   | `ticket approve` out of `SPEC_REVIEW` | `spec` | approved |
   | `ticket approve` elsewhere | `column-approval` | approved |
   | `ticket dod-approve` (yes / no) | `definition-of-done` | approved / rejected |
   | `ticket sign-off` | `sign-off-override` | overridden |
   | `ticket move` | `move-override` | overridden |
   | `ticket answer` | `answer` | approved |
   | `ticket resolve` | `escalation-resolution` | approved |
6. **Reasons.** Add `--reason <text>` to `ticket move` and `ticket sign-off`, required, minimum ten characters. `dod-approve` asks for a reason when the answer is no.
7. **Overrides name what they overrode.** For `sign-off-override`, set `overrides` to the run id of the latest reviewer or checks record for that column, if one exists.
8. **Validation.** Every record written validates against the approved schema; test this over the end-to-end run. Add `gates.yaml` to what `lint_decisions.py` validates only if that is a one-line change; otherwise leave the linter alone.
9. **Order of effects.** Write and commit the gate record before changing ticket state. If the record cannot be written, the gate command fails and state is unchanged.

## Acceptance Criteria
- [ ] Given the end-to-end run, when it ends, then every approve, dod-approve, sign-off and move has a matching gate record, each valid against the schema
- [ ] Given `ticket move AEOS-1 QA` with no `--reason`, when run, then it is refused and the ticket does not move
- [ ] Given `ticket sign-off` after a `REJECTED` review, when run with a reason, then the record's `overrides` names that review's run id
- [ ] Given a spec-backed epic, when it is approved out of `SPEC_REVIEW`, then a `spec` gate record is appended to the feature's `gates.yaml` and committed
- [ ] Given no git identity, when a gate command runs, then it is refused with the fix
- [ ] Given a failure writing the record, when a gate command runs, then ticket state is unchanged
- [ ] Given two gate decisions in the same file, when read, then ids are `GATE-1` and `GATE-2` and neither earlier record was modified

## Out of Scope
- The override ledger, earned autonomy, or any report over these records
- Signing or otherwise authenticating records
- The `contract`, `amendment`, `repin` and `pipeline-change` gates. Their tasks add them (I1-M4-004d, I1-M3-005, I1-M4-005c).

## Technical Notes / Hints
- `--reason` on `move` and `sign-off` is a breaking change to the CLI. The proposed CLI contract asks Kris whether it should be required at once or after a deprecation period. Check the approved contract's answer if it exists; if it does not yet, implement "required" and flag it.
- The orchestrator calls approve for `advanceMode: auto` columns. That is not a human decision: record nothing, or the ledger will count machine advances as human approvals.

## Layer Mapping
```
Model:       src/domain/model/gate-record.ts
Ports:       src/domain/ports/driven/gate-record-store.port.ts, git-gateway.port.ts
Adapter:     src/infrastructure/filesystem/fs-gate-record-store.adapter.ts
Application: src/application/services/gate-recorder.ts
             ticket-approve / ticket-dod-approve / ticket-sign-off / ticket-move / ticket-answer / ticket-resolve use cases
CLI:         src/cli/commands/ticket-move.command.ts, ticket-sign-off.command.ts, ticket-dod-approve.command.ts
```

## Dependencies
- I1-M3-001: `features/` under `.aeos/`
- I1-M1-003: run ids to cite as evidence
- ⛔ approved `gates.schema.json`

## Definition of Done
- [ ] Common Definition of Done in `README.md`
