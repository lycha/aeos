# Task: The Pipelines File — Column Order as Data

**Milestone:** I1-M4 — Prove
**Plan package:** 4.5 (part 2 of 3)
**Agent:** typescript-pro
**Method:** Agentic implementation, test-first
**Size:** M
**Human-owned inputs:** `aeos-core/templates/pipelines.yaml` (approved in 005a)

## Context
`src/domain/model/column.ts` hard-codes `EPIC_COLUMN_ORDER` and `TASK_COLUMN_ORDER`, and `nextColumnFor(kind, current)` reads them. After I1-M4-005a no behaviour depends on a column's name, so the order can move into a file the project owns.

## What needs to be done
1. **File.** `.aeos/pipelines.yaml`, scaffolded by `project init` from `templates/pipelines.yaml`. One ordered list of column identifiers per ticket kind (`EPIC`, `TASK`).
2. **Loader.** `pipeline-loader.port.ts` + YAML adapter with a Zod schema. A project with no file gets the template's content, so existing projects keep working; `project sync` offers to write it.
3. **Validation at load**, each failure with its own message naming the kind and the column:
   - starts at `BACKLOG`, ends at `DONE`
   - no identifier twice in one pipeline
   - every column except `BACKLOG` and `DONE` has a column spec
   - an `EPIC` pipeline has exactly one `decomposition` column, placed before any `integration` or `final-gate` column
   - at most one `final-gate` per pipeline, and it is the last column before `DONE`
   - a `TASK` pipeline has no `decomposition` or `final-gate` column
4. **Use it.** `columnOrderFor(kind)` and `nextColumnFor(kind, current)` take the loaded pipeline as an argument. Remove `EPIC_COLUMN_ORDER`, `TASK_COLUMN_ORDER` and `COLUMN_ORDER` as exported constants; display order comes from the pipelines too.
5. **Column type.** `Column` stops being a closed union of ten literals. Keep `Column.BACKLOG` and `Column.DONE` as constants; every other identifier is a string validated against the loaded pipelines. `isValidColumn` takes the pipelines. The database already stores columns as text.
6. **Callers.** `ticket approve`, `ticket move`, `ticket list --column`, the orchestrator, the state machine, labels (I1-M3-006) and the terminal display read the pipeline.
7. **Adding or dropping a column.** Because the file lists the columns, a project can add one (write a column spec, list it) or drop one. That falls out of this design and is allowed. New ticket *kinds* are not: the loader rejects any key other than `EPIC` and `TASK`.
8. Protect `.aeos/pipelines.yaml` (it is already in I1-M2-002's default list).
9. Update `aeos-core/README.md` (the state-machine tables are hand-written from the constants) and `CLAUDE.md`.

## Acceptance Criteria
- [ ] Given the template pipelines, when the end-to-end test runs, then it passes unchanged
- [ ] Given `CODE_REVIEW` and `QA` swapped in the `TASK` pipeline of an empty project, when a task is approved out of `IMPLEMENTATION`, then it enters `QA`
- [ ] Given a new column spec `SECURITY_REVIEW` listed after `CODE_REVIEW`, when a task is approved out of `CODE_REVIEW`, then it enters `SECURITY_REVIEW` and can be run there
- [ ] Given an `EPIC` pipeline with no decomposition column, when loaded, then loading fails with that reason
- [ ] Given a pipeline listing a column with no spec, when loaded, then loading fails naming the column
- [ ] Given a pipeline with a key `BUG`, when loaded, then loading fails: new kinds are not supported
- [ ] Given a project with no `pipelines.yaml`, when any command runs, then the template order applies
- [ ] Given `ticket move AEOS-1 NOT_A_COLUMN --reason "…"`, when run, then the error lists the columns of that ticket's pipeline

## Out of Scope
- Changing order while tickets are in flight (I1-M4-005c guards it)
- New ticket kinds
- Per-ticket pipelines

## Technical Notes / Hints
- Loosening `Column` to a string will light up the type checker across the codebase. Let it: each error is a place that assumed the closed set. Do not silence one with a cast.
- `column.test.ts` and `column-pipelines.test.ts` test the constants. Rewrite them against the loader and the template.
- The bug track (I1-M4-003) uses the `TASK` pipeline. Check its two-phase logic still keys on the column's `executorMode`, not its position.

## Layer Mapping
```
Model:       src/domain/model/column.ts
Port:        src/domain/ports/driven/pipeline-loader.port.ts
Adapter:     src/infrastructure/spec-loader/yaml-pipeline-loader.adapter.ts, schemas.ts
Domain svc:  src/domain/services/pipeline-validation.ts (new, pure), state-machine.ts, orchestrator-policy.ts
Application: ticket-approve / ticket-move / ticket-list / orchestrator / project-init / project-sync use cases
Templates:   templates/pipelines.yaml
Docs:        aeos-core/README.md, aeos-core/CLAUDE.md
```

## Dependencies
- I1-M4-005a, I1-M3-006

## Definition of Done
- [ ] Common Definition of Done in `README.md`
