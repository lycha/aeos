# AEOS — AI-Engineered Operating System

> The thinking behind AEOS is in the [wiki](https://github.com/lycha/aeos/wiki): the [manifesto](https://github.com/lycha/aeos/wiki/AI-Driven-Development-A-Manifesto), the [Twelve Principles](https://github.com/lycha/aeos/wiki/Twelve-Principles-of-AI%E2%80%90Driven-Development) and the [Laws Behind the Principles](https://github.com/lycha/aeos/wiki/Laws-Behind-the-Principles).

An AI-assisted development pipeline that takes a ticket from idea to code review using specialised LLM agents. Each pipeline column has a dedicated agent, a reviewer with rubrics, and a human approval gate. AEOS dogfoods itself — it was built using its own pipeline.

## Requirements

- **Node.js 22+** (LTS)
- **At least one supported executor CLI on `$PATH`**
  - `claude` — [install](https://docs.anthropic.com/en/docs/claude-code/getting-started)
  - `auggie` — [install](https://docs.augmentcode.com/cli/reference)
  - `opencode` — [install](https://opencode.ai/docs/cli/)
  - `ollama` — [install](https://docs.ollama.com/cli)
- **GitHub CLI (`gh`)**, authenticated, and a git remote — for the pull requests AEOS opens. Not needed with `"pullRequests": { "enabled": false }` (see [Branches and pull requests](#branches-and-pull-requests)).
- **Python 3 with `PyYAML` and `jsonschema`** — only for `aeos ticket create --spec`, which runs `lint_decisions.py` (see [Spec-backed epics](#spec-backed-epics)).
- macOS or Linux

## Install

```bash
# From source (the npm package is `@lycha/aeos`; the command it installs is `aeos`)
git clone https://github.com/lycha/aeos.git
cd aeos/aeos-core
npm install
npm run build
npm link

# First-time setup
aeos install
```

## Quick Start

```bash
# 1. Initialise a project — scaffolds .aeos/ with a working pipeline:
#    column specs, agent specs, and reviewer rubrics
aeos project init --name "My Project" --key MYPRJ

# 2. Write the spec (a person does this; see "Spec-backed epics"), commit it
#    in .aeos/, and create an epic from it
aeos ticket create "Add user authentication" --spec user-authentication

# 3. Edit the ticket description
$EDITOR .aeos/MYPRJ-1-ticket.md

# 4. Run the current column (agent executes → reviewer evaluates)
aeos ticket run MYPRJ-1

# Optional: override executor/model for a single run
aeos ticket run MYPRJ-1 --executor opencode-cli --model ollama/qwen2.5-coder:14b

# 5. Approve to advance to the next column
aeos ticket approve MYPRJ-1

# Optional: move a ticket directly to any workflow status
aeos ticket move MYPRJ-1 QA --reason "Built by hand; skipping to QA."

# 6. Repeat steps 4–5 for each column, then final approval
aeos ticket dod-approve MYPRJ-1
```

## How It Works

A ticket is either an **epic** or a **task**, and each follows its own pipeline.

```
EPIC   BACKLOG → SPEC_REVIEW → TECH_SPEC → TASK_BREAKDOWN ──→ INTEGRATION_REVIEW → DOD_GATE → DONE
                 Spec Reviewer     Architect    Architect          Integration Reviewer  Human
                 ↓                 ↓            ↓                    ↓                      ▲
                 spec-review.md    Tech Spec    tasks.md            integration-review.md  │
                 ↓                 ↓            ↓                    ↓                      │
                 Reviewer          Reviewer     Reviewer            Reviewer               │
                                                │                   (whole-feature diff    │
                                   fans out into child tasks         vs spec/tech spec)    │
                                                             all children DONE ────────────┘
                                                ▼                           │
TASK   BACKLOG → IMPLEMENTATION → CODE_REVIEW → QA → DONE ───────────────────┘
                 Engineer          Engineer      QA
                 ↓                 ↓             ↓
                 Code + Summary    Code Review   Report
                 ↓                 ↓             ↓
                 Reviewer          Reviewer      Reviewer
```

An epic starts from a spec a person wrote. `SPEC_REVIEW` does not draft
requirements: an agent reads the pinned spec and reports gaps, ambiguities,
contradictions and untestable criteria in `spec-review.md`, each finding citing
the `AC-n`, `INV-n` or decision id it concerns. Approving the epic out of
`SPEC_REVIEW` is the **spec gate**. The epic is then specced technically and
decomposed — it never implements anything itself.
Its child tasks do that, and the epic cannot leave `TASK_BREAKDOWN` until every
child reaches `DONE`. It then runs `INTEGRATION_REVIEW`, which reviews the whole
assembled feature (the epic branch's `base..HEAD` diff) against the pinned spec
and tech spec — the check per-task review cannot make — before the human `DOD_GATE`.

Each column follows the same cycle:

1. **Pre-flight** — agent checks for blocking questions; if found, ticket is `BLOCKED` until answered via `aeos ticket answer`
2. **Agent run** — specialised worker agent executes the current column. Most columns produce a markdown artifact; `IMPLEMENTATION` can run in agentic mode and modify the repository directly, then emit a concise implementation summary.
3. **Validation** — rule-based structural checks (for example non-empty output, required sections, and column-specific constraints). Agentic `IMPLEMENTATION` runs must also leave a real repo diff.
4. **Checks** — on columns with `runChecks: true` (`IMPLEMENTATION` and `INTEGRATION_REVIEW` in the templates), the project's own commands (typecheck, lint, tests) run before any reviewer. See [Checks](#checks).
5. **Review** — a reviewer agent (on a _different model_ from the worker) evaluates against column-specific rubrics and emits a machine-readable verdict: `APPROVED`, `APPROVED_WITH_WARNINGS`, or `REJECTED`. Only `BLOCKER` findings gate; warnings are recorded on the artifact and do not block.
6. **Revision loop** — a `REJECTED` review, or a failed check, sends the artifact back to the worker with the review or the check's output attached, up to the configured cap. See [Review Loop](#review-loop).
7. **Sign-off** — if review passes, ticket is set to `SIGNED_OFF`
8. **Human gate** — operator can advance normally (`aeos ticket approve`) or override to any status (`aeos ticket move --reason`). Either way the decision is written to the gate records (see [Gate records](#gate-records))

## What `project init` creates

```
.aeos/
├── project.json          project identity and optional executor defaults
├── CONSTRAINTS.md         placeholder for your architecture/style/security rules
├── pipelines.yaml         the column order of each ticket kind (see Pipelines)
├── column-specs/          one YAML per pipeline column
├── agents/                worker and reviewer agent specs
├── rubrics/               reviewer rubrics and artifact templates
├── schemas/               artefact schemas and lint_decisions.py, with a .source stamp
├── features/              one directory per feature: its human-written spec
└── contexts/              one directory per bounded context: glossary, constraints
```

`.aeos/` is the project's **artefact tree**: its own git repository, ignored by the
code repository, so the specification keeps a history separate from the code. To keep
the tree elsewhere, set `"artefactTree"` in `project.json` to a path relative to the
project root. `schemas/` is a seeded copy of `plugins/artefact-tree-pipeline/schemas/`;
do not edit it. `aeos project sync` reports a stale or hand-edited copy and only
overwrites it with `--force`.

Everything under `column-specs/`, `agents/`, and `rubrics/` is scaffolded from the
templates shipped with AEOS and is **yours to edit** — changing pipeline behaviour
usually means editing this YAML, not TypeScript.

`project init` commits what it wrote in `.aeos` (`[<KEY>][INIT] scaffold`), so the
protected-path check guards the scaffold from the first run on. If git refuses the commit
(no identity, usually), it fails and says how to set one; run it again afterwards.

Re-running `aeos project init` is the repair path: it restores anything missing and
never overwrites a file you have edited. It commits what is then uncommitted in `.aeos`,
your own uncommitted edits there included, as `ticket create` does.

### Column names

A column has an **identifier** (`TECH_SPEC`), which is fixed: it is what the database,
the transition log, gate records and run records store. What you see is its **label**,
which you can change:

```yaml
# .aeos/column-specs/tech-spec.yaml
column: TECH_SPEC
label: Shaping
```

```json
// .aeos/project.json: BACKLOG and DONE have no column spec
{ "labels": { "BACKLOG": "Inbox", "DONE": "Shipped" } }
```

With no label a column shows its identifier in sentence case (`SPEC_REVIEW` → `Spec review`).
`ticket list`, `ticket show`, `ticket move`, `ticket approve`, `ticket run`, the orchestrator
and `aeos costs` show labels; `ticket show` also prints the identifier
(`Column: Shaping (TECH_SPEC)`). `ticket move <id> <status>` and `ticket list --column`
accept an identifier or a label, in any case; an identifier wins if both match.

Labels are checked whenever a column spec is loaded: unique within the project whatever
the case, not empty, at most 40 characters, and not the identifier of another column. A
clash fails the command and names both files. Renaming a column changes nothing that is
stored. Column **order** is not configurable yet.

### Column roles

What a column *does* comes from its spec, never from what it is called. Each file in `.aeos/column-specs/` declares:

```yaml
column: TASK_BREAKDOWN      # the identifier this file is the spec of
role: decomposition
diffContext: none
executorMode: agentic
```

| `role` | What it makes the column |
| --- | --- |
| `standard` (default) | worker → checks → reviewer → gate |
| `spec-review` | approving out of it is recorded as the `spec` gate |
| `decomposition` | the epic waits here while the orchestrator drives its child tasks, and cannot leave until every child is `DONE`; its reviewer is told which criteria no task claims |
| `integration` | criteria are traced before the worker runs; approving an epic out of it opens the pull request |
| `final-gate` | `ticket run` builds the conformance report; approval is `ticket dod-approve`; the orchestrator runs the column, then halts here whatever `advanceMode` says |

`diffContext` is the diff the column's agents are given: `none` (default), `task` (the working tree of one task, for its code review; that column's review is the one a task's pull request cites) or `epic` (the epic's `base..HEAD`). `executorMode` is `artifact` unless the spec says `agentic`; no column is agentic because of its name.

A spec is found by its `column:` field, not by its file name: every `*.yaml` in `column-specs/` is read. Two files that declare the same column are an error naming both, and no column loads until one is removed.

The vocabulary is the approved one in `templates/pipelines.yaml`.

### Pipelines

The order of the columns is the project's own: `.aeos/pipelines.yaml`, which `project init` writes from the template, lists the columns of each ticket kind (`EPIC`, `TASK`) in order. `ticket approve`, `ticket move`, `ticket list --column`, the orchestrator and the labels all read it. To reorder columns, reorder the list. To add a column, write its column spec (`column: SECURITY_REVIEW`, …) and list it; to drop one, remove it from the list. A project with no `pipelines.yaml` gets the template order, and `aeos project sync --apply` writes the file.

The file is checked every time it is loaded, and a command that needs it fails with every reason:

- every pipeline starts at `BACKLOG` and ends at `DONE`
- a column appears at most once in a pipeline
- every column listed (other than `BACKLOG` and `DONE`) has a column spec in `.aeos/column-specs/`
- an `EPIC` pipeline has exactly one `spec-review` column, before the `decomposition` column
- an `EPIC` pipeline has exactly one `decomposition` column, before any `integration` or `final-gate` column
- an `EPIC` pipeline has exactly one `final-gate` column, and it is the last before `DONE`. Column specs scaffolded before roles existed declare none, so such a project is refused until `aeos project sync --force` brings them up to the templates
- a `TASK` pipeline has no `spec-review`, `decomposition` or `final-gate` column
- only the kinds `EPIC` and `TASK` exist; any other key is refused

`ticket move` takes a column of that ticket's own pipeline; anything else is refused with the list. The file is a protected path: an agentic run may not edit it.

**The order of a kind may change only while none of its tickets is in flight**, that is, while every ticket of that kind is in `BACKLOG` or `DONE`. AEOS remembers the pipeline it last accepted for each kind and compares the file with it whenever a `ticket` or `orchestrator` command runs:

- unchanged: nothing happens. A changed label or role is not a change of order.
- changed, and no ticket of that kind is in flight: the change is accepted, one line says so, and a `pipeline-change` gate record with the old and new order is committed to `.aeos/tickets/pipelines/pipelines-gates.yaml` under your git identity.
- changed, with tickets in flight: the command is refused. The message names each ticket and its column and prints the previous order. Finish those tickets, move them to `BACKLOG` or `DONE`, or restore the order.

`EPIC` and `TASK` are judged separately. While a change is refused, `ticket list`, `ticket show`, `orchestrator status` and `costs` still work, with the accepted order.

A project scaffolded before roles has specs without these fields. `aeos project sync` reports each as `drifted` (and `pipelines.yaml` as `missing`). Take the change: a spec with no `role` is `standard`, so until you do, the spec gate is recorded as an ordinary approval, the epic join and the criterion trace do not run, the final gate is not treated as one, and reviews are given no diff.

## Ticket State Machine

Each ticket stores exactly two workflow fields:

- **Column** — where the ticket is in the pipeline
- **Sub-state** — what is happening inside that column right now

Think of the state machine as `column + sub-state`.

### Columns

The forward order depends on the ticket's kind, and is the project's `.aeos/pipelines.yaml` (see [Pipelines](#pipelines)). As scaffolded:

| Kind   | Pipeline                                                                   |
| ------ | -------------------------------------------------------------------------- |
| `EPIC` | `BACKLOG → SPEC_REVIEW → TECH_SPEC → TASK_BREAKDOWN → INTEGRATION_REVIEW → DOD_GATE → DONE` |
| `TASK` | `BACKLOG → IMPLEMENTATION → CODE_REVIEW → QA → DONE`                       |

`aeos ticket approve` uses the kind to pick the next column, so a task never
visits `SPEC_REVIEW` and an epic never visits `IMPLEMENTATION`.

### Sub-states

AEOS currently supports these sub-states:

- `READY` — queued in the current column and ready to run
- `BLOCKED` — pre-flight found open questions; answer them with `aeos ticket answer`
- `WORKING` — the worker is actively executing the column
- `INTERRUPTED` — work was deliberately stopped before completion
- `FAILED` — execution, validation, or review failed
- `IN_REVIEW` — output exists and is being reviewed
- `ESCALATED` — stopped cleanly and needs a human decision (**not** a failure)
- `SIGNED_OFF` — the column passed review and is waiting for a human gate

`FAILED` and `ESCALATED` are deliberately distinct. `FAILED` means something broke — the
executor crashed, validation rejected the output. `ESCALATED` means the pipeline worked
correctly and reached a point only a human can resolve: preflight raised blocking questions,
the revision loop hit its cap, successive attempts stopped converging, or the reviewer
produced no parseable verdict. Keeping them apart is what lets you answer "why did this
stall?" from the transition log.

### Normal lifecycle inside an active column

For any non-terminal working column, the typical path is:

`READY → BLOCKED/WORKING → IN_REVIEW → SIGNED_OFF`

With possible detours to:

- `BLOCKED` when pre-flight needs human answers
- `FAILED` when execution, validation, or review fails
- `INTERRUPTED` when work is stopped intentionally

After a human approves the ticket with `aeos ticket approve <id>`, it moves to the next column and is reset to `READY`.

### Valid stored combinations

The normal persisted combinations are:

Every non-terminal column allows the same set:

`READY`, `BLOCKED`, `WORKING`, `INTERRUPTED`, `FAILED`, `ESCALATED`, `IN_REVIEW`, `SIGNED_OFF`

| Column            | Kind | Allowed sub-state values |
| ----------------- | ---- | ------------------------ |
| `BACKLOG`         | both | `null` only              |
| `SPEC_REVIEW`     | epic | all eight                |
| `TECH_SPEC`       | epic | all eight                |
| `TASK_BREAKDOWN`  | epic | all eight                |
| `IMPLEMENTATION`  | task | all eight                |
| `CODE_REVIEW`     | task | all eight                |
| `QA`              | task | all eight                |
| `INTEGRATION_REVIEW` | epic | all eight             |
| `DOD_GATE`        | epic | all eight                |
| `DONE`            | both | `null` only              |

In other words:

- `BACKLOG` tickets have no sub-state yet
- in-flight columns always have a non-null sub-state
- `DONE` is terminal and normally has no active sub-state

### Human/manual controls

Operators can deliberately override the normal path:

- `aeos ticket ready <id>` sets any non-`BACKLOG`, non-`DONE` ticket to `READY`
- `aeos ticket sign-off <id> --reason <text>` manually marks any non-`BACKLOG`, non-`DONE` ticket as `SIGNED_OFF`
- `aeos ticket move <id> <status> --reason <text>` moves a ticket to any column of its own pipeline; non-terminal targets are reset to `READY`, while `BACKLOG` and `DONE` use `null`

So the domain state machine is intentionally permissive for operator control, while the normal workflow policy is enforced by the higher-level ticket commands.

### Gate records

Every human decision at a gate is appended, as a structured record, to a YAML file in the `.aeos` repository and committed there, **before** the ticket changes state. If the record cannot be written, the command fails and the ticket stays where it was.

| Command | `gate` | `verdict` |
| --- | --- | --- |
| `ticket approve` out of the `spec-review` column (`SPEC_REVIEW`) | `spec` | `approved` |
| `ticket approve` anywhere else | `column-approval` | `approved` |
| `ticket dod-approve` (yes / no) | `definition-of-done` | `approved` / `rejected` |
| `ticket sign-off` | `sign-off-override` | `overridden` |
| `ticket move` | `move-override` | `overridden` |
| `ticket answer` | `answer` | `approved` |
| `ticket answer` on a spec-backed ticket | `amendment` | `approved` |
| `ticket repin` | `repin` | `approved` |
| a changed `pipelines.yaml`, accepted on the next command | `pipeline-change` | `approved` |
| `ticket resolve` | `escalation-resolution` | `approved` |

- **Late answers amend the spec.** On a spec-backed ticket, `ticket answer` writes each answered question into `.aeos/features/<feature>/decisions.yaml` as a `DECIDED` entry (`NEW-<n>`, becoming the next `AC-<n>`, citing the ticket and its questions file), runs the decisions lint, and commits `decide(<feature>): amendment from <ticket>`. If the lint fails, nothing is written and the ticket stays `BLOCKED`. Otherwise the ticket also stays `BLOCKED`: add the criterion to `spec.md` (the `spec-writer` skill), commit, then run `aeos ticket repin <ticket>`. That re-checks the feature as `--spec` does, moves the epic's pin to the `.aeos` `HEAD` (its tasks follow), and sets the ticket `READY`. Until then `ticket run` refuses every ticket pinned to that spec, and a second amendment is refused. The `amendment` record carries the column the ticket was in; the `repin` record's reason names both commits. A ticket with no spec is unblocked as before.
- **Where.** A spec-backed ticket (its own pin or its epic's): `.aeos/features/<feature>/gates.yaml`. Any other ticket: `.aeos/tickets/<id>/<id>-gates.yaml`. Ids are `GATE-1`, `GATE-2`, … within a file; records are appended and never rewritten. The format is `schemas/gates.schema.json`.
- **Who.** `decided_by` is `user.name <user.email>` of the project repository. With neither configured, the command is refused and tells you to set them.
- **Why.** `ticket move` and `ticket sign-off` require `--reason <text>`, at least ten characters. `ticket dod-approve` asks for one when the answer is no, and requires `--reason` on a yes while any criterion is failed or unverified. Existing scripts that call `move` or `sign-off` without `--reason` now fail.
- **What was overridden.** A `sign-off-override` names, in `overrides`, the run id of the latest review or checks verdict of that column.
- **Evidence.** Each record cites the review, the checks table and the run records of the column decided, and the spec pin in force.

When the orchestrator advances an `advanceMode: auto` column, no person decided, and nothing is recorded.

## Executors

AEOS supports multiple executor backends. The effective executor for a run is resolved in this order:

1. `aeos ticket run --executor/--model` overrides
2. the project default in `.aeos/project.json`
3. the agent spec default in `.aeos/agents/*.yaml`
4. the built-in fallback

### Supported executor types

| Executor       | Typical use                              | Agentic `IMPLEMENTATION` support |
| -------------- | ---------------------------------------- | -------------------------------- |
| `claude-cli`   | Default cloud coding workflow            | Yes                              |
| `auggie-cli`   | Augment/Auggie coding workflow           | Yes                              |
| `opencode-cli` | Local-model or alternative agent runtime | Yes                              |
| `ollama-cli`   | Simple local artifact generation         | No — artifact-only               |
| `stub`         | Tests / local dry runs                   | Yes (test stub only)             |

### Checks

Checks run first, review agents second. List the project's checks in `.aeos/project.json`; they run in the order written, so put the fastest first:

```json
{
  "checks": [
    { "name": "typecheck", "command": "npm run typecheck", "timeoutSeconds": 120 },
    { "name": "lint", "command": "npm run lint", "timeoutSeconds": 120 },
    { "name": "test", "command": "npm test", "timeoutSeconds": 600 }
  ]
}
```

A column runs them when its spec says `runChecks: true`. They run in the project root after validation and before the artifact is committed, and stop at the first failure. A command passes on exit code 0; one that exceeds its timeout is killed and counts as failed.

- **All pass** — `<ticket>-checks.md` (name, result, duration) is committed with the artifact and is part of the reviewer's context.
- **One fails** — the reviewer is not invoked. The failure counts as a rejection toward `maxIterations`, and the next worker attempt receives the last 200 lines of the check's output as `previous-checks.md`. The same check failing twice in a row escalates as not converging; a ticket whose checks never pass ends `ESCALATED`, not `FAILED`, even on a column whose escalation policy is `mark_done`.

Each checks stage leaves a run record with `role: checks`. With no `checks` list, or on a column without `runChecks`, nothing changes. An invalid `checks` list is an error, never silently "no checks".

### Criterion tracing

Every acceptance criterion of a spec (`**AC-12**`, or `**AC-12a**` / `**AC-12b**` where one decision made two) has to be claimed by a task and named by a test or a scenario. A task claims criteria when it is created: `aeos ticket create "<title>" --parent <epic> --implements AC-1,AC-2`. The claim is stored on the ticket, shown in its document, and written as an `Implements: AC-1, AC-2` trailer on the task's commit. A task that claims criteria is briefed with the scenarios tagged with them and no others.

When a spec-backed epic runs `INTEGRATION_REVIEW`, a built-in check traces the pinned spec **before any agent runs**. It needs no model and no configuration. It fails when a criterion is claimed by no task, when a criterion is named by no instrument, or when a task claims an id the spec does not contain. Instruments are `@AC-n` tags above a scenario in the pinned `.feature` files, and `AC-n` in a test title (`it`, `test`, `describe`) or an `@AC-n` comment in the committed test files. Which files count as tests is `criteria.testGlobs` in `.aeos/project.json`:

```json
{ "criteria": { "testGlobs": ["src/**/*.test.ts", "src/**/*.test.tsx", "tests/**/*"] } }
```

(that list is the default). The report is committed to the epic's ticket directory as `<epic>-criteria-trace.md` and `.json`, with a run record (`role: checks`, `executor: in-process`). Numbered non-goals are listed in it and never block.

A failure sets the epic `ESCALATED` (`PRE_WORKER_CHECK_FAILED`) with the report as the artifact to read. No worker or reviewer is invoked and no attempt is used: an unclaimed criterion needs a new task or a spec amendment, which is a person's call. Fix it, then `aeos ticket resolve <epic>` and run again. The reviewer of `TASK_BREAKDOWN` is given the unclaimed list too, so a breakdown that leaves a criterion unowned is rejected early. Whether a tagged test passes is not checked here. An epic with no spec is not traced.

### Conformance report

The engine can build a verdict per criterion from deterministic sources: the criteria trace, and the results of the project's own test run. Say how to get those results in `.aeos/project.json`:

```json
{
  "criteria": {
    "testReport": {
      "command": "npx vitest run --reporter=json --outputFile=.aeos/tmp/test-report.json",
      "path": ".aeos/tmp/test-report.json",
      "format": "vitest-json"
    }
  }
}
```

`vitest-json` is the only format read today. The command runs like a check (a red suite is a result, not an error) and the report is read from `path`. A test is an instrument of a criterion when its full name contains the id, or when its file carries an `@AC-n` comment; a tagged scenario is one when the test run reports a result whose name contains the scenario's name. A skipped test is not an instrument. The verdict is `fail` if any instrument failed, `pass` if at least one passed and none failed, and `unverified` when nothing answered. The report follows `schemas/conformance.schema.json` and is serialised as YAML and as a Markdown table. With no `testReport` configured every criterion is `unverified`.

`aeos project init` writes `.aeos/.gitignore` with `tmp/`, so the test report is never committed to the `.aeos` repository; an existing `.gitignore` is left alone (add `tmp/` yourself in a project initialised earlier).

#### At the definition-of-done gate

`DOD_GATE` is the release decision, and the person making it is shown a verdict per criterion.

1. **`aeos ticket run <epic>` at the gate** builds the report and writes it to `.aeos/tickets/<epic>/<epic>-conformance.md`. If every criterion already has a verdict, no agent runs and the epic is `SIGNED_OFF`. Otherwise the `conformance-agent` is asked about exactly the unverified criteria (they are listed under "To judge") and judges each against the pinned spec and the epic's `base..HEAD` diff. It ends its artifact (`<epic>-dod-verification.md`) with one block, which is all the engine reads:

   ```
   <!-- AEOS-CONFORMANCE
   AC-3: pass | The diff stores the name in the session (src/session.ts:41).
   AC-7: fail | Nothing in the diff reads the stored name back.
   -->
   ```

   A missing or duplicated block, a line that is not `AC-n: pass|fail | justification`, or a set of ids other than the ones asked about ends the run `ESCALATED`; nothing is guessed. The reviewer then checks the judgements against `rubrics/dod/dod-evaluation.md`: is each verdict justified by evidence, and is any deterministic `fail` being argued away?
2. **`aeos ticket dod-approve <epic>`** rebuilds the report (so it describes the commit being approved), adds the agent's verdicts from a signed-off run as `agent` instruments citing the run record, prints the summary and the table, then the pull request URL, then asks.
   - Any `fail` or `unverified` left: a yes needs `--reason "<why>"`, stored on the gate record.
   - `--verified AC-3,AC-7`: you vouch for those criteria. Each gains a `human` instrument naming you and citing the gate record. A criterion with a failed instrument stays `fail` all the same.
   - A no is recorded as a `rejected` gate with its reason, and the epic stays at the gate.
3. **On a yes**, `.aeos/features/<feature>/conformance.yaml` and `conformance.md` are committed in the same commit as the `definition-of-done` gate record, the epic becomes `DONE`, and the conformance section of the pull request is filled with the summary and the table (`gh pr edit`). If the pull request cannot be updated the approval stands and a warning is printed.

The orchestrator does step 1 for a spec-backed epic: it runs the column when the epic arrives at `DOD_GATE`, then halts with `HUMAN_GATE`. It never approves, and a column that has already been run is not run again. Approving without running it is allowed: the criteria no test answered are then `unverified`, and the approval needs a reason.

An existing project needs the new templates: `aeos project sync` reports `agents/conformance-agent.yaml` as missing and `column-specs/dod-gate.yaml` and `rubrics/dod/dod-evaluation.md` as drifted.

### The CLI contract

The API of AEOS is its command line. `cli-contract.yaml`, at the package root, describes it: every command with its arguments, options and flags, the resources it needs, its output shapes and exit codes, and the environment variables the CLI reads. The file is human-owned: agents build to it and may not change it (it is a protected path), and its header is the reference for its format.

```bash
npm run verify:contract   # lint the contract, then compare the built CLI with it
npm run generate:cli      # regenerate src/cli/generated/ and the command reference from the contract
npm run verify:generated  # fail if either differs from what the contract generates
```

Command registration is generated from the contract, not written by hand: `scripts/generate-cli.mjs` writes `src/cli/generated/` (the Commander tree, the argument and option types of every command, each command's required resources, the environment table) and the command reference under [Commands](#commands) and in `skills/aeos/SKILL.md`. Never edit generated code; it is a protected path, and CI fails when it is stale. What is hand-written is one handler per command in `src/cli/commands/` and the resource guards in `src/cli/resources.ts`. A handler prints nothing: it returns a result (exit code, `data`, error, warnings, and the text a person reads), and the generated registration writes it, as text or as the `--json` envelope (see [Output and exit codes](#output-and-exit-codes)). Before a handler runs, each parameter is checked against its schema in the contract (exit `2`), then each resource its command requires, and the first one missing stops the command with the contract's description and fix (exit `4`). The types of every command's `data` are generated from the contract's JSON Schemas, so a handler that returns another shape does not compile. Help text is the contract's current wording; a `pending` rewording shows once the contract makes it current. An item the contract marks `proposed` is not generated.

The check fails when a command, argument, option, flag, summary or description differs between the two, or when an `AEOS_*` variable is read and not declared (or declared and never read). What the contract marks `proposed` and the CLI does not have yet is listed as pending, not as an error; what it marks `proposed` or `pending` and the CLI already has is listed as landed, for a person to update the markers. Output is checked in `npm test` rather than by this command, because the JSON Schema validator is a dev dependency: every output schema must be valid JSON Schema, and every command is run under the stub with `--json` and held to the envelope, to the exit codes its `responses` declare, and to the `data` schema of the code it exited with (`src/e2e/contract-output.e2e.test.ts`).

### Protected paths

An agent must not be able to weaken what it is judged against. Around every executor invocation (preflight, worker and reviewer, artifact and agentic) AEOS compares the changed files of the project repository and of `.aeos/` (its own repository) before and after. If the run changed a protected path, the path is restored (a tracked file is checked out, a new file is deleted), the run record carries the violation in `error`, and the attempt ends `FAILED`, not `ESCALATED`: the agent broke a rule.

Always protected, whatever the configuration says:

```
.aeos/project.json        .aeos/rubrics/**         .aeos/schemas/**
.aeos/pipelines.yaml      .aeos/column-specs/**    .aeos/features/**
.aeos/CONSTRAINTS.md      .aeos/agents/**          .aeos/contexts/**
.aeos/tickets/*/runs/**   **/cli-contract.yaml     src/cli/generated/**
```

Add project paths with `protectedPaths` in `.aeos/project.json`; the list can only add to the defaults:

```json
{ "protectedPaths": ["db/migrations/**"] }
```

Globs are relative to the project root: `*` matches within one path segment, `**` any number of segments. Detection is a diff after the run, so it works for every executor; it does not stop the write or any read. Two limits: a protected file that already had uncommitted changes before the run is not checked (commit `.aeos/` edits before running), and two runs in the same project at the same time can be blamed for each other's writes.

### Generators and the contract gate

Two more lists in `.aeos/project.json`, both the operator's to write:

```json
{
  "generators": [
    { "name": "cli", "command": "npm run generate:cli",
      "inputs": ["cli-contract.yaml"], "outputs": ["src/cli/generated/**"] }
  ],
  "contracts": ["src/infrastructure/persistence/database.ts"]
}
```

**Generators.** Before the worker of a column with `executorMode: agentic` that requires a repository diff (so not `TASK_BREAKDOWN`, whose spec says `requiresRepoDiff: false`), AEOS hashes the files each generator's `inputs` match. When the hash differs from the one of its last run in this working copy (`.aeos/tmp/generators.json`), the command runs in the project root (ten-minute limit), what it wrote under `outputs` is committed as `[<ticket>][GENERATED] <name>`, and the worker starts on a scaffold that already matches the contract. A generator that fails fails the attempt with its output, and the worker never runs. Every invocation leaves a run record (`role: generator`, `executor: shell`, `cost_basis: none`). Every generator's `outputs` are protected paths for the run. Files a generator writes outside its `outputs` are not committed by the engine.

**Contracts.** `contracts` are the paths a person must approve a change to; generator `inputs` are contracts without being listed. A contract path is not a protected path: a ticket may change one, and its diff is the proposal. When a worker's run changes one (the same before/after comparison as protected paths, which still win: a path on both lists is restored and the attempt fails), the run continues to review and the ticket is marked with the paths, which `aeos ticket show` prints. Then:

- `aeos ticket approve <id>` is refused (exit `3`, `CONTRACT_APPROVAL_REQUIRED`) and prints the paths and their diff.
- `aeos ticket approve <id> --contract` writes a `contract` gate record naming the paths, then approves as usual. One approval covers the ticket's later columns; a later run that changes another contract path asks again.
- The orchestrator never passes `--contract`: an auto-advancing column halts `NEEDS_HUMAN` on such a ticket.
- A bug (`ticket create --bug`) whose fix touches a contract path ends `ESCALATED` (`CONTRACT_CHANGE`): "this fix changes a contract; it is a behaviour change, not a bug fix". Sign it off and approve it with `--contract`, or re-file it.
- The pull request body lists the contract paths the ticket and its tasks changed.

### Project-level executor defaults

You can set a project-level default executor and model in `.aeos/project.json`:

```json
{
  "id": "my-project",
  "name": "My Project",
  "key": "MYPRJ",
  "path": "/path/to/project",
  "created_at": "2026-04-20T00:00:00.000Z",
  "executor": {
    "type": "opencode-cli",
    "model": "ollama/qwen2.5-coder:14b"
  }
}
```

### Per-run overrides

```bash
aeos ticket run MYPRJ-1 --executor claude-cli
aeos ticket run MYPRJ-1 --executor auggie-cli --model auggie-pro
aeos ticket run MYPRJ-1 --executor opencode-cli --model ollama/qwen2.5-coder:14b
```

Notes:

- `IMPLEMENTATION` is agentic. It can edit repo files and must leave a git diff.
- `ollama-cli` is currently artifact-only, so it is rejected for agentic `IMPLEMENTATION` runs.
- `aeos ticket show <id>` now displays recorded execution history (column, agent, executor, model).

## Commands

The reference below is generated from `cli-contract.yaml` (`npm run generate:cli`), so it cannot drift from the CLI. `aeos dashboard` is in the contract and not built yet.

### Output and exit codes

Every command takes `--json`. With it, stdout carries exactly one JSON object, the contract's envelope, and nothing else; progress, warnings and questions go to stderr, and `ticket run` and `orchestrator run` draw no live view but write each run event to stderr as one JSON object per line.

```json
{
  "ok": false,
  "command": "ticket run",
  "exit": 3,
  "contractVersion": 1,
  "data": { "ticketId": "AEOS-4", "column": "CODE_REVIEW", "subState": "ESCALATED", "attempts": 5, "artifactPath": null, "reviewPath": null, "runIds": ["RUN-…"], "costUsd": 1.42, "escalation": { "reason": "ITERATIONS_EXHAUSTED", "message": "…", "attempt": 5 } },
  "error": { "code": "ITERATIONS_EXHAUSTED", "message": "…", "resource": null },
  "warnings": []
}
```

`data` has the shape the contract declares for the command and the exit code (on a non-zero code it may be `null`). `error.code` is stable: the CLI's own codes are one enum in `src/cli/error-codes.ts`, and an escalated ticket run or a halted orchestrator run reports the engine's escalation or halt reason. `error.resource` is set exactly when the exit code is `4`. `warnings` carries what did not stop the command, each with a code, such as `COST_UNKNOWN` for a run whose cost could not be read (`costUsd` is then `null`, never `0`).

The exit code tells a script what happened ([vocabulary](#exit-code-vocabulary)): `0` done, `1` something broke, `2` invalid arguments or options, `3` the pipeline worked and needs a person, `4` a required resource is missing, `130` interrupted. `escalation is not failure` holds at the shell too: a ticket run that ends `ESCALATED` or `BLOCKED` exits `3`, as does an orchestrator run that halts for anything but `COMPLETE`, `FAILED` or an interrupt, a pipeline change refused while tickets are in flight, and `ticket dod-approve` without `--reason` when a criterion is failed or unverified.

Parameter values are checked against the contract before anything runs (an executor name, a `--key`, a date, a budget above zero): a bad one exits `2` with `error.code` `INVALID_ARGUMENT`, naming the parameter.

**Questions.** Three commands can ask one, always on stderr. When stdin is not a terminal none does: `ticket answer` and `ticket resolve` exit `2` unless `--yes` is given (at a terminal `--yes` skips the question), and `ticket dod-approve` exits `3` with `CONFIRMATION_REQUIRED`, records nothing and has no `--yes`, because the release decision is a person's.

### Breaking changes

For anyone scripting on "non-zero means failed, and it is always `1`":

- **Exit codes mean something now.** `3` is not a failure. A wrapper that loops while the exit code is `0` should stop cleanly on `3` and treat only `1` as broken. `orchestrator run` used to exit `0` on `HUMAN_GATE` and `AWAITING_APPROVAL` and `1` on the other early halts; all of them are `3` now. `ticket run` used to exit `0` on a block and `1` on an escalation; both are `3`, and an interrupted run is `130`.
- **Usage errors exit `2`**, including Commander's own (a missing argument, an unknown option), which used to exit `1`. An unknown `ticket list --column`, an invalid ticket id, `--body` with `--body-file` and a reason shorter than ten characters are usage errors too.
- **A missing resource exits `4`** (no project, no `aeos install`, an unknown `costs --project`), not `1`.
- **`ticket approve` on a ticket that is already done exits `1`** (`ALREADY_DONE`); it used to print the same line and exit `0`. Declining the confirmation of `ticket answer` or `ticket resolve` exits `0`, as it always did: nothing went wrong and nothing changed (`data` is `{ ticketId, declined: true }`).
- **Questions are on stderr**, and so is the conformance report `ticket dod-approve` shows before asking. Without a terminal no command waits on stdin any more (see above).
- **An epic pipeline with no `final-gate` column is refused.** A project whose column specs were scaffolded before roles existed fails every `ticket` and `orchestrator` command that changes state until `aeos project sync --force` updates them (each overwritten file is backed up to `<file>.bak`).
- **`orchestrator run` runs the final gate before halting `HUMAN_GATE`.** It used to halt on arrival and leave `aeos ticket run <epic>` to a person; a budget now also covers that column's agents, so it is refused when one of them does not report cost. A gate run that escalates or fails halts `NEEDS_HUMAN` or `FAILED`, not `HUMAN_GATE`.
- **An epic with no spec cannot leave `BACKLOG`.** `ticket approve` exits `1` and says to create a new epic with `--spec` and close the old one with `ticket move`. Tasks and bugs are unaffected.
- **Stub mode pushes nothing.** Under `AEOS_EXECUTOR=stub`, approving used to push `aeos/<id>` to `origin` when the repository had a remote; it no longer does.
- **`project init` commits the scaffold in `.aeos`** and exits `1` when git refuses the commit (no identity). It used to leave the scaffold uncommitted until the first `ticket create`.
- **Two error messages are reworded**: an executor that is not one of the four, and a `--key` that is not 2–4 uppercase letters, are now reported by the generated parameter check (`--executor must be one of …, got 'x'.`). All other text output is what it was.

<!-- BEGIN GENERATED CLI REFERENCE -->
<!-- Generated from cli-contract.yaml by `npm run generate:cli`. Do not edit between the markers. -->

### `aeos install [options]`

One-time global setup

| Parameter | Description |
| --- | --- |
| `--json` | Write one JSON envelope to stdout instead of text |

Requires: nothing.

Exit codes:

- `0` The AEOS home exists and the database is migrated.
- `1` Something broke. envelope.error says what.
- `2` Invalid arguments or options. Nothing was attempted.
- `3` Stopped for a person before the command ran, e.g. the pipelines file changed while tickets are in flight (error.code PIPELINE_CHANGE_IN_FLIGHT).

### `aeos project init [options]`

Initialise a project in the current directory

| Parameter | Description |
| --- | --- |
| `--name <name>` | Project name (defaults to directory name) |
| `--key <key>` | Ticket prefix key (2–4 uppercase letters) |
| `--json` | Write one JSON envelope to stdout instead of text |

Requires: `aeos_home`.

Exit codes:

- `0` The project is scaffolded.
- `1` Something broke. envelope.error says what.
- `2` Invalid arguments or options. Nothing was attempted.
- `3` Stopped for a person before the command ran, e.g. the pipelines file changed while tickets are in flight (error.code PIPELINE_CHANGE_IN_FLIGHT).
- `4` A resource in `requires` is not in place. envelope.error.resource names it.

### `aeos project sync [options]`

Reconcile this project's column specs, agents, and rubrics with the current templates

| Parameter | Description |
| --- | --- |
| `--apply` | Write files that are missing from the project |
| `--force` | Also overwrite drifted files (each backed up to <file>.bak). Implies --apply |
| `--diff` | Show a line diff for each drifted file |
| `--json` | Write one JSON envelope to stdout instead of text |

Requires: `project`.

Exit codes:

- `0` The comparison ran. Drift alone is not a failure.
- `1` Something broke. envelope.error says what.
- `2` Invalid arguments or options. Nothing was attempted.
- `3` Stopped for a person before the command ran, e.g. the pipelines file changed while tickets are in flight (error.code PIPELINE_CHANGE_IN_FLIGHT).
- `4` A resource in `requires` is not in place. envelope.error.resource names it.

### `aeos ticket create [options] <title>`

Create a new ticket (an epic by default, or a task with --parent)

| Parameter | Description |
| --- | --- |
| `<title>` | Ticket title |
| `--parent <epicId>` | Create this ticket as a task under the given epic, skipping scoping and spec |
| `--key <taskKey>` | Stable decomposition key (e.g. T-001); idempotency matches on it instead of the title |
| `--body <markdown>` | Markdown description for the ticket (e.g. a task breakdown block). Prefer --body-file for multi-line content |
| `--body-file <path>` | Read the ticket description from a file (robust for multi-line markdown) |
| `--spec <feature>` | Back this epic with the spec at .aeos/features/<feature>. Refused unless the decisions lint is clean |
| `--bug` | Create a standalone bug task that must show a reproducing test red, then green |
| `--implements <ids>` | Acceptance criteria this task claims, comma-separated (e.g. AC-1,AC-2) |
| `--json` | Write one JSON envelope to stdout instead of text |

Requires: `project`, `state_db`. Also `python` when: --spec is given. The decisions lint runs before the epic is created.

Exit codes:

- `0` The ticket exists. Under a parent the command is idempotent, so it may have existed already.
- `1` Something broke. envelope.error says what.
- `2` Invalid arguments or options. Nothing was attempted.
- `3` Stopped for a person before the command ran, e.g. the pipelines file changed while tickets are in flight (error.code PIPELINE_CHANGE_IN_FLIGHT).
- `4` A resource in `requires` is not in place. envelope.error.resource names it.

### `aeos ticket list [options]`

List all tickets in the current project

| Parameter | Description |
| --- | --- |
| `--column <column>` | Filter by pipeline column (identifier or label) |
| `--json` | Write one JSON envelope to stdout instead of text |

Requires: `project`, `state_db`.

Exit codes:

- `0` The tickets, possibly none.
- `1` Something broke. envelope.error says what.
- `2` Invalid arguments or options. Nothing was attempted.
- `3` Stopped for a person before the command ran, e.g. the pipelines file changed while tickets are in flight (error.code PIPELINE_CHANGE_IN_FLIGHT).
- `4` A resource in `requires` is not in place. envelope.error.resource names it.

### `aeos ticket show [options] <id>`

Show details of a single ticket

| Parameter | Description |
| --- | --- |
| `<id>` | Ticket ID (e.g. AEOS-1) |
| `--json` | Write one JSON envelope to stdout instead of text |

Requires: `project`, `state_db`.

Exit codes:

- `0` The ticket.
- `1` Something broke. envelope.error says what.
- `2` Invalid arguments or options. Nothing was attempted.
- `3` Stopped for a person before the command ran, e.g. the pipelines file changed while tickets are in flight (error.code PIPELINE_CHANGE_IN_FLIGHT).
- `4` A resource in `requires` is not in place. envelope.error.resource names it.

### `aeos ticket answer [options] <id>`

Unblock a BLOCKED ticket after answering preflight questions

| Parameter | Description |
| --- | --- |
| `<id>` | Ticket ID (e.g. AEOS-1) |
| `--yes` | Answer yes to this command's confirmation |
| `--json` | Write one JSON envelope to stdout instead of text |

Requires: `project`, `state_db`.

Exit codes:

- `0` The ticket is unblocked and its answers are promoted to decisions. Or the person declined the confirmation, and nothing changed.
- `1` Something broke. envelope.error says what.
- `2` Invalid arguments or options. Nothing was attempted.
- `3` Stopped for a person before the command ran, e.g. the pipelines file changed while tickets are in flight (error.code PIPELINE_CHANGE_IN_FLIGHT).
- `4` A resource in `requires` is not in place. envelope.error.resource names it.

### `aeos ticket resolve [options] <id>`

Resume an ESCALATED ticket after writing a decision in its escalation.md

| Parameter | Description |
| --- | --- |
| `<id>` | Ticket ID (e.g. AEOS-1) |
| `--yes` | Answer yes to this command's confirmation |
| `--json` | Write one JSON envelope to stdout instead of text |

Requires: `project`, `state_db`.

Exit codes:

- `0` The ticket can be run again. Or the person declined the confirmation, and nothing changed.
- `1` Something broke. envelope.error says what.
- `2` Invalid arguments or options. Nothing was attempted.
- `3` Stopped for a person before the command ran, e.g. the pipelines file changed while tickets are in flight (error.code PIPELINE_CHANGE_IN_FLIGHT).
- `4` A resource in `requires` is not in place. envelope.error.resource names it.

### `aeos ticket run [options] <id>`

Run the full column cycle for a ticket (preflight → executor → checks → review → sign-off)

| Parameter | Description |
| --- | --- |
| `<id>` | Ticket ID (e.g. AEOS-1) |
| `--executor <type>` | Override executor type (claude-cli, auggie-cli, opencode-cli, ollama-cli) |
| `--model <model>` | Override model identifier |
| `--json` | Write one JSON envelope to stdout instead of text |

Requires: `project`, `state_db`, `executor`.

Exit codes:

- `0` The ticket ended SIGNED_OFF.
- `1` The ticket ended FAILED, or the run broke before it had a result.
- `2` Invalid arguments or options. Nothing was attempted.
- `3` The ticket ended ESCALATED or BLOCKED. data.escalation says why and where to look.
- `4` A resource in `requires` is not in place. envelope.error.resource names it.
- `130` Interrupted. The ticket is left INTERRUPTED.

### `aeos ticket approve [options] <id>`

Advance a SIGNED_OFF ticket to the next pipeline column

| Parameter | Description |
| --- | --- |
| `<id>` | Ticket ID (e.g. AEOS-1) |
| `--contract` | Also approve the contract or schema change this ticket carries |
| `--json` | Write one JSON envelope to stdout instead of text |

Requires: `project`, `state_db`, `git_repo`. Also `gh` when: This approval opens a pull request and pullRequests.enabled is true.

Exit codes:

- `0` The ticket moved to the next column and the approval is recorded as a gate.
- `1` Something broke. envelope.error says what.
- `2` Invalid arguments or options. Nothing was attempted.
- `3` A gate refused the approval, e.g. the ticket carries a contract change and --contract was not given.
- `4` A resource in `requires` is not in place. envelope.error.resource names it.

### `aeos ticket sign-off [options] <id>`

Manually set a ticket sub-state to SIGNED_OFF

| Parameter | Description |
| --- | --- |
| `<id>` | Ticket ID (e.g. AEOS-1) |
| `--reason <text>` (required) | Why the review is being overridden. Recorded as a gate |
| `--json` | Write one JSON envelope to stdout instead of text |

Requires: `project`, `state_db`.

Exit codes:

- `0` The ticket is SIGNED_OFF and the override is recorded as a gate.
- `1` Something broke. envelope.error says what.
- `2` Invalid arguments or options. Nothing was attempted.
- `3` Stopped for a person before the command ran, e.g. the pipelines file changed while tickets are in flight (error.code PIPELINE_CHANGE_IN_FLIGHT).
- `4` A resource in `requires` is not in place. envelope.error.resource names it.

### `aeos ticket move [options] <id> <status>`

Move a ticket to any workflow status

| Parameter | Description |
| --- | --- |
| `<id>` | Ticket ID (e.g. AEOS-1) |
| `<status>` | Target column (identifier or label) |
| `--reason <text>` (required) | Why the normal path is being bypassed. Recorded as a gate |
| `--json` | Write one JSON envelope to stdout instead of text |

Requires: `project`, `state_db`.

Exit codes:

- `0` The ticket moved and the override is recorded as a gate.
- `1` Something broke. envelope.error says what.
- `2` Invalid arguments or options. Nothing was attempted.
- `3` Stopped for a person before the command ran, e.g. the pipelines file changed while tickets are in flight (error.code PIPELINE_CHANGE_IN_FLIGHT).
- `4` A resource in `requires` is not in place. envelope.error.resource names it.

### `aeos ticket ready [options] <id>`

Set a ticket sub-state to READY

| Parameter | Description |
| --- | --- |
| `<id>` | Ticket ID (e.g. AEOS-1) |
| `--json` | Write one JSON envelope to stdout instead of text |

Requires: `project`, `state_db`.

Exit codes:

- `0` The ticket is READY.
- `1` Something broke. envelope.error says what.
- `2` Invalid arguments or options. Nothing was attempted.
- `3` Stopped for a person before the command ran, e.g. the pipelines file changed while tickets are in flight (error.code PIPELINE_CHANGE_IN_FLIGHT).
- `4` A resource in `requires` is not in place. envelope.error.resource names it.

### `aeos ticket dod-approve [options] <id>`

Review the conformance report and approve a final-gate ticket as DONE

| Parameter | Description |
| --- | --- |
| `<id>` | Ticket ID (e.g. AEOS-1) |
| `--reason <text>` | Required when any criterion is failed or unverified |
| `--verified <ids>` | Criteria a person vouches for, comma-separated (e.g. AC-3,AC-7). Each gains a human instrument citing the gate record |
| `--json` | Write one JSON envelope to stdout instead of text |

Requires: `project`, `state_db`, `git_repo`.

Exit codes:

- `0` The decision is recorded as a gate. `approved` is false when the person answered no; the ticket then stays where it is.
- `1` Something broke. envelope.error says what.
- `2` Invalid arguments or options. Nothing was attempted.
- `3` Refused. A criterion is failed or unverified and --reason was not given, or stdin is not a terminal.
- `4` A resource in `requires` is not in place. envelope.error.resource names it.

### `aeos ticket repin [options] <id>`

Move a spec-backed ticket's pin to the current spec after an amendment

| Parameter | Description |
| --- | --- |
| `<id>` | Ticket ID (e.g. AEOS-1) |
| `--json` | Write one JSON envelope to stdout instead of text |

Requires: `project`, `state_db`, `python`.

Exit codes:

- `0` The pin moved and the repin is recorded as a gate.
- `1` Something broke. envelope.error says what.
- `2` Invalid arguments or options. Nothing was attempted.
- `3` Stopped for a person before the command ran, e.g. the pipelines file changed while tickets are in flight (error.code PIPELINE_CHANGE_IN_FLIGHT).
- `4` A resource in `requires` is not in place. envelope.error.resource names it.

### `aeos orchestrator run [options] <epicId>`

Run an epic until it completes, needs a human, or hits its budget

| Parameter | Description |
| --- | --- |
| `<epicId>` | Epic ticket ID |
| `--budget <usd>` | USD ceiling for this epic (persisted for later runs). Refused on an executor that cannot report cost |
| `--max-steps <n>` | Safety bound on scheduled actions |
| `--json` | Write one JSON envelope to stdout instead of text |

Requires: `project`, `state_db`, `git_repo`, `executor`.

Exit codes:

- `0` Halted COMPLETE.
- `1` Halted FAILED, or the run broke before it had a result.
- `2` Invalid arguments or options. Nothing was attempted.
- `3` Halted NEEDS_HUMAN, HUMAN_GATE, AWAITING_APPROVAL, AWAITING_DECOMPOSITION, BUDGET_EXCEEDED or COST_UNKNOWN.
- `4` A resource in `requires` is not in place. envelope.error.resource names it.
- `130` Halted INTERRUPTED.

### `aeos orchestrator pause [options] <epicId>`

Stop scheduling new work for an epic (in-flight runs finish)

| Parameter | Description |
| --- | --- |
| `<epicId>` | Epic ticket ID |
| `--json` | Write one JSON envelope to stdout instead of text |

Requires: `project`, `state_db`.

Exit codes:

- `0` The epic is paused.
- `1` Something broke. envelope.error says what.
- `2` Invalid arguments or options. Nothing was attempted.
- `3` Stopped for a person before the command ran, e.g. the pipelines file changed while tickets are in flight (error.code PIPELINE_CHANGE_IN_FLIGHT).
- `4` A resource in `requires` is not in place. envelope.error.resource names it.

### `aeos orchestrator resume [options] <epicId>`

Allow an epic to be scheduled again

| Parameter | Description |
| --- | --- |
| `<epicId>` | Epic ticket ID |
| `--json` | Write one JSON envelope to stdout instead of text |

Requires: `project`, `state_db`.

Exit codes:

- `0` The epic can be scheduled.
- `1` Something broke. envelope.error says what.
- `2` Invalid arguments or options. Nothing was attempted.
- `3` Stopped for a person before the command ran, e.g. the pipelines file changed while tickets are in flight (error.code PIPELINE_CHANGE_IN_FLIGHT).
- `4` A resource in `requires` is not in place. envelope.error.resource names it.

### `aeos orchestrator clear-budget [options] <epicId>`

Remove the budget ceiling from an epic

| Parameter | Description |
| --- | --- |
| `<epicId>` | Epic ticket ID |
| `--json` | Write one JSON envelope to stdout instead of text |

Requires: `project`, `state_db`.

Exit codes:

- `0` The epic has no budget ceiling.
- `1` Something broke. envelope.error says what.
- `2` Invalid arguments or options. Nothing was attempted.
- `3` Stopped for a person before the command ran, e.g. the pipelines file changed while tickets are in flight (error.code PIPELINE_CHANGE_IN_FLIGHT).
- `4` A resource in `requires` is not in place. envelope.error.resource names it.

### `aeos orchestrator status [options] [epicId]`

Show orchestrator state for one epic or all of them

| Parameter | Description |
| --- | --- |
| `[epicId]` | Epic ticket ID |
| `--json` | Write one JSON envelope to stdout instead of text |

Requires: `project`, `state_db`.

Exit codes:

- `0` One entry per epic, possibly none.
- `1` Something broke. envelope.error says what.
- `2` Invalid arguments or options. Nothing was attempted.
- `3` Stopped for a person before the command ran, e.g. the pipelines file changed while tickets are in flight (error.code PIPELINE_CHANGE_IN_FLIGHT).
- `4` A resource in `requires` is not in place. envelope.error.resource names it.

### `aeos costs [options]`

Report model spend

| Parameter | Description |
| --- | --- |
| `--project <key>` | Limit to one project |
| `--epic <id>` | One epic and its child tasks |
| `--ticket <id>` | One ticket |
| `--since <date>` | Records from this date on (YYYY-MM-DD) |
| `--json` | Write one JSON envelope to stdout instead of text |

Requires: `state_db`.

Exit codes:

- `0` The spend that matches, possibly none. totalUsd covers known costs; unknownRecords counts the rest.
- `1` Something broke. envelope.error says what.
- `2` Invalid arguments or options. Nothing was attempted.
- `3` Stopped for a person before the command ran, e.g. the pipelines file changed while tickets are in flight (error.code PIPELINE_CHANGE_IN_FLIGHT).
- `4` A resource in `requires` is not in place. envelope.error.resource names it.

### Resources

| Resource | What must be in place | Fix |
| --- | --- | --- |
| `aeos_home` | The AEOS home directory exists (AEOS_HOME, default ~/.aeos). | Run `aeos install`. |
| `project` | An initialised project. `.aeos/project.json` is found from the working directory upward. | Run `aeos project init` in the project root. |
| `state_db` | The state database at <AEOS_HOME>/state.db can be opened and migrated. | Run `aeos install`, or check AEOS_HOME. |
| `git_repo` | The project root is inside a git work tree. | Run `git init`, or run the command from the repository. |
| `executor` | The executor CLI resolved for this run is on PATH. | Install the executor, or choose another with --executor. |
| `python` | python3 is on PATH (needed by lint_decisions.py). | Install Python 3. |
| `gh` | The `gh` command is on PATH and authenticated for this repository. | Install GitHub CLI and run `gh auth login`. |

### Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `AEOS_HOME` | `~/.aeos` | Directory holding state.db and global configuration. |
| `AEOS_EXECUTOR` | unset | Set to `stub` to run every agent with the offline stub executor. No model is called and nothing is spent. |
| `AEOS_GIT_ISOLATION` | unset | Set to `none` to stop the orchestrator isolating an epic's work on its own branch. |

### Exit-code vocabulary

| Code | Name | Meaning |
| --- | --- | --- |
| 0 | success | The command did what was asked. |
| 1 | failure | Something broke: executor crash, validation rejection, unexpected error. |
| 2 | usage | Invalid arguments or options. Nothing was attempted. |
| 3 | needs_human | The pipeline worked and stopped for a person: escalated, blocked, awaiting approval, a gate, budget exceeded. |
| 4 | missing_resource | A required resource is not in place. Nothing was attempted. |
| 130 | interrupted | The operator interrupted the run. |
<!-- END GENERATED CLI REFERENCE -->

## Epics and Tasks

A ticket created without a parent is an **epic**, and it must be backed by a
spec (`--spec`, see [Spec-backed epics](#spec-backed-epics)). It carries that spec through
spec review, tech spec, and decomposition, and its `TASK_BREAKDOWN` artifact (`tasks.md`)
lists the atomic tasks that will implement it.

```bash
# 1. An epic
aeos ticket create "Add user authentication" --spec user-authentication   # → AEOS-1 (EPIC)

# 2. Run it through spec review, tech spec, and breakdown
aeos ticket approve AEOS-1 && aeos ticket run AEOS-1   # spec-review.md
aeos ticket approve AEOS-1 && aeos ticket run AEOS-1   # tech spec
aeos ticket approve AEOS-1 && aeos ticket run AEOS-1   # tasks.md

# 3. Create the tasks the breakdown identified
aeos ticket create "Add password hashing" --parent AEOS-1   # → AEOS-2 (TASK)
aeos ticket create "Add session middleware" --parent AEOS-1 # → AEOS-3 (TASK)

# 4. Each task runs its own build pipeline, on the epic's branch
aeos ticket approve AEOS-2 && aeos ticket run AEOS-2   # implementation; switches to aeos/AEOS-1
...

# 5. Only once every task is DONE can the epic advance
aeos ticket approve AEOS-1                             # → INTEGRATION_REVIEW
aeos ticket run AEOS-1                                 # reviews the whole feature vs spec/tech spec
aeos ticket approve AEOS-1                             # → DOD_GATE, and opens the pull request
aeos ticket run AEOS-1                                 # builds the conformance report; an agent judges what no test answered
aeos ticket dod-approve AEOS-1                         # shows a verdict per criterion, then asks
```

Nesting is one level deep: tasks hang off epics, and a task cannot itself have
children. Attempting to advance an epic out of `TASK_BREAKDOWN` while any child
is unfinished reports which tasks are outstanding and refuses the transition.

> Creating child tickets from `tasks.md` is a manual step today. Automating that
> decomposition belongs with the orchestrator, which owns scheduling.

## The bug track

A bug does not travel the epic pipeline. It needs a failing test that reproduces it before any fix, and proof that the fix did not weaken that test.

```bash
aeos ticket create "Returns 500 for a missing ticket" --bug [--body-file bug.md]   # → AEOS-7 (TASK, standalone)
aeos ticket approve AEOS-7 && aeos ticket run AEOS-7                               # implementation, in two phases
```

`--bug` creates a standalone task (no parent, no spec; it is refused with `--parent` or `--spec`) that goes through the task pipeline on its own `aeos/<id>` branch and ends in a pull request, like any standalone task. Its `IMPLEMENTATION` runs the worker twice inside one attempt:

1. **Reproduce.** The worker adds a failing test and nothing else, and ends its notes with the command that runs it:

   ```
   <!-- AEOS-REPRO
   command: npx vitest run src/foo.test.ts -t "returns 404 for a missing ticket"
   -->
   ```

   AEOS runs that command in the project root and requires a **non-zero** exit. Zero means the test does not reproduce the bug: the attempt is rejected with that feedback and the phase is retried. No block, or more than one, ends the run `ESCALATED` (`UNPARSEABLE_REPRO`). Then AEOS records the SHA-256 of every file the phase added or changed and commits them to the project repository as `[<id>][REPRO] …`.
2. **Fix.** The worker is told the command and the files it must not edit. Afterwards AEOS compares the hashes: a changed file fails the attempt ("The reproducing test was modified", naming it) and is restored. Then the same command must exit **zero**; if it does not, the output goes back to the worker like a failed check.

Then the column continues as usual: the project's checks, the reviewer, the gate. Once reproduced, a bug is not reproduced again: a retry, or a later `ticket run`, is the fix alone.

**Evidence.** Each of the two runs of the command is a run record (`role: checks`). `<id>-repro.md` in the ticket directory shows the command, both exit codes and both output tails; it is committed with the implementation notes and included in the pull request body. On the branch the `[REPRO]` commit precedes the fix.

The two instructions are the `bugTrack.reproduce` and `bugTrack.fix` sections of `agents/engineer-agent.yaml`; the engine uses one in place of `taskInstruction`. A project scaffolded earlier sees that file as drifted in `aeos project sync`, and a bug is refused until its agent has them. Flaky tests are not handled: one red run and one green run are the evidence.

## Spec-backed epics

An epic is always created from a human-written spec in the artefact tree and pinned to the exact revision of it. `aeos ticket create` without `--spec` (and without `--parent`) is refused. The spec is a person's work; the skills in `plugins/artefact-tree-pipeline/` help write it: `prototype-harvest`, `gap-interrogation-solo` or `gap-interrogation-capture`, then `spec-writer`.

```bash
aeos ticket create "Checkout flow" --spec checkout     # reads .aeos/features/checkout/
```

The epic is refused, with the reason, unless all of this holds, checked in this order:

1. `.aeos/features/<feature>/` exists and contains `spec.md` and `decisions.yaml`.
2. `decisions.yaml` matches `.aeos/schemas/decisions.schema.json`.
3. `.aeos/schemas/lint_decisions.py` exits clean. It needs `feature-inventory.yaml` in the feature too.
4. No decision, conflict or question has the outcome `ESCALATED`.
5. The feature directory has no uncommitted changes in the `.aeos` repository.

Steps 2 and 3 are one run of the linter, which needs `python3` with the `PyYAML` and `jsonschema` modules; a missing one is named in the error. `--spec` cannot be combined with `--parent`.

The pin is the triple `{ repo, commit, path }`: `<project key>-aeos`, the `HEAD` of the `.aeos` repository at creation, and `features/<feature>`. A task has no pin of its own; it uses its epic's. `aeos ticket show` prints the pin for both, and warns `spec has moved since this epic was pinned` once the feature has later commits (gate records, which live in the same directory, do not count). The pin is also written to every run record (`spec_pin`), to the pull request body, and to each task commit as a `Spec:` trailer.

Every prompt for a spec-backed epic and for its tasks (preflight, worker and reviewer) opens its context with a `## Specification (pinned <repo>@<commit>)` section: `spec.md`, `decisions.yaml` and every `features/*.feature`, plus `contexts/<context>/glossary.md` when the front matter of `spec.md` (or `meta` of `decisions.yaml`) names a `context`. That context's `CONSTRAINTS.md` is appended to the project's `.aeos/CONSTRAINTS.md`. All of it is read through git at the pinned commit, never from the working tree, so editing the spec does not change what a running epic is told; a pinned commit that can no longer be read fails the run. A task still receives its epic's tech spec as before. A ticket with no pin gets exactly the prompt it got before.

### Spec fidelity at code review

`CODE_REVIEW` of a single task now applies `rubrics/drift/spec-fidelity.md` as well as the
structure and intent-drift rubrics, so the reviewer checks the task's diff against the pinned
spec's acceptance criteria and the tech spec's decisions (the rubric says how each criterion
scopes down to one task). A new project has this from `aeos project init`. In an existing
project `aeos project sync` reports `column-specs/code-review.yaml` and the rubric as drifted:
`aeos project sync --force` takes the new versions (each old file is kept as `.bak`), or add
`- rubrics/drift/spec-fidelity.md` to `reviewerRubrics` by hand. `--apply` alone only adds
missing files and will not change a file you already have.

### Projects created before `SPEC_REVIEW`

The column `PRODUCT_SCOPING` is now `SPEC_REVIEW`; the database is migrated on the next command. An epic that was in that column with no spec is kept, set `ESCALATED`, and says why in `aeos ticket show`: create a new epic with `--spec` and close the old one with `aeos ticket move`. An epic with no spec that was still in `BACKLOG` is not touched by the migration; `aeos ticket approve` (and the orchestrator's advance, which halts `NEEDS_HUMAN`) refuses to move it out of `BACKLOG`, with the same guidance. In the project, `aeos project sync` lists `column-specs/spec-review.yaml`, `agents/spec-reviewer-agent.yaml` and `rubrics/structure/spec-review-structure.md` as missing (`--apply` adds them) and the retired `product-scoping.yaml`, `pm-agent.yaml` and PRD rubrics as obsolete; it never deletes those. The reworded agents and rubrics show as drifted (`--force` overwrites, with a backup).

## Branches and pull requests

Nothing the engine writes goes onto the default branch.

- **Epic** — `aeos orchestrator run` puts the epic on `aeos/<epicId>` and tags its base `aeos-base/<epicId>`. Its tasks commit there.
- **Child task** — runs on its epic's branch. `aeos ticket run` switches to `aeos/<epicId>`, creating it and the tag `aeos-base/<epicId>` when the orchestrator has not.
- **Standalone task** (no parent) — `aeos ticket run` switches to `aeos/<taskId>`, creating it and the tag `aeos-base/<taskId>` on the first run.

A new `aeos/<id>` branch is cut from the local tip of the default branch (nothing is fetched), wherever `HEAD` is, so a ticket never starts on top of the previous ticket's branch; an existing one is checked out as it is. When uncommitted changes prevent the switch, the run fails with git's reason and nothing is carried across: commit or stash them and run again.

The default branch is the remote's `HEAD` when there is one, otherwise a local `main`, then `master`. `AEOS_GIT_ISOLATION=none` turns the branch handling off.

A finished task becomes one commit, with trailers:

```
[AEOS-12] Add password hashing

Ticket: AEOS-12
Epic: AEOS-10
Spec: AEOS-aeos@4f9c1a2b7d3e5f60a1b2c3d4e5f60718293a4b5c
```

`Spec:` is there only for a task of a [spec-backed epic](#spec-backed-epics).

`aeos ticket approve` then opens the pull request against the default branch: for an epic when it is approved out of `INTEGRATION_REVIEW`, for a standalone task when it is approved to `DONE`. It pushes the `aeos/<id>` branch to `origin` and runs `gh pr create`; if the branch already has an open pull request, that one is used. The body carries the ticket, the path of the integration (or code) review with its verdict, the checks table, a bug's reproduction (its test red, then green) and the total recorded cost; artifact paths are not links because `.aeos/` has no remote. The URL is stored on the ticket and shown by `aeos ticket show`. Merging stays yours.

If the pull request cannot be opened (`gh` not on `PATH`, not authenticated, no remote, or the host refuses), `approve` stops with the cause and the fix and the ticket stays `SIGNED_OFF`, so running `approve` again retries. Under `aeos orchestrator run` this halts the epic as needing a human. For a project with no code host:

```json
{ "pullRequests": { "enabled": false } }
```

in `.aeos/project.json` skips the push and the pull request; branches and trailers stay. With `AEOS_EXECUTOR=stub` nothing is pushed and no `gh` call is made; a placeholder URL is stored.

## Orchestrator

`aeos orchestrator run <epicId>` drives an epic and its tasks without a human in
the loop, stopping the moment one is needed.

```bash
aeos orchestrator run AEOS-1 --budget 25
```

```
  AEOS-1: advanced BACKLOG → SPEC_REVIEW
  AEOS-1: run succeeded in 1 attempt(s)
  AEOS-1: advanced SPEC_REVIEW → TECH_SPEC
  AEOS-1: run succeeded in 2 attempt(s)
  ...

⏸ AEOS-1 — AWAITING_DECOMPOSITION
  Epic AEOS-1 is decomposed but has no child tasks. Create them from its
  tasks.md with `aeos ticket create <title> --parent AEOS-1`.
  6 action(s), $3.41 spent
```

**The scheduler is deterministic, not an LLM.** Every decision it makes — is the
budget spent, is this signed off, are all children done — is a predicate over
stored state. Putting a model in the control path would add cost per tick, make
control flow non-deterministic, and make "why did this advance?" unanswerable
from the transition log. LLM judgment stays in the workers and reviewers it
schedules.

### Why a run stops

Every exit is a named halt reason, including the successful ones.

| Halt reason              | Meaning                                                  |
| ------------------------ | -------------------------------------------------------- |
| `COMPLETE`               | The epic reached `DONE`                                  |
| `HUMAN_GATE`             | Reached `DOD_GATE` and, for a spec-backed epic, ran it (the residual conformance judgement) — final sign-off is human-only. Run `aeos ticket dod-approve <epic>` |
| `AWAITING_APPROVAL`      | A column is set to manual advance                        |
| `AWAITING_DECOMPOSITION` | The breakdown is signed off but no child tasks exist yet |
| `NEEDS_HUMAN`            | A ticket escalated, blocked, or was interrupted          |
| `FAILED`                 | A ticket failed outright                                 |
| `BUDGET_EXCEEDED`        | Spend reached the ceiling                                |
| `COST_UNKNOWN`           | The epic has a ceiling, but a run recorded no known cost |

### Controls

| Command                                                             | Effect                                             |
| ------------------------------------------------------------------- | -------------------------------------------------- |
| `aeos orchestrator run <epicId> [--budget <usd>] [--max-steps <n>]` | Drive the epic; the budget persists for later runs |
| `aeos orchestrator pause <epicId>`                                  | Refuse to schedule new work for this epic          |
| `aeos orchestrator resume <epicId>`                                 | Allow scheduling again                             |
| `aeos orchestrator clear-budget <epicId>`                           | Remove the budget ceiling (ends `COST_UNKNOWN`)    |
| `aeos orchestrator status [epicId]`                                 | Show status, last halt reason, and budget          |

### One driver per epic

An epic is driven by one run at a time. A second `orchestrator run` against the
same epic refuses rather than double-scheduling its tasks.

The lock is a heartbeat, not a flag: a live run touches the epic's row
continuously — riding the ticket run's own event stream, so even a 30-minute
agentic build keeps it fresh. A row that goes quiet for five minutes is treated
as abandoned and the next run takes over, so a crashed process cannot lock an
epic out permanently. An unexpected error clears the lock on the way out.

If you are certain a run is gone and do not want to wait, `aeos orchestrator
resume <epicId>` clears the lock.

**Turning it off is always safe.** All state lives in SQLite and git-committed
markdown, so a paused or halted epic is just a set of tickets in ordinary
sub-states that you can drive by hand with `aeos ticket run` / `approve`. The
orchestrator adds auto-advance; it does not replace the manual path.

Two things it will never do: advance past `DOD_GATE`, and merge a pull request.

### Auto-advance

The orchestrator only advances a column when that column permits it. Column
specs win over the global setting:

```yaml
# .aeos/column-specs/tech-spec.yaml
advanceMode: manual # gate the highest-leverage artifact, auto-advance the rest
```

```json
// ~/.aeos/config.json
{ "advanceMode": "auto" }
```

With the global default of `manual`, `orchestrator run` halts at the first
sign-off with `AWAITING_APPROVAL` — safe by default, opt in to autonomy.

## Review Loop

A rejected review sends the artifact back to the worker with the review attached, rather
than failing the ticket outright. Four independent guards keep the loop finite — "iterate
until the reviewer has no comments" does not terminate on its own, because reviewers
essentially always find something:

| Guard                 | Behaviour                                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Severity gate**     | Only `BLOCKER` findings block. `APPROVED_WITH_WARNINGS` advances; warnings are recorded on the artifact.                      |
| **Iteration cap**     | Default 5 attempts including the first.                                                                                       |
| **Convergence**       | If an attempt reproduces the previous attempt's blocker set, the loop stops early rather than burning its remaining attempts. |
| **Escalation policy** | On exhaustion, the column's `escalation` setting applies: `escalate_to_human` (default) or `mark_done`.                       |

Configure globally in `~/.aeos/config.json`:

```json
{
  "model": "claude-opus-4-8",
  "currency": "USD",
  "advanceMode": "manual",
  "reviewLoop": {
    "enabled": true,
    "maxIterations": 5
  }
}
```

Set `"enabled": false` to switch the loop off entirely — a rejected review then escalates
immediately, with no revision attempt. A column spec may override the cap with its own
`maxIterations`; omitting it inherits the global value.

### Reviewer verdict contract

Reviewers emit a prose review for humans **and** a machine-readable trailer that loop
control reads. The prose is never parsed:

```markdown
<!-- AEOS-VERDICT
verdict: REJECTED
blockers: 2
warnings: 1
info: 0
blocker-topics: missing-rollback-path, unbounded-retry
-->
```

`blocker-topics` are stable kebab-case slugs reused across reviews when the same defect
persists — that is what convergence detection compares. A missing or unparseable trailer
is a hard escalation, never silently treated as approval.

## Environment Variables

| Variable        | Default   | Description                                                                     |
| --------------- | --------- | ------------------------------------------------------------------------------- |
| `AEOS_EXECUTOR` | unset     | Set to `stub` to force the stub executor for testing without real LLM/CLI calls |
| `AEOS_HOME`     | `~/.aeos` | Override the global state directory (config, registry, `state.db`)              |
| `AEOS_GIT_ISOLATION` | unset | Set to `none` to stop AEOS switching branches (epic and task branches)         |

`AEOS_EXECUTOR=stub` drives the full pipeline offline: the stub clears preflight,
satisfies structural validation, and emits an APPROVED verdict when standing in for
a reviewer. The one thing it cannot do is agentic `IMPLEMENTATION` — it writes no
code, so the required repo diff is absent and the run fails by design.

## Architecture

```
src/
├── domain/          # Pure domain — entities, value objects, ports (no I/O, no deps)
├── application/     # Use cases — orchestrate domain via ports
│   └── services/    # Application services (context assembly, prompt building, preflight)
├── infrastructure/  # Adapters — SQLite, filesystem, git, executor, YAML spec loaders
│   ├── persistence/ # SQLite repositories (tickets, transitions, costs)
│   ├── executor/    # Stub, Claude, Auggie, OpenCode, Ollama adapters
│   ├── filesystem/  # Config store, artifact store, project repo, rubric loader
│   ├── git/         # Git gateway (init, commit, commitFiles)
│   └── spec-loader/ # YAML+Zod column/agent spec loaders
├── cli/             # Driving adapter — command handlers, generated registration, composition root
└── shared/          # Cross-cutting — errors, types, config
```

Dependency rule: `cli/ → application/ → domain/ ← infrastructure/`

Domain is pure (zero external imports). Infrastructure implements domain ports. CLI wires everything via the composition root (`container.ts`) with lazy dependency resolution.

## Cost Tracking

Every executor invocation (preflight, worker and reviewer) records token usage and cost to a local SQLite database at `~/.aeos/state.db`. All projects share one database, isolated by `project_id`.

`claude-cli` runs with `--output-format stream-json --verbose`; tokens and cost come from the final `result` line of that stream. The cost is the CLI's client-side estimate, not billing data. The other executors do not report usage yet.

An unknown cost is stored and shown as `unknown`, never as `$0.00`. Only `claude-cli` and `stub` report cost, so `aeos orchestrator run --budget` (or a budget persisted earlier) is refused when any agent of a column still ahead resolves to `auggie-cli`, `opencode-cli` or `ollama-cli`; the message names the agent and the executor. Columns already passed do not count: the epic's own columns from its current one on, and each task column unless the epic is past `TASK_BREAKDOWN` and every child task is past that column. Spend is the sum of known costs. If a run with an unknown cost is recorded against a budgeted epic anyway (an `--executor` override, or an executor failure), the orchestrator halts with `COST_UNKNOWN`. The unknown record stays, so every later budgeted run halts the same way; `aeos orchestrator clear-budget <epicId>` removes the persisted ceiling so the next `orchestrator run` without `--budget` proceeds. It errors if the epic has no orchestrator state.

`aeos ticket show <id>` surfaces this history back to the operator as an `Executions:` section showing the column, agent, executor, model, and cost of each run.

`aeos costs` reports the spend across every project in the database, so it works outside a project directory:

```bash
aeos costs                       # every project
aeos costs --project AEOS        # one project, by key
aeos costs --epic AEOS-1         # an epic and its child tasks
aeos costs --ticket AEOS-2       # one ticket
aeos costs --since 2026-11-01    # records from that date on
```

It shows a total per project and per ticket, and within a ticket per column and per role (`preflight`, `worker`, `reviewer`; records written before roles were stored show as `unrecorded`). Totals sum known costs only. A ticket whose records are all unknown shows `unknown`, and a footer counts the records left out. Preflight invocations are recorded too, so they count towards an orchestrator budget.

## Run Records

Every executor invocation (preflight, worker, reviewer) leaves three files under `.aeos/tickets/<ticket>/runs/`, whether it succeeded, failed, timed out or was interrupted:

- `<run_id>.json`: the record (role, agent, executor, model, attempt, timings, exit, usage, cost, verdict), valid against `plugins/artefact-tree-pipeline/schemas/run-record.schema.json`
- `<run_id>.brief.md`: the exact prompt the agent received; its SHA-256 is in the record
- `<run_id>.log`: the raw executor output. An executor with no output stream logs the text it returned, and a failed run logs its failure reason.

Run ids look like `RUN-20261110T101500Z-k3f9`. The files are committed to the `.aeos` repository in the same commit as the artifact or review the run produced; a run that produced none is committed alone as `[<ticket>][RUN][<run_id>][<role>][<exit>]`. Each artifact and review ends with `<!-- AEOS-RUN: <run_id> -->`, naming the run that wrote it. `aeos ticket show <id>` lists the ticket's run ids.

Briefs and logs are not redacted and may contain source code. `.aeos/` has no remote by default; think before you add one.

## Development

```bash
npm run build          # Compile TypeScript
npm run dev            # Watch mode
npm test               # Run tests (Vitest 4.x, 483+ tests)
npm run test:coverage  # With V8 coverage
npm run lint           # ESLint + Prettier check
npm run lint:fix       # Auto-fix
npm run typecheck      # tsc --noEmit (strict mode)
npm run generate:cli   # Regenerate src/cli/generated/ and the command reference from cli-contract.yaml
npm run verify:generated  # Fail if generated code or the reference is stale
npm run smoke-test:auggie   # Real Auggie CLI smoke test (external tool required)
npm run smoke-test:opencode # Real OpenCode CLI smoke test (external tool required)
```

## License

ISC
