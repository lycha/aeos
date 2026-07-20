# AEOS — AI-Engineered Operating System

An AI-assisted development pipeline that takes a ticket from idea to code review using specialised LLM agents. Each pipeline column has a dedicated agent, a reviewer with rubrics, and a human approval gate. AEOS dogfoods itself — it was built using its own pipeline.

## Requirements

- **Node.js 22+** (LTS)
- **At least one supported executor CLI on `$PATH`**
  - `claude` — [install](https://docs.anthropic.com/en/docs/claude-code/getting-started)
  - `auggie` — [install](https://docs.augmentcode.com/cli/reference)
  - `opencode` — [install](https://opencode.ai/docs/cli/)
  - `ollama` — [install](https://docs.ollama.com/cli)
- macOS or Linux

## Install

```bash
# From source
git clone https://github.com/lycha/aeos.git
cd aeos
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

# 2. Create a ticket
aeos ticket create "Add user authentication"

# 3. Edit the ticket description
$EDITOR .aeos/MYPRJ-1-ticket.md

# 4. Run the current column (agent executes → reviewer evaluates)
aeos ticket run MYPRJ-1

# Optional: override executor/model for a single run
aeos ticket run MYPRJ-1 --executor opencode-cli --model ollama/qwen2.5-coder:14b

# 5. Approve to advance to the next column
aeos ticket approve MYPRJ-1

# Optional: move a ticket directly to any workflow status
aeos ticket move MYPRJ-1 QA

# 6. Repeat steps 4–5 for each column, then final approval
aeos ticket dod-approve MYPRJ-1
```

## How It Works

A ticket is either an **epic** or a **task**, and each follows its own pipeline.

```
EPIC   BACKLOG → PRODUCT_SCOPING → TECH_SPEC → TASK_BREAKDOWN ─────────→ DOD_GATE → DONE
                 PM Agent          Architect    Architect                 Human
                 ↓                 ↓            ↓                           ▲
                 PRD               Tech Spec    tasks.md                    │
                 ↓                 ↓            ↓                           │
                 Reviewer          Reviewer     Reviewer                    │
                                                │                           │
                                   fans out into child tasks    all children DONE
                                                ▼                           │
TASK   BACKLOG → IMPLEMENTATION → CODE_REVIEW → QA → DONE ───────────────────┘
                 Engineer          Engineer      QA
                 ↓                 ↓             ↓
                 Code + Summary    Code Review   Report
                 ↓                 ↓             ↓
                 Reviewer          Reviewer      Reviewer
```

An epic is scoped, specced, and decomposed — it never implements anything itself.
Its child tasks do that, and the epic cannot leave `TASK_BREAKDOWN` until every
child reaches `DONE`.

Each column follows the same cycle:

1. **Pre-flight** — agent checks for blocking questions; if found, ticket is `BLOCKED` until answered via `aeos ticket answer`
2. **Agent run** — specialised worker agent executes the current column. Most columns produce a markdown artifact; `IMPLEMENTATION` can run in agentic mode and modify the repository directly, then emit a concise implementation summary.
3. **Validation** — rule-based structural checks (for example non-empty output, required sections, and column-specific constraints). Agentic `IMPLEMENTATION` runs must also leave a real repo diff.
4. **Review** — a reviewer agent (on a _different model_ from the worker) evaluates against column-specific rubrics and emits a machine-readable verdict: `APPROVED`, `APPROVED_WITH_WARNINGS`, or `REJECTED`. Only `BLOCKER` findings gate; warnings are recorded on the artifact and do not block.
5. **Revision loop** — a `REJECTED` review sends the artifact back to the worker with the review attached, up to the configured cap. See [Review Loop](#review-loop).
6. **Sign-off** — if review passes, ticket is set to `SIGNED_OFF`
7. **Human gate** — operator can advance normally (`aeos ticket approve`) or override to any status (`aeos ticket move`)

## What `project init` creates

```
.aeos/
├── project.json          project identity and optional executor defaults
├── CONSTRAINTS.md         placeholder for your architecture/style/security rules
├── column-specs/          one YAML per pipeline column
├── agents/                worker and reviewer agent specs
└── rubrics/               reviewer rubrics and artifact templates
```

Everything under `column-specs/`, `agents/`, and `rubrics/` is scaffolded from the
templates shipped with AEOS and is **yours to edit** — changing pipeline behaviour
usually means editing this YAML, not TypeScript.

Re-running `aeos project init` is the repair path: it restores anything missing and
never overwrites a file you have edited.

## Ticket State Machine

Each ticket stores exactly two workflow fields:

- **Column** — where the ticket is in the pipeline
- **Sub-state** — what is happening inside that column right now

Think of the state machine as `column + sub-state`.

### Columns

The forward order depends on the ticket's kind:

| Kind   | Pipeline                                                                   |
| ------ | -------------------------------------------------------------------------- |
| `EPIC` | `BACKLOG → PRODUCT_SCOPING → TECH_SPEC → TASK_BREAKDOWN → DOD_GATE → DONE` |
| `TASK` | `BACKLOG → IMPLEMENTATION → CODE_REVIEW → QA → DONE`                       |

`aeos ticket approve` uses the kind to pick the next column, so a task never
visits `PRODUCT_SCOPING` and an epic never visits `IMPLEMENTATION`.

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
| `PRODUCT_SCOPING` | epic | all eight                |
| `TECH_SPEC`       | epic | all eight                |
| `TASK_BREAKDOWN`  | epic | all eight                |
| `IMPLEMENTATION`  | task | all eight                |
| `CODE_REVIEW`     | task | all eight                |
| `QA`              | task | all eight                |
| `DOD_GATE`        | epic | all eight                |
| `DONE`            | both | `null` only              |

In other words:

- `BACKLOG` tickets have no sub-state yet
- in-flight columns always have a non-null sub-state
- `DONE` is terminal and normally has no active sub-state

### Human/manual controls

Operators can deliberately override the normal path:

- `aeos ticket ready <id>` sets any non-`BACKLOG`, non-`DONE` ticket to `READY`
- `aeos ticket sign-off <id>` manually marks any non-`BACKLOG`, non-`DONE` ticket as `SIGNED_OFF`
- `aeos ticket move <id> <status>` moves a ticket to any column; non-terminal targets are reset to `READY`, while `BACKLOG` and `DONE` use `null`

So the domain state machine is intentionally permissive for operator control, while the normal workflow policy is enforced by the higher-level ticket commands.

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
| `aeos ticket create <title> [--parent <epicId>]`             | Create a ticket in BACKLOG — an epic by default, a task with `--parent`    |
| `aeos ticket list [--column]`                                | List tickets, optionally filtered by column                                |
| `aeos ticket show <id>`                                      | Show ticket details, column, sub-state, artifacts, and recorded executions |
| `aeos ticket run <id> [--executor <type>] [--model <model>]` | Run the current column: pre-flight → agent → validate → review             |
| `aeos ticket approve <id>`                                   | Advance a SIGNED_OFF ticket to the next column                             |
| `aeos ticket sign-off <id>`                                  | Manual override — set a ticket sub-state to SIGNED_OFF                     |
| `aeos ticket move <id> <status>`                             | Human override — move a ticket directly to any workflow status             |
| `aeos ticket answer <id>`                                    | Unblock a ticket after answering pre-flight questions                      |
| `aeos ticket dod-approve <id>`                               | Final human gate — mark ticket as DONE _(not yet implemented)_             |
| `aeos dashboard`                                             | Cross-project Kanban summary _(not yet implemented)_                       |
| `aeos costs [--project] [--ticket]`                          | LLM spend report _(not yet implemented)_                                   |

## Epics and Tasks

A ticket created without a parent is an **epic**. It carries a requirement through
scoping, spec, and decomposition, and its `TASK_BREAKDOWN` artifact (`tasks.md`)
lists the atomic tasks that will implement it.

```bash
# 1. An epic
aeos ticket create "Add user authentication"        # → AEOS-1 (EPIC)

# 2. Run it through scoping, spec, and breakdown
aeos ticket approve AEOS-1 && aeos ticket run AEOS-1   # PRD
aeos ticket approve AEOS-1 && aeos ticket run AEOS-1   # tech spec
aeos ticket approve AEOS-1 && aeos ticket run AEOS-1   # tasks.md

# 3. Create the tasks the breakdown identified
aeos ticket create "Add password hashing" --parent AEOS-1   # → AEOS-2 (TASK)
aeos ticket create "Add session middleware" --parent AEOS-1 # → AEOS-3 (TASK)

# 4. Each task runs its own build pipeline
aeos ticket approve AEOS-2 && aeos ticket run AEOS-2   # implementation
...

# 5. Only once every task is DONE can the epic advance
aeos ticket approve AEOS-1                             # → DOD_GATE
```

Nesting is one level deep: tasks hang off epics, and a task cannot itself have
children. Attempting to advance an epic out of `TASK_BREAKDOWN` while any child
is unfinished reports which tasks are outstanding and refuses the transition.

> Creating child tickets from `tasks.md` is a manual step today. Automating that
> decomposition belongs with the orchestrator, which owns scheduling.

## Orchestrator

`aeos orchestrator run <epicId>` drives an epic and its tasks without a human in
the loop, stopping the moment one is needed.

```bash
aeos orchestrator run AEOS-1 --budget 25
```

```
  AEOS-1: advanced BACKLOG → PRODUCT_SCOPING
  AEOS-1: run succeeded in 1 attempt(s)
  AEOS-1: advanced PRODUCT_SCOPING → TECH_SPEC
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

### Controls

| Command                                                             | Effect                                             |
| ------------------------------------------------------------------- | -------------------------------------------------- |
| `aeos orchestrator run <epicId> [--budget <usd>] [--max-steps <n>]` | Drive the epic; the budget persists for later runs |
| `aeos orchestrator pause <epicId>`                                  | Refuse to schedule new work for this epic          |
| `aeos orchestrator resume <epicId>`                                 | Allow scheduling again                             |
| `aeos orchestrator status [epicId]`                                 | Show status, last halt reason, and budget          |

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

Every executor invocation (both agent and reviewer) records token usage and cost to a local SQLite database at `~/.aeos/state.db`. All projects share one database, isolated by `project_id`.

`aeos ticket show <id>` surfaces this history back to the operator as an `Executions:` section showing the column, agent, executor, and model used.

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
