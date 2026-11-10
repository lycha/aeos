# Task: Late Gaps Amend the Spec

**Milestone:** I1-M3 — Specify
**Plan package:** 3.5
**Agent:** typescript-pro
**Method:** Agentic implementation, test-first
**Size:** M
**Human-owned inputs:** none, but see Open question

## Context
"A late discovery goes back to the artefact that owns it. A gap found during implementation means amending the decision log or the spec and coming forward again, so the spec always describes what the code does."

Today a preflight question raised at `IMPLEMENTATION` is answered in the ticket's `questions.md`, and `decision-promotion.service.ts` promotes the answer into that ticket's own `decisions.md`. The spec never learns. After a few tickets the spec and the code have drifted, which is the failure spec-first development is known for.

## What needs to be done
1. **Detect.** In `ticket-answer.use-case.ts`, when the ticket is spec-backed (own pin or parent's), each answered blocking question is an amendment.
2. **Write the amendment** to `.aeos/features/<feature>/decisions.yaml` as a new entry with outcome `DECIDED`, `decided_by: human`, the question, the answer as `resolution`, and evidence pointing at the ticket and its `questions.md`. Allocate the next free absence and criterion ids following the file's existing sequence.
3. **Lint and commit.** Run the decisions lint. If it fails, write nothing, leave the ticket `BLOCKED`, and show the linter's output. Otherwise commit to the `.aeos` repository with the convention from `references/artefact-tree.md`: `decide(<feature>): amendment from <ticket>`.
4. **`spec.md` is not edited by the engine.** A new decision usually needs a new or changed acceptance criterion, and writing criteria is `spec-writer`'s job under a person's eye. After the amendment the ticket stays `BLOCKED` with the message: "Decision recorded as <id>. Update spec.md (spec-writer), commit, then run `aeos ticket repin <ticket>`."
5. **New command `aeos ticket repin <id>`.** Preconditions as for `--spec` creation (I1-M3-002a: schema, lint, clean tree). Moves the epic's `spec_commit` to the `.aeos` `HEAD`, appends a `repin` gate record with from and to commits, and sets the ticket `READY`. Repinning an epic repins its tasks, since they resolve the pin through the parent.
6. **Gate record.** The answer itself is recorded as an `amendment` gate (extends the `answer` hook from I1-M3-004).
7. **Tickets with no spec** keep today's behaviour unchanged.
8. **Drift guard.** `ticket run` on a spec-backed ticket refuses to start when an amendment has been written since the pin and no repin has happened. This is the mechanism that makes "comes forward again" unavoidable.

## Acceptance Criteria
- [ ] Given a blocked spec-backed task and an answered question, when `ticket answer` runs, then `decisions.yaml` gains a `DECIDED` entry citing the ticket, the change is committed, and the ticket stays `BLOCKED` with the repin instruction
- [ ] Given an amendment that makes the lint fail, when `ticket answer` runs, then `decisions.yaml` is unchanged and the linter output is shown
- [ ] Given an amended and re-committed spec, when `ticket repin` runs, then the pin moves, a `repin` gate record is written, and the ticket is `READY`
- [ ] Given an amendment with no repin, when `ticket run` is called, then it is refused
- [ ] Given a repinned epic, when a child task's prompt is built, then it contains the amended spec
- [ ] Given a ticket with no spec, when `ticket answer` runs, then behaviour and output are identical to today

## Out of Scope
- Editing `spec.md` or `.feature` files from the engine
- Amendments raised from an escalation (`ticket resolve`). Same idea; do it after this proves out.
- Three-way merges when two tickets amend the same feature at once. Refuse the second and say why.

## Open question (stop and ask)
Does `decisions.schema.json` need a way to mark an entry as an amendment (for example `source: amendment` and the originating ticket)? The schema is human-owned. Read it first; if the existing `evidence` and `question` fields carry it honestly, use them and say so. If a schema change is needed, stop and ask Kris.

## Technical Notes / Hints
- `ticket repin` is a new command. It is in the proposed CLI contract as `proposed`.
- The amendment rate — amendments after implementation started — is one of the manifesto's constraint metrics. It is now countable from gate records. Do not build the report; just make sure each amendment record carries the column the ticket was in.

## Layer Mapping
```
CLI:         src/cli/commands/ticket-repin.command.ts (new), src/cli/index.ts
Ports:       src/domain/ports/driving/ticket-repin.port.ts (new)
Application: src/application/ticket-answer.use-case.ts, ticket-repin.use-case.ts (new), ticket-run.use-case.ts
             src/application/services/decision-promotion.service.ts, gate-recorder.ts
Adapter:     src/infrastructure/spec/decisions-file.adapter.ts (new; YAML read-modify-write preserving comments where possible)
```

## Dependencies
- I1-M3-002b, I1-M3-004

## Definition of Done
- [ ] Common Definition of Done in `README.md`
- [ ] End-to-end test covers: block → answer → amend → repin → run
