---
name: aeos
description: >
  Drive the AEOS ticket pipeline from the command line. Use this when working
  inside an AEOS project (a directory containing .aeos/project.json) to create
  tickets, decompose an epic into child tasks, run a pipeline column, or inspect
  ticket state. Triggers whenever a task involves aeos tickets, epics, tasks, or
  breaking work down into tasks.
---

# Driving AEOS from the CLI

AEOS runs tickets through an agent pipeline. A ticket is an **epic** or a
**task**. You are usually invoked *by* AEOS as the worker for a column, with the
current ticket in your context and the project root as your working directory.

The `aeos` binary is on PATH and operates on the project in the current working
directory. Every command below is safe to run from within a column execution.

## Decomposing an epic (TASK_BREAKDOWN)

When you run the `TASK_BREAKDOWN` column you produce two things:

1. The `tasks.md` breakdown as your response text, in the format your agent
   spec defines. Your printed output is captured as the artifact — print the
   breakdown; do not write it to a file (a file you write is ignored).
2. One child ticket per task, created by calling the CLI.

Create each task as a child of the epic you are decomposing, passing its
`T-NNN` key from `tasks.md` with `--key` **and its full content with
`--body-file`**. The engineer that implements a task sees only its ticket, so a
title alone strands it — the ticket must carry the task's Description,
Acceptance criteria, Depends on, Touches, and Out of scope:

```sh
cat > /tmp/<EPIC_ID>-T-001.md <<'BODY'
**Depends on:** none
**Touches:** lib/auth/hash.ts

**Description**
...

**Acceptance criteria**
- [ ] ...
BODY
aeos ticket create "Add password hashing" --parent <EPIC_ID> --key T-001 --implements AC-1,AC-2 --body-file /tmp/<EPIC_ID>-T-001.md
```

Small bodies may be passed inline with `--body "<markdown>"`, but prefer
`--body-file` for multi-line content — it avoids shell-quoting mistakes.

`<EPIC_ID>` is the ID of the ticket in your context — the `# Ticket: <ID>`
heading in the ticket document (e.g. `AEOS-1`). Use that exact ID.

Rules:

- **One `ticket create` call per task in your breakdown**, each with its own
  **distinct** `--key T-NNN` matching the task's label in `tasks.md`, and its
  own `--body-file` carrying that task's full block. Reusing a key across two
  tasks silently drops the second — they are treated as one task.
- **Creating a task is idempotent, keyed on `--key`.** If a child with the same
  key already exists under the epic, the command leaves it **unchanged** and
  prints `= ... already exists` — a reworded title is not applied, so keep each
  task's title stable across attempts too. Keying on the label rather than the
  title means a retry still matches, so re-running after a rejected review never
  duplicates tasks. Always create the full set with stable keys; do not try to
  detect what already exists.
- **Claim criteria with `--implements` on every task of a spec-backed epic**
  (your context has a Specification section): the comma-separated `AC-n` ids of
  `spec.md` the task implements, e.g. `--implements AC-1,AC-12a`. Every
  criterion must be claimed by at least one task, and only ids the spec contains
  may be claimed. An unclaimed criterion is rejected at review and escalates the
  epic at integration review before any agent runs.
- **Do not create tasks under a task.** Nesting is one level deep; `--parent`
  must always be an epic.
- Keep titles short and imperative — they become ticket titles.

After writing `tasks.md` and creating the child tickets, your column output is
complete. The reviewer evaluates `tasks.md`; the orchestrator picks up the
children you created and drives each through its own build pipeline.

## Other useful commands

```sh
aeos ticket list                 # tickets in this project; tasks nest under their epic
aeos ticket show <ID>            # kind, parent/children, column, state, artifacts
aeos ticket create "<title>"     # a new epic (no --parent)
```

Do **not** run `aeos ticket run`, `aeos ticket approve`, or `aeos orchestrator`
from inside a column — those drive the pipeline and would re-enter it. Your job
is to produce this column's output; advancing is the operator's or
orchestrator's concern.

## Reading a command's result

Add `--json` to any command to get one JSON object on stdout and nothing else
there (progress and questions go to stderr):

```json
{ "ok": true, "command": "ticket create", "exit": 0, "contractVersion": 0,
  "data": { "ticketId": "AEOS-7", "kind": "TASK", "parentId": "AEOS-1", "alreadyExisted": false },
  "error": null, "warnings": [] }
```

Read the result from `data` instead of parsing the text. The exit code says what
happened, and non-zero does not always mean something broke:

- `0` the command did what was asked. `data` has the shape the reference below
  declares.
- `1` something broke. `error.code` is stable (`TICKET_NOT_FOUND`,
  `NOT_SIGNED_OFF`, …) and `error.message` says what; fix that and retry.
- `2` your arguments were wrong (`error.code` `INVALID_ARGUMENT` or `USAGE`, the
  message names the parameter). Nothing was attempted; correct the call.
- `3` the pipeline worked and stopped for a person: a ticket escalated or is
  blocked, an approval or a gate is waiting, a budget is spent. **Do not retry
  and do not work around it.** Report `error.message` and stop.
- `4` a resource is missing; `error.resource` names it and the message gives the
  fix. Nothing was attempted.
- `130` the run was interrupted.

A command never asks you a question: without a terminal, `ticket answer` and
`ticket resolve` need `--yes` to skip their confirmation, and
`ticket dod-approve` exits `3`, because the release decision is a person's.
Entries in `warnings` did not stop the command (for example a cost that could
not be read).

## Command reference

Generated from the CLI contract; the exit codes each command lists are the ones
it uses.

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

- `0` The ticket is unblocked and its answers are promoted to decisions.
- `1` Something broke. envelope.error says what.
- `2` Invalid arguments or options. Nothing was attempted.
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

- `0` The ticket can be run again.
- `1` Something broke. envelope.error says what.
- `2` Invalid arguments or options. Nothing was attempted.
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
