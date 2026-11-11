# Task: Refuse a Pipeline Change While Tickets Are in Flight

**Milestone:** I1-M4 — Prove
**Plan package:** 4.5 (part 3 of 3)
**Agent:** typescript-pro
**Method:** Agentic implementation, test-first
**Size:** S
**Human-owned inputs:** none (decided 10 Nov 2026)

## Context
After I1-M4-005b a person can edit `.aeos/pipelines.yaml`. If they reorder or remove columns while a ticket sits in the middle of that pipeline, "next column" changes under it, and a ticket can be stranded in a column that no longer exists. Decision: the order of a kind may change only when the pipeline is empty — every ticket of that kind is in `BACKLOG` or `DONE`.

## What needs to be done
1. **Remember the accepted pipeline.** Append a migration creating `pipeline_state (project_id, kind, columns_json, accepted_at)`. On first use, store the current pipeline for each kind.
2. **Compare on every command** that needs the project (hook it into the `project` resource guard or the container, once): load `pipelines.yaml` and compare each kind's column list with the accepted one.
3. **Same** → proceed.
4. **Different, and the pipeline is empty** → accept: store the new list, append a `pipeline-change` gate record (I1-M3-004) with the old and new lists and the git identity, print one line saying the pipeline for that kind changed, proceed.
5. **Different, and any ticket of that kind is in flight** → refuse. The message names every in-flight ticket with its column, and says: finish or move them to `BACKLOG`/`DONE`, or restore the previous order. Print the previous order so restoring is easy.
6. **Read-only commands still work** during a refused change, using the *accepted* pipeline: `ticket list`, `ticket show`, `orchestrator status`, `costs`, `dashboard`. Otherwise a person could not see which tickets are in the way.
7. A label-only change (I1-M3-006) or a role change in a column spec is not a pipeline change and is never refused by this guard.
8. In-flight is defined once, in `domain/`: column is neither `BACKLOG` nor `DONE`.

## Acceptance Criteria
- [ ] Given no in-flight tasks and a reordered `TASK` pipeline, when the next command runs, then the change is accepted and a `pipeline-change` gate record is written
- [ ] Given one task in `CODE_REVIEW` and a reordered `TASK` pipeline, when `ticket run` is called, then it is refused, naming that task and its column
- [ ] Given that refused state, when `ticket list` runs, then it works and shows the accepted order
- [ ] Given that refused state, when the file is restored to the accepted order, then commands work again with no record written
- [ ] Given tasks in flight and a changed `EPIC` pipeline with no epics in flight, when a command runs, then the `EPIC` change is accepted: the guard is per kind
- [ ] Given a changed column label only, when a command runs, then nothing is refused and no gate record is written
- [ ] Given a fresh project, when the first command runs, then the current pipeline is stored without a gate record

## Out of Scope
- Migrating in-flight tickets to a new order. A later iteration may allow mid-flight changes; this one refuses them.
- Watching the file. The comparison happens when a command runs.

## Technical Notes / Hints
- The exit code for a refusal is `needs_human` once I1-M4-004c has landed, with `error.code: PIPELINE_CHANGE_IN_FLIGHT`.
- Keep the comparison cheap: it runs on every command.

## Layer Mapping
```
Domain svc:  src/domain/services/pipeline-change.ts (new, pure: compare + in-flight)
Port:        src/domain/ports/driven/pipeline-state-repository.port.ts
Adapter:     src/infrastructure/persistence/sqlite-pipeline-state.repository.ts, database.ts
Application: src/application/services/pipeline-guard.ts, gate-recorder.ts
CLI:         src/cli/resources.ts or src/cli/container.ts
```

## Dependencies
- I1-M4-005b, I1-M3-004

## Definition of Done
- [ ] Common Definition of Done in `README.md`
