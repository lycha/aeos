# Task: Conformance at the Definition-of-Done Gate

**Milestone:** I1-M4 — Prove
**Plan package:** 4.2 (part 2 of 2)
**Agent:** typescript-pro
**Method:** Agentic implementation, test-first
**Size:** M
**Human-owned inputs:** none (decision D6; schema approved in 002a)

## Context
`templates/column-specs/dod-gate.yaml` opens with: "TODO: DOD_GATE uses human-approval flow (AEOS-20), not agent execution. workerAgentFile and reviewerAgentFile are placeholders". The final human gate is the release decision (D6), and the person making it should be looking at a verdict per criterion, not a prose checklist.

## What needs to be done
1. **Build on entry.** When a spec-backed epic enters the final-gate column, run the builder from I1-M4-002a.
2. **Residual QA.** For criteria still `unverified`, run the QA agent as the column's worker, in a narrowed role: judge only those criteria, against the diff and the spec, and return one verdict each with a short justification. Update `templates/agents/qa-agent.yaml` (or add `conformance-agent.yaml`) with this instruction and a machine-readable output block the engine parses, in the same spirit as the `AEOS-VERDICT` trailer. Each becomes an instrument `{ kind: 'agent', name: <agent>, result, evidence: <run id> }`. An unparseable block escalates; it is never coerced.
3. **Reviewer.** The column's reviewer checks the agent's judgements against `rubrics/dod/dod-evaluation.md`, rewritten to ask: is each agent verdict justified by evidence, and is any deterministic `fail` being argued away?
4. **Replace the placeholders** in `dod-gate.yaml` and remove the TODO.
5. **Show it.** `aeos ticket dod-approve <id>` prints the summary and the table (id, verdict, instruments), then the pull request URL, then asks.
6. **Rules at approval:**
   - any `fail` or `unverified` → approval requires `--reason`; the reason is stored on the gate record
   - a person may vouch for a criterion: `--verified AC-3,AC-7` adds a `{ kind: 'human' }` instrument citing the gate record. Without it, unverified stays unverified.
   - answering no records a `rejected` gate with its reason and leaves the epic in the column
7. **On approval:** write `.aeos/features/<feature>/conformance.yaml` and `.md`, commit them with the `definition-of-done` gate record in one commit, then mark the epic `DONE`.
8. **Pull request.** Fill the conformance placeholder in the pull request body (I1-M2-003): the summary line and the table. Update the existing pull request with `gh pr edit` through the port.
9. **Epics with no spec** cannot exist after I1-M3-003. A standalone task has no final gate; nothing changes for it.

## Acceptance Criteria
- [ ] Given a spec-backed epic entering the final gate with all criteria passing by test, when the column runs, then no agent is invoked and the report shows every criterion `pass`
- [ ] Given two unverified criteria, when the column runs, then the QA agent is asked about exactly those two
- [ ] Given a report with a `fail`, when `dod-approve` is answered yes with no `--reason`, then it is refused
- [ ] Given `--verified AC-3`, when approved, then AC-3 carries a human instrument that cites the gate record
- [ ] Given approval, when the `.aeos` repository is read, then one commit contains `conformance.yaml`, `conformance.md` and the gate record
- [ ] Given the committed `conformance.yaml`, when validated against the schema, then it passes
- [ ] Given an agent output with no parseable verdict block, when the column runs, then the ticket is `ESCALATED`
- [ ] Given `dod-gate.yaml`, when read, then it contains no placeholder agents and no TODO

## Out of Scope
- Feature flags, staged rollout, measuring the success metric. Release here is a recorded decision (D6).
- A conformance report for standalone tasks and bugs. The bug's red-then-green evidence is its proof (I1-M4-003).

## Technical Notes / Hints
- `--reason` and `--verified` are new options on `dod-approve`. Both are in the proposed CLI contract. Follow the approved contract if it differs.
- Keep the builder pure and re-runnable: `dod-approve` rebuilds the report at approval time so it reflects the code commit actually being approved.

## Layer Mapping
```
Application: src/application/ticket-dod-approve.use-case.ts, ticket-run.use-case.ts, services/conformance.service.ts, services/gate-recorder.ts
CLI:         src/cli/commands/ticket-dod-approve.command.ts
Port:        src/domain/ports/driven/pull-request-gateway.port.ts (edit body)
Templates:   templates/column-specs/dod-gate.yaml, templates/agents/qa-agent.yaml, templates/rubrics/dod/dod-evaluation.md
```

## Dependencies
- I1-M4-002a, I1-M3-004, I1-M2-003

## Definition of Done
- [ ] Common Definition of Done in `README.md`
- [ ] End-to-end test ends with a schema-valid `conformance.yaml` committed for the fixture feature
