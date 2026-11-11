# Task: Column Roles — Stop Keying on Column Names

**Milestone:** I1-M4 — Prove
**Plan package:** 4.5 (part 1 of 3)
**Agent:** typescript-pro
**Method:** Agentic implementation, test-first
**Size:** M
**Human-owned inputs:** ⛔ the role vocabulary in `aeos-core/templates/pipelines.yaml` (draft in `proposals/pipelines.draft.yaml`)

## Context
Decision D3: column order is configurable. Before order can become data, behaviour has to stop depending on what a column is *called*. Today it does, in exactly these places (main at `0b01fc8`):

| File | Line | What the name decides |
|---|---|---|
| `domain/services/orchestrator-policy.ts` | 79, 164 | `DOD_GATE` is the human gate the scheduler never passes |
| `domain/services/orchestrator-policy.ts` | 186 | `TASK_BREAKDOWN` + `SIGNED_OFF` means "decomposed; drive the children" |
| `application/orchestrator.use-case.ts` | 359 | `DOD_GATE` never auto-advances |
| `application/ticket-approve.use-case.ts` | 50 | an epic cannot leave `TASK_BREAKDOWN` until every child is `DONE` |
| `application/ticket-dod-approve.use-case.ts` | 38, 73 | only a `DOD_GATE` ticket can be dod-approved |
| `application/ticket-run.use-case.ts` | 903 | `DOD_GATE` is not run like other columns |
| `application/ticket-run.use-case.ts` | 1040 | `IMPLEMENTATION` defaults to agentic mode |
| `application/services/context-assembler.ts` | 75, 77 | `CODE_REVIEW` gets the task diff, `INTEGRATION_REVIEW` the epic diff |
| `infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts` | 15–22 | a fixed map from column to spec file name |

This task replaces each with a property the column spec declares. **It changes no behaviour and no order.** It is a refactor with the end-to-end test as its safety net.

## What needs to be done
1. **Spec fields.** Add to `ColumnSpec` and `ColumnSpecSchema`, using the vocabulary Kris approved:
   - `role: 'standard' | 'decomposition' | 'integration' | 'final-gate'` (default `standard`)
   - `diffContext: 'none' | 'task' | 'epic'` (default `none`) — if the approved vocabulary makes `integration` an attribute rather than a role, follow it
   - `executorMode` already exists; make the `IMPLEMENTATION` template state `agentic` explicitly and remove the name-based default at line 1040
2. **Templates.** Declare the role and `diffContext` in every `templates/column-specs/*.yaml` so behaviour is identical:
   `task-breakdown` → `decomposition`; `integration-review` → `integration`, `diffContext: epic`; `dod-gate` → `final-gate`; `code-review` → `diffContext: task`.
3. **Spec lookup.** Replace the fixed file-name map in the loader: load every `*.yaml` in `.aeos/column-specs/` and index by each file's own `column:` field. Two files claiming one column is a load error naming both.
4. **Replace each name check** in the table with a lookup on the column's spec. `domain/` stays pure: pass the roles in as data (for example a `ReadonlyMap<Column, ColumnRole>` on the policy's input), do not import a loader.
5. **Tests.** For each replaced check, add a test with a column whose *name* differs from the default but whose *role* is the same (for example a decomposition column called `SLICING`), and assert identical behaviour.
6. `project sync` reports specs missing the new fields as drifted.

## Acceptance Criteria
- [ ] Given the templates, when the end-to-end test runs, then it passes unchanged
- [ ] Given `src/`, when searched outside `model/column.ts`, tests and smoke tests, then no code compares against `Column.TASK_BREAKDOWN`, `Column.DOD_GATE`, `Column.INTEGRATION_REVIEW`, `Column.CODE_REVIEW` or `Column.IMPLEMENTATION`
- [ ] Given a column spec with `role: decomposition` under a different column identifier, when an epic is signed off there, then the scheduler drives its children
- [ ] Given a column with `role: final-gate`, when the orchestrator reaches it, then it halts for a human regardless of `advanceMode`
- [ ] Given a column with `diffContext: epic`, when its context is assembled, then it contains the epic's `base..HEAD` diff
- [ ] Given two spec files with the same `column:`, when loaded, then loading fails naming both
- [ ] Given `orchestrator-policy.test.ts` and `review-loop-policy.test.ts`, when run, then every existing test still passes without edits to its expectations

## Out of Scope
- Changing the order or the set of columns (I1-M4-005b)
- New roles beyond the approved vocabulary

## Technical Notes / Hints
- `Column.BACKLOG` and `Column.DONE` are structural, not roles. Checks against them stay.
- `orchestrator-policy.ts` is pure and heavily tested. Change its input type first, fix the tests' fixtures, then change the body.
- If you find a name check this table missed, add it to the pull request description.

## Layer Mapping
```
Model:       src/domain/model/column-spec.ts
Domain svc:  src/domain/services/orchestrator-policy.ts
Application: orchestrator / ticket-approve / ticket-dod-approve / ticket-run use cases, services/context-assembler.ts
Spec loader: src/infrastructure/spec-loader/schemas.ts, yaml-column-spec-loader.adapter.ts
Templates:   templates/column-specs/*.yaml
```

## Dependencies
- I1-M3-003 (the rename has landed, so this refactor is done once)
- ⛔ approved role vocabulary

## Definition of Done
- [ ] Common Definition of Done in `README.md`
