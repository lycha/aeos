# Iteration 1 — AEOS working end to end for one developer

**Goal.** One feature and one bug in this repository travel from intake to a
merged pull request through AEOS, on one machine with one developer, and leave
a conformance report and real cost numbers behind.

**Plan of record.** "AEOS Iteration 1: Implementation Plan" (10 Nov 2026). This
directory turns its 21 packages into 28 agent-ready tasks plus one human-run
checklist. The four largest packages are split so each task yields a diff a
person can review in one sitting.

**Baseline.** `main` at `0b01fc8`. Typecheck clean, 685 tests in 58 files pass.

---

## Read this before any task

Every task assumes you have read `aeos-core/CLAUDE.md`. The rules below are the
ones agents most often break.

1. **Layering.** `cli/ → application/ → domain/ ← infrastructure/`. `domain/`
   imports nothing from Node or npm. New capability = driving port → use case →
   driven port → adapter → wire in `src/cli/container.ts` → command.
2. **ESM.** Relative imports carry the `.js` extension, also from `.ts` files.
3. **Tests first.** Write the failing test, then the code. Tests are colocated
   as `*.test.ts`. `npm run typecheck && npm run lint && npm run build && npm test`
   must be green, in that order, before you say you are done.
4. **Keep the stub alive.** If you change the verdict contract, a word count, a
   column, a template or anything the stub executor plays a part in, update
   `src/infrastructure/executor/stub-executor.adapter.ts` in the same task. The
   end-to-end test from I1-M0-001 is how you find out.
5. **Templates travel with code.** A new column-spec field, column, agent or
   rubric needs its change in `templates/` too, and `template-source.test.ts`
   must still pass.
6. **Migrations.** Append to `MIGRATIONS` in
   `src/infrastructure/persistence/database.ts`. Never edit an existing one.
   Each must be idempotent (guard `ALTER TABLE` with `hasColumn`). Main is at
   version 5. Take the next free number **when you merge**, not when you start:
   M2 and M3 tasks run in parallel and will collide otherwise.
7. **No new runtime dependencies** unless the task names one. Prefer a small
   pure function to a package.
8. **You do not own the contracts.** The files listed under "Human-owned
   inputs" are written or approved by a person. If a task needs one that is not
   yet approved, stop and say so. Never start from a `.draft` file, never edit
   an approved one, and never settle an open question in code: raise it.
9. **One task, one pull request.** Nothing goes straight to `main`.

### Decisions already made (10 Nov 2026)

| # | Decision |
|---|---|
| D1 | The artefact tree lives inside `.aeos/`, which is already its own git repository. Specs, decisions, gate records, run records and the conformance report are committed there beside `tickets/`. SQLite stays authoritative for ticket state. |
| D2 | `plugins/artefact-tree-pipeline/` is the canonical skill and schema set. Root `skills/` is folded into it. |
| D3 | `PRODUCT_SCOPING` is renamed `SPEC_REVIEW`. Column names (a `label`) and column order (a pipelines file) are configurable. Order may change only when every ticket of that kind is in `BACKLOG` or `DONE`. |
| D4 | Pull requests are opened with the `gh` command behind a port. No GitHub API client. |
| D5 | Unknown cost is `null`, never `0`. `--budget` is refused on an executor that cannot report cost. |
| D6 | The definition-of-done approval is the recorded release decision. Merging the pull request stays a human action. |
| — | The API contract of AEOS is its CLI: commands, parameters, required resources, output formats and exit codes. |

### Dogfooding rule

From M1 on, these tasks are built through AEOS itself. **Run the pipeline from
the last tagged build, never from the working tree**, so a broken change cannot
stop you building its fix. Tag after each milestone, and only with the stub
end-to-end test green.

---

## Human-owned inputs

Drafts are in `proposals/`. A task marked ⛔ cannot start until its input is
approved and moved to its final path.

- [ ] `run-record.schema.json` — blocks I1-M1-003
- [ ] `gates.schema.json` — blocks I1-M3-004
- [ ] `conformance.schema.json` — blocks I1-M4-002a
- [ ] `cli-contract.yaml` — blocks I1-M4-004a
- [ ] `pipelines.yaml` and the column role vocabulary — blocks I1-M4-005a

---

## Order of work

M0 → M1 → (M2 ∥ M3) → M4 → M5. Within a milestone, follow the order below
unless a task's Dependencies section says otherwise.

| Task | Plan | Title | Size | Depends on |
|---|---|---|---|---|
| **M0 Harness** | | | | |
| I1-M0-001 | 0.1 | Stub end-to-end test in CI | M | — |
| I1-M0-002 | 0.2 | Packaging hygiene | S | — |
| **M1 Measure** | | | | |
| I1-M1-001 | 1.1 | Parse usage and cost from the Claude executor | S | M0-001 |
| I1-M1-002 | 1.2 | Unknown cost is null; budget refusal | S | M1-001 |
| I1-M1-003 ⛔ | 1.3 | Run records with brief and reasoning log | M | M1-002 |
| I1-M1-004 | 1.4 | A real `aeos costs` | S | M1-002 |
| **M2 Guard** | | | | |
| I1-M2-001 | 2.1 | Checks stage before the reviewer | M | M1-003 |
| I1-M2-002 | 2.2 | Protected paths | M | M0-001 |
| I1-M2-003 | 2.3 | Pull requests and commit trailers | M | M0-001 |
| I1-M2-004 | 2.4 | Spec-fidelity rubric at code review | S | — |
| **M3 Specify** | | | | |
| I1-M3-001 | 3.1 | The artefact tree inside `.aeos/`; one skill set | M | M0-001 |
| I1-M3-002a | 3.2 | Spec pin on the epic | M | M3-001 |
| I1-M3-002b | 3.2 | The pinned spec in every prompt | M | M3-002a |
| I1-M3-003 | 3.3 | Spec review replaces PRD drafting | M | M3-002b |
| I1-M3-004 ⛔ | 3.4 | Gate records; overrides need a reason | M | M3-001 |
| I1-M3-005 | 3.5 | Late gaps amend the spec | M | M3-002b, M3-004 |
| I1-M3-006 | 3.6 | Configurable column names | S | — |
| **M4 Prove** | | | | |
| I1-M4-001 | 4.1 | Criterion tracing | M | M2-001, M3-002b |
| I1-M4-002a ⛔ | 4.2 | Conformance report builder | M | M4-001 |
| I1-M4-002b | 4.2 | Conformance at the definition-of-done gate | M | M4-002a, M3-004 |
| I1-M4-003 | 4.3 | The bug track | M | M2-001, M2-003 |
| I1-M4-004a ⛔ | 4.4 | CLI contract file and verifier | M | M2-001 |
| I1-M4-004b | 4.4 | Generated command registration | L | M4-004a |
| I1-M4-004c | 4.4 | JSON output and exit codes | L | M4-004b |
| I1-M4-004d | 4.4 | Generator hook and the contract gate | M | M4-004b, M2-002, M3-004 |
| I1-M4-005a ⛔ | 4.5 | Column roles | M | M3-003 |
| I1-M4-005b | 4.5 | The pipelines file | M | M4-005a, M3-006 |
| I1-M4-005c | 4.5 | Order-change guard | S | M4-005b, M3-004 |
| **M5 Run on AEOS** | | | | |
| I1-M5-001 | 5 | Proving runs and write-up (human-run) | — | all |

After M2 and again after M3, run one real epic on this repository with a real
executor. The stub proves the wiring; only a real executor proves the behaviour.

---

## Common Definition of Done

Every task, in addition to its own:

- [ ] Failing test written first; all acceptance criteria covered by tests
- [ ] `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` green in that order
- [ ] Stub end-to-end test (I1-M0-001) green
- [ ] Stub executor, templates and `template-source.test.ts` updated where the task touches them
- [ ] `aeos-core/README.md` and `aeos-core/CLAUDE.md` updated where behaviour they describe has changed
- [ ] No file under "Human-owned inputs" edited
- [ ] One pull request, reviewed and approved by a person
