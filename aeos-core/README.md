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

Re-running `aeos project init` is the repair path: it restores anything missing and
never overwrites a file you have edited.

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

## Ticket State Machine

Each ticket stores exactly two workflow fields:

- **Column** — where the ticket is in the pipeline
- **Sub-state** — what is happening inside that column right now

Think of the state machine as `column + sub-state`.

### Columns

The forward order depends on the ticket's kind:

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
- `aeos ticket move <id> <status> --reason <text>` moves a ticket to any column; non-terminal targets are reset to `READY`, while `BACKLOG` and `DONE` use `null`

So the domain state machine is intentionally permissive for operator control, while the normal workflow policy is enforced by the higher-level ticket commands.

### Gate records

Every human decision at a gate is appended, as a structured record, to a YAML file in the `.aeos` repository and committed there, **before** the ticket changes state. If the record cannot be written, the command fails and the ticket stays where it was.

| Command | `gate` | `verdict` |
| --- | --- | --- |
| `ticket approve` out of `SPEC_REVIEW` | `spec` | `approved` |
| `ticket approve` anywhere else | `column-approval` | `approved` |
| `ticket dod-approve` (yes / no) | `definition-of-done` | `approved` / `rejected` |
| `ticket sign-off` | `sign-off-override` | `overridden` |
| `ticket move` | `move-override` | `overridden` |
| `ticket answer` | `answer` | `approved` |
| `ticket answer` on a spec-backed ticket | `amendment` | `approved` |
| `ticket repin` | `repin` | `approved` |
| `ticket resolve` | `escalation-resolution` | `approved` |

- **Late answers amend the spec.** On a spec-backed ticket, `ticket answer` writes each answered question into `.aeos/features/<feature>/decisions.yaml` as a `DECIDED` entry (`NEW-<n>`, becoming the next `AC-<n>`, citing the ticket and its questions file), runs the decisions lint, and commits `decide(<feature>): amendment from <ticket>`. If the lint fails, nothing is written and the ticket stays `BLOCKED`. Otherwise the ticket also stays `BLOCKED`: add the criterion to `spec.md` (the `spec-writer` skill), commit, then run `aeos ticket repin <ticket>`. That re-checks the feature as `--spec` does, moves the epic's pin to the `.aeos` `HEAD` (its tasks follow), and sets the ticket `READY`. Until then `ticket run` refuses every ticket pinned to that spec, and a second amendment is refused. The `amendment` record carries the column the ticket was in; the `repin` record's reason names both commits. A ticket with no spec is unblocked as before.
- **Where.** A spec-backed ticket (its own pin or its epic's): `.aeos/features/<feature>/gates.yaml`. Any other ticket: `.aeos/tickets/<id>/<id>-gates.yaml`. Ids are `GATE-1`, `GATE-2`, … within a file; records are appended and never rewritten. The format is `schemas/gates.schema.json`.
- **Who.** `decided_by` is `user.name <user.email>` of the project repository. With neither configured, the command is refused and tells you to set them.
- **Why.** `ticket move` and `ticket sign-off` require `--reason <text>`, at least ten characters. `ticket dod-approve` asks for one when the answer is no. Existing scripts that call `move` or `sign-off` without `--reason` now fail.
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

### Protected paths

An agent must not be able to weaken what it is judged against. Around every executor invocation (preflight, worker and reviewer, artifact and agentic) AEOS compares the changed files of the project repository and of `.aeos/` (its own repository) before and after. If the run changed a protected path, the path is restored (a tracked file is checked out, a new file is deleted), the run record carries the violation in `error`, and the attempt ends `FAILED`, not `ESCALATED`: the agent broke a rule.

Always protected, whatever the configuration says:

```
.aeos/project.json        .aeos/rubrics/**         .aeos/schemas/**
.aeos/pipelines.yaml      .aeos/column-specs/**    .aeos/features/**
.aeos/CONSTRAINTS.md      .aeos/agents/**          .aeos/contexts/**
.aeos/tickets/*/runs/**
```

Add project paths with `protectedPaths` in `.aeos/project.json`; the list can only add to the defaults:

```json
{ "protectedPaths": ["src/cli/generated/**"] }
```

Globs are relative to the project root: `*` matches within one path segment, `**` any number of segments. Detection is a diff after the run, so it works for every executor; it does not stop the write or any read. Two limits: a protected file that already had uncommitted changes before the run is not checked (commit `.aeos/` edits before running), and two runs in the same project at the same time can be blamed for each other's writes.

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

| Command                                                      | Description                                                                |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `aeos install`                                               | One-time global setup (`~/.aeos/`, global gitignore)                       |
| `aeos project init [--name] [--key]`                         | Initialise `.aeos/` in the current directory                               |
| `aeos ticket create <title> [--parent <epicId>] [--spec <feature>] [--implements <ids>]` | Create a ticket in BACKLOG — an epic with `--spec` (required for an epic), a task with `--parent`, claiming criteria with `--implements` |
| `aeos ticket list [--column]`                                | List tickets, optionally filtered by column                                |
| `aeos ticket show <id>`                                      | Show ticket details, column, sub-state, artifacts, recorded executions, and run ids |
| `aeos ticket run <id> [--executor <type>] [--model <model>]` | Run the current column: pre-flight → agent → validate → review             |
| `aeos ticket approve <id>`                                   | Advance a SIGNED_OFF ticket to the next column                             |
| `aeos ticket sign-off <id> --reason <text>`                  | Manual override — set a ticket sub-state to SIGNED_OFF                     |
| `aeos ticket move <id> <status> --reason <text>`             | Human override — move a ticket directly to any workflow status             |
| `aeos ticket answer <id>`                                    | Unblock a `BLOCKED` ticket after answering pre-flight questions            |
| `aeos ticket repin <id>`                                     | Move a spec-backed ticket's pin to the current spec after an amendment     |
| `aeos ticket resolve <id>`                                   | Resume an `ESCALATED` ticket after writing a decision in its `escalation.md` |
| `aeos ticket dod-approve <id>`                               | Final human gate — mark ticket as DONE _(not yet implemented)_             |
| `aeos dashboard`                                             | Cross-project Kanban summary _(not yet implemented)_                       |
| `aeos costs [--project] [--epic] [--ticket] [--since]`       | LLM spend report across all projects                                       |

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
git checkout -b aeos/AEOS-1                            # `orchestrator run` does this for you
aeos ticket approve AEOS-2 && aeos ticket run AEOS-2   # implementation
...

# 5. Only once every task is DONE can the epic advance
aeos ticket approve AEOS-1                             # → INTEGRATION_REVIEW
aeos ticket run AEOS-1                                 # reviews the whole feature vs spec/tech spec
aeos ticket approve AEOS-1                             # → DOD_GATE, and opens the pull request
```

Nesting is one level deep: tasks hang off epics, and a task cannot itself have
children. Attempting to advance an epic out of `TASK_BREAKDOWN` while any child
is unfinished reports which tasks are outstanding and refuses the transition.

> Creating child tickets from `tasks.md` is a manual step today. Automating that
> decomposition belongs with the orchestrator, which owns scheduling.

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

The column `PRODUCT_SCOPING` is now `SPEC_REVIEW`; the database is migrated on the next command. An epic that was in that column with no spec is kept, set `ESCALATED`, and says why in `aeos ticket show`: create a new epic with `--spec` and close the old one with `aeos ticket move`. In the project, `aeos project sync` lists `column-specs/spec-review.yaml`, `agents/spec-reviewer-agent.yaml` and `rubrics/structure/spec-review-structure.md` as missing (`--apply` adds them) and the retired `product-scoping.yaml`, `pm-agent.yaml` and PRD rubrics as obsolete; it never deletes those. The reworded agents and rubrics show as drifted (`--force` overwrites, with a backup).

## Branches and pull requests

Nothing the engine writes goes onto the default branch.

- **Epic** — `aeos orchestrator run` puts the epic on `aeos/<epicId>` and tags its base `aeos-base/<epicId>`. Its tasks commit there.
- **Child task** — runs on its epic's branch. `aeos ticket run` refuses a child task while `HEAD` is the default branch.
- **Standalone task** (no parent) — `aeos ticket run` switches to `aeos/<taskId>`, creating it and the tag `aeos-base/<taskId>` on the first run.

The default branch is the remote's `HEAD` when there is one, otherwise a local `main`, then `master`. `AEOS_GIT_ISOLATION=none` turns the branch handling off.

A finished task becomes one commit, with trailers:

```
[AEOS-12] Add password hashing

Ticket: AEOS-12
Epic: AEOS-10
Spec: AEOS-aeos@4f9c1a2b7d3e5f60a1b2c3d4e5f60718293a4b5c
```

`Spec:` is there only for a task of a [spec-backed epic](#spec-backed-epics).

`aeos ticket approve` then opens the pull request against the default branch: for an epic when it is approved out of `INTEGRATION_REVIEW`, for a standalone task when it is approved to `DONE`. It pushes the `aeos/<id>` branch to `origin` and runs `gh pr create`; if the branch already has an open pull request, that one is used. The body carries the ticket, the path of the integration (or code) review with its verdict, the checks table and the total recorded cost; artifact paths are not links because `.aeos/` has no remote. The URL is stored on the ticket and shown by `aeos ticket show`. Merging stays yours.

If the pull request cannot be opened (`gh` not on `PATH`, not authenticated, no remote, or the host refuses), `approve` stops with the cause and the fix and the ticket stays `SIGNED_OFF`, so running `approve` again retries. Under `aeos orchestrator run` this halts the epic as needing a human. For a project with no code host:

```json
{ "pullRequests": { "enabled": false } }
```

in `.aeos/project.json` skips the push and the pull request; branches and trailers stay. With `AEOS_EXECUTOR=stub` no `gh` call is made and a placeholder URL is stored, but the branch is still pushed if the repository has a remote.

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
| `HUMAN_GATE`             | Reached `DOD_GATE` — final sign-off is human-only        |
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
├── cli/             # Driving adapter — Commander.js commands + composition root
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
npm run smoke-test:auggie   # Real Auggie CLI smoke test (external tool required)
npm run smoke-test:opencode # Real OpenCode CLI smoke test (external tool required)
```

## License

ISC
