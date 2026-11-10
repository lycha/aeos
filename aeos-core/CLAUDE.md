# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

AEOS is a CLI that drives tickets through LLM-agent pipelines. A ticket is an **epic** or a **task**, and each has its own column sequence:

- **epic** — `BACKLOG → SPEC_REVIEW → TECH_SPEC → TASK_BREAKDOWN → INTEGRATION_REVIEW → DOD_GATE → DONE`
- **task** — `BACKLOG → IMPLEMENTATION → CODE_REVIEW → QA → DONE`

`SPEC_REVIEW` reviews a spec a person wrote (`spec-reviewer-agent` → `spec-review.md`: gaps, ambiguities, contradictions, untestable criteria); it never drafts requirements, and approving out of it is the spec gate. `ticket create` refuses an epic without `--spec`. Each column has a worker agent, a reviewer agent with rubrics, and a human approval gate. An epic decomposes into child tasks and cannot leave `TASK_BREAKDOWN` until every child is `DONE`. `aeos orchestrator run <epicId>` drives the whole thing autonomously. See `README.md` for the full command surface, state machine table, and executor matrix — that document is current; prefer it over re-deriving behaviour from code.

AEOS dogfoods itself: `.aeos/` in this repo is a live project directory (key `AEOS`), not fixtures.

## Commands

```bash
npm run build          # refresh templates/schemas, then tsc → dist/
npm run dev            # tsc --watch
npm test               # vitest run
npm run test:watch
npm run test:coverage  # V8 coverage
npm run typecheck      # tsc --noEmit (strict)
npm run lint           # schemas:check + eslint + prettier --check
npm run lint:fix
```

Run a single test file or case:

```bash
npx vitest run src/application/ticket-run.use-case.test.ts
npx vitest run -t "rejects agentic run"
```

Smoke tests shell out to real external CLIs (`claude`, `auggie`, `opencode`) and cost money — they are not part of `npm test`:

```bash
npm run smoke-test            # claude
npm run smoke-test:auggie
npm run smoke-test:opencode
```

CI (`.github/workflows`) runs typecheck → lint → build → test on Node 22. Match that order locally before pushing.

## Architecture

Hexagonal, with a strictly enforced dependency direction:

```
cli/ → application/ → domain/ ← infrastructure/
```

- **`src/domain/`** — pure. Zero external imports, no I/O. Contains `model/` (Ticket, Column, SubState, specs, events), `services/` (`state-machine.ts`, `output-validation.ts`), and `ports/` split into `driving/` (use-case interfaces the CLI calls) and `driven/` (interfaces infrastructure implements).
- **`src/application/`** — use cases, one per CLI verb (`ticket-run.use-case.ts`, `ticket-approve.use-case.ts`, …), plus `services/` for context assembly, prompt building, preflight, decision promotion, and executor-config resolution.
- **`src/infrastructure/`** — adapters: `persistence/` (better-sqlite3), `filesystem/`, `git/` (simple-git), `executor/`, `spec-loader/` (YAML + Zod).
- **`src/cli/`** — Commander.js commands in `commands/`, the Ink/React TUI in `ui/`, and the composition root `container.ts`.

When adding a capability, the shape is: driving port → use case → driven port(s) → adapter(s) → wire in `container.ts` → Commander command. Adding an import of Node built-ins or npm packages into `domain/` is a layering violation.

### Composition root

`src/cli/container.ts` builds everything eagerly _except_ SQLite repositories, which are lazy singletons. This is deliberate: `aeos install` and `aeos project init` must run before `~/.aeos/state.db` exists, so touching `getDb()` at container-construction time would break first-run. Keep new DB-backed dependencies lazy.

### TicketRunUseCase

`src/application/ticket-run.use-case.ts` is the core. One `execute()` call runs the column cycle: eligibility → context → preflight → `WORKING` → **revision loop** → `IN_REVIEW` → `SIGNED_OFF`. The loop body (`runAttempt`) is worker → validate → checks → commit artifact → reviewer → parse verdict; `decideNextAttempt` then says advance, retry, or escalate. It emits `ticket-run.*` events through a `TicketRunObserver`, which is what the Ink TUI renders live. Executors are injected as a `createExecutor(agentSpec)` factory, because worker and reviewer resolve to different executors within one run.

Two invariants that were previously violated and are easy to re-break:

1. **The reviewer verdict comes from a parsed trailer, never the prose.** `domain/services/verdict-parser.ts` reads an `AEOS-VERDICT` HTML comment. Substring-matching the review text misfires on the reviewer's own output-format template. A missing or unparseable trailer escalates — it is never coerced into a pass or a rejection.
2. **Escalation is not failure.** `SubState.ESCALATED` means the pipeline worked and needs a human (preflight blockers, iteration cap, non-convergence, unparseable verdict). `FAILED` means something broke. The orchestrator and `aeos ticket show` rely on the distinction.

### Checks stage

On a column whose spec has `runChecks: true`, the `checks` list of `.aeos/project.json` runs after validation and before the artifact commit (`runChecks` in `TicketRunUseCase`). A check is the `Check` interface in `domain/model/check.ts`, not a command: `CheckRegistry` (`application/checks/`) builds one `ShellCheck` per configured entry and appends anything passed to `register()`, and **the stage must never assume a check is a process** — command strings and exit codes live in `ShellCheck` and the `ChecksRunner` adapter (`infrastructure/checks/`) only. That is the seam for in-process checks. A failure returns the `checks-failed` outcome: the reviewer is not invoked, `decideNextAttempt` treats it as a rejection with blocker topic `check:<name>` (and never as `mark_done`), and the next worker gets the output as `previous-checks.md`. A pass writes `<ticket>-checks.md` into the ticket directory, which is how it reaches the reviewer's re-assembled context. Each stage writes a run record (`role: checks`, `executor: shell`, no brief).

### Protected paths

`TicketRunUseCase` snapshots `gitGateway.changedFiles` of both repositories (the project and `.aeos/`) immediately before each executor invocation and again immediately after (`changedPaths` / `restoreProtected`); the worker's snapshot is taken after the `[BASELINE]` commit. New entries matching `protectedGlobs` (`domain/services/path-guard.ts`: built-in defaults plus `protectedPaths` from `project.json`, which can only add) are restored with `restoreFiles` and the attempt returns `failed` with the files named, also in the run record's `error`. Keep the window tight around the executor call: the engine writes under `.aeos/tickets/` itself straight afterwards. `AEOS_STUB_TOUCH=<path>` makes a stub worker run edit that file, for tests.

### Branches, commits and pull requests

Engine commits never land on the default branch. The orchestrator isolates an epic on `aeos/<epicId>` (`setUpGitIsolation`); `TicketRunUseCase.isolateTask` does the same for a standalone task (`aeos/<taskId>`, tag `aeos-base/<taskId>`) and refuses a child task whose `HEAD` is the default branch. `TicketApproveUseCase` commits a finished task with `buildTaskCommitMessage` (`application/services/pull-request-text.ts`; `Ticket:`/`Epic:` trailers, extra trailers as an argument), then, **before the column transition**, pushes `aeos/<id>` and opens the pull request through the `PullRequestGateway` port: an epic leaving `INTEGRATION_REVIEW`, a standalone task reaching `DONE`. The order matters: a failure returns an error with the ticket still `SIGNED_OFF`, so re-running approve retries; the orchestrator halts `NEEDS_HUMAN` on any failed approval instead of looping on it. The URL is stored in `tickets.pr_url` (migration v8). `GhPullRequestGateway` (`infrastructure/pull-request/`) shells out to `gh` through an injectable runner, which is how its tests avoid starting a process; the container picks `StubPullRequestGateway` under `AEOS_EXECUTOR=stub`. `"pullRequests": { "enabled": false }` in `project.json` skips push and pull request. Never call the real `gh` or push from a test.

### Spec pin

`ticket create --spec <feature>` backs an epic with `features/<feature>/` of the artefact tree. `TicketCreateUseCase.pinSpec` checks, in order: the directory and its `spec.md`/`decisions.yaml` exist, the schema, the linter, no `ESCALATED` outcome, no uncommitted change under the feature; then pins `{ repo: '<key>-aeos', commit: <.aeos HEAD>, path: 'features/<feature>' }` (`domain/model/spec-pin.ts`). The schema and lint passes are one run of the seeded `lint_decisions.py` behind the `DecisionsLint` port (`infrastructure/spec/decisions-lint.adapter.ts`, injectable runner; it refuses to run without `python3`, `PyYAML` and `jsonschema`, because the linter would otherwise skip the schema pass silently). There is no JSON Schema validator among the runtime dependencies; `ajv` is a dev dependency for tests only. Only `spec_feature` and `spec_commit` are stored (migration v9). **A task's pin is never copied**: always go through `resolveSpecPin` (`application/services/spec-pin.ts`), which falls back to the parent epic. It feeds `ticket show` (with the "spec has moved" warning from `GitGateway.pathChangedSince`), the `Spec:` commit trailer, the pull request body and `spec_pin` of every run record.

`TicketRunUseCase` passes the resolved pin to every `ContextAssembler.assemble` call. For a pinned ticket the assembler fills `AssembledContext.spec`/`specPin` from `spec.md`, `decisions.yaml`, each `features/*.feature` and the context's `glossary.md`, and appends the context's `CONSTRAINTS.md` after the project's. **It reads them only with `gitGateway.showFile`/`listFiles` at the pinned commit, never from the working tree, and never falls back**: an unreadable pin throws, and the run returns `failed` before anything executes. `buildContextSection` renders them as `## Specification (pinned <repo>@<short commit>)`, first in the context. With no pin the prompt is byte-identical to what it was; `prompt-builder.test.ts` holds that.

### Gate records

Every human decision is a `GateRecord` (`domain/model/gate-record.ts`, mirroring the human-owned `gates.schema.json`) appended by `GateRecorder` (`application/services/gate-recorder.ts`) through the `GateRecordStore` port. `FsGateRecordStore` appends as text (`records:` is the file's last key, so earlier records are never rewritten), numbers `GATE-<n>` per file and commits: `features/<feature>/gates.yaml` for a spec-backed ticket, `tickets/<id>/<id>-gates.yaml` otherwise. **The record is written before ticket state changes**; the recorder throws on a missing git identity (`GitGateway.userIdentity` of the project repository), a missing or short reason on an override or rejection, or a failed write, and the use case then leaves state alone. `approve`, `dod-approve`, `sign-off`, `move`, `answer` and `resolve` each call it; `approve` checks the identity first (`decidedBy`) and records last, after the pull request, so a failed pull request leaves no approval on record. The orchestrator passes `{ byEngine: true }` to approve, which records nothing: an auto advance is not a human decision. The `spec` gate keys on the column name `SPEC_REVIEW` until I1-M4-005a gives columns roles. Because `gates.yaml` sits in the feature directory, `ticket show` excludes it from the "spec has moved" check, and the context assembler keeps `<id>-gates.yaml` out of prior artifacts.

### Loop termination

"Iterate until the reviewer approves" does not terminate on its own. Four guards in `domain/services/review-loop-policy.ts` make it finite: severity gate (only `REJECTED` blocks), iteration cap (`reviewLoop.maxIterations`, default 5, column spec overrides global), convergence detection (a retry reproducing the previous blocker topics escalates early), and the orchestrator's budget ceiling. Keep this function pure — it is the most heavily tested logic in the repo.

### Orchestrator

`src/application/orchestrator.use-case.ts` drives an epic and its tasks. **The scheduler is a pure function, not an LLM** (`domain/services/orchestrator-policy.ts` → `decideNextAction`): ask what to do, do exactly that one thing, ask again. Putting a model in the control path would make "why did this advance?" unanswerable from the transition log. Every loop exit is a named `HaltReason`, including the successful ones. Per-epic status, pause state, and budget live in `orchestrator_state` (migration v3).

**Unknown cost is `null`, never `0`.** `cost_records.cost_known` (migration v6) carries it; rows from before that migration read back as unknown. `reportsCost` in `domain/services/executor-capabilities.ts` says which executors report (`claude-cli`, `stub`). A budget is refused up front if any agent of a column still ahead resolves to one that does not (the epic's current and later columns; each task column unless the epic is past `TASK_BREAKDOWN` and every child is past it), and the policy halts with `COST_UNKNOWN` if a budgeted epic still ends up with a `null` cost record; `aeos orchestrator clear-budget <epicId>` (`OrchestratorPort.clearBudget`) sets the persisted budget to `null`, which is the only way out, since the `null` record stays. A failed executor run also records `null`. Each cost record carries its `role` (`preflight`/`worker`/`reviewer`, migration v7; absent on older rows); `aeos costs` (`costs.use-case.ts`) aggregates across all projects from the global DB and never folds an unknown cost into a total.

### Specs, rubrics, and agents are data, not code

Column behaviour lives in YAML under a project's `.aeos/`:

- `.aeos/column-specs/*.yaml` — which worker/reviewer agent a column uses, execution mode, validation rules
- `.aeos/agents/*.yaml` — agent prompts and default executor/model
- `.aeos/rubrics/` — reviewer rubrics
- `.aeos/CONSTRAINTS.md` — project-specific architecture/style/security rules injected into agent context

Changing pipeline behaviour usually means editing YAML, not TypeScript. Loaders validate with Zod (`infrastructure/spec-loader/`).

`templates/` at the package root holds the starter copies of `column-specs/`, `agents/`, and `rubrics/` that `aeos project init` scaffolds into a new project (`infrastructure/filesystem/template-source.ts`). They are plain YAML/Markdown rather than embedded strings, and ship via the `files` field in `package.json`. **Adding a column means adding its template spec too** — otherwise a fresh project fails on its first `ticket run` when a ticket reaches that column. `template-source.test.ts` guards this by scaffolding a temp project and asserting every column spec loads and its agents and rubrics resolve. Removing a template means adding its path to `RETIRED_TEMPLATES` in `project-sync.use-case.ts`, so `aeos project sync` reports a project's leftover copy as `obsolete` (reported, never deleted).

`.aeos/` is also the project's **artefact tree** (decision D1): `features/<feature>/` holds a human-written spec, `contexts/<context>/` a glossary and constraints, `schemas/` the artefact schemas. `ArtefactTree` (`domain/ports/driven/artefact-tree.port.ts`) resolves its root: `artefactTree` in `project.json`, default `.aeos`. The schemas have one authored copy, `plugins/artefact-tree-pipeline/schemas/`. `templates/schemas/` is a generated copy made by `npm run build` (it runs the plugin's `seed-schemas.mjs`, which also writes the `.source` stamp); `npm run lint` fails when it is stale. Because it sits under `templates/`, `project init` seeds it and `project sync` reports drift like any other template. Never edit `templates/schemas/` by hand. The spec skills live in the same plugin; `aeos-core/skills/aeos/` is a different thing.

`skills/aeos/SKILL.md` (also shipped via `files`) teaches an agentic executor to drive the `aeos` CLI. `project init` copies it to `.aeos/skills/aeos/` and relative-symlinks it into each executor's skills dir (`.claude/skills`, `.augment/skills` — see `skill-source.ts`). The **portable** carrier of the decomposition instruction is the architect's `taskInstruction` (in the prompt, so every executor gets it); the skill is reinforcement for skill-aware backends. This is how `TASK_BREAKDOWN` decomposition works: that column is **agentic**, and the architect calls `aeos ticket create --parent <epic> --key T-NNN` to create the child tasks itself rather than AEOS parsing them out of an artifact. `requiresRepoDiff: false` on that column stops the agentic diff check (which enforces the IMPLEMENTATION guarantee) from failing a run that creates tickets rather than editing the repo.

`ticket create` is idempotent under a parent: it keys on `--key` (the task's stable `T-NNN` label) when given, else the title (and, as a bridge, a keyless prior child with a matching title). The key matters because a review-loop retry re-runs the _agent_, which may rephrase a task's title — title-only dedup would then duplicate it; the key survives the rephrase (`task_key`, migration v4). A key match leaves the existing task **unchanged** (a reworded title is not applied), and each task must have a **distinct** key — a reused key collapses two tasks into one. Both constraints are stated in the architect prompt and skill. The orchestrator needs no special decomposition step: children created during the run are picked up by its existing "drive all children" logic on the next tick; `AWAITING_DECOMPOSITION` remains only as the fallback when none appear (e.g. under `AEOS_EXECUTOR=stub`, which can't shell out). Tickets are created mid-run, before the breakdown is reviewed — the key keeps retries from accumulating, but a breakdown that is _abandoned_ after removing a task leaves an orphan child in `BACKLOG`; the epic's DONE-join lists it, and the operator clears it with `aeos ticket move <id> DONE --reason "…"`. Auto-deleting is deliberately avoided.

### State

- **SQLite at `~/.aeos/state.db`** — the source of truth for tickets, transitions, and costs. All projects share one DB, isolated by `project_id`. Path overridable via `AEOS_HOME`.
- **`<project>/.aeos/tickets/<ticketId>/`** — artifacts, named `<ticketId>-<artifact>.md`. Ticket state is mirrored into a markdown file on disk via `syncTicketDocument`, but **git carries artifacts only** — no commit on sub-state transitions. SQLite is authoritative for state; committing every transition buried the artifact history a human actually reads. Don't reintroduce `[STATE]` commits.
- **`<project>/.aeos/tickets/<ticketId>/runs/`** — one run record per executor invocation or checks stage (`<run_id>.json`, `.brief.md`, `.log`; a checks record has no brief), written by `writeRunRecord` in `TicketRunUseCase` through `RunRecordStore`, on success and failure alike. `domain/model/run-record.ts` mirrors the human-owned `run-record.schema.json` field for field; the end-to-end test validates every record against it. A record is committed with the artifact it produced (which ends with an `AEOS-RUN` link to it), or alone when there is none. Preflight is recorded by wrapping the executor handed to `PreflightService`.
- `Ticket` carries `kind` (`EPIC`/`TASK`) and `parentId`. Migration v2 backfills existing rows as epics and folds retired `ARCH_SPIKE` tickets into `TECH_SPEC`. Migration v10 renames `PRODUCT_SCOPING` to `SPEC_REVIEW` in `tickets`, `transitions` and `cost_records`, and sets an epic it finds there with no pin `ESCALATED` (`SPEC_REQUIRED`). Migrations must be idempotent — `ALTER TABLE ADD COLUMN` is not, so guard with `hasColumn`.

### Executors

`Executor` (`domain/ports/driven/executor.port.ts`) is a two-method port: `run(invocation)` and `interrupt()`. Adapters in `infrastructure/executor/` spawn external CLIs. Resolution order for a run is override flags → `.aeos/project.json` → agent spec → built-in default (see `ExecutorConfigResolver`).

Only `claude-cli`, `auggie-cli`, `opencode-cli`, and `stub` support agentic `IMPLEMENTATION`; `ollama-cli` is artifact-only and is rejected for those runs. Agentic implementation runs must leave a real git diff or validation fails.

Set `AEOS_EXECUTOR=stub` to exercise the pipeline without real LLM calls. The container reads the variable and passes it to `ExecutorConfigResolver`, which then resolves every agent to `stub`, so run records, cost records and the budget refusal all see `stub`. The stub is role-aware by output path: it answers `NO_BLOCKERS` for preflight, emits an `AEOS-VERDICT` trailer for reviews (a worker artifact named `<id>-{spec,code,integration}-review.md` is not one), and pads its artifact past `minWordCount`. If you change the verdict contract or raise a word count, update the stub too — otherwise `AEOS_EXECUTOR=stub` stops working. Unit tests mock the executor and will not notice; `src/e2e/pipeline.e2e.test.ts` will. It drives an epic, its tasks and a standalone task to `DONE` through the real CLI with the stub, in a temp `AEOS_HOME` and project, and runs in `npm test`. Build new end-to-end cases on `src/e2e/harness.ts`. The stub itself writes no repository change, so the harness wraps it to add one on `IMPLEMENTATION` runs; without that wrapper a stub `IMPLEMENTATION` run fails the git-diff guarantee.

## Conventions

- ESM throughout (`"type": "module"`, `module: NodeNext`). **Relative imports must carry the `.js` extension**, including from `.ts` sources.
- Each layer has a barrel `index.ts`; import across layers through those.
- Tests are colocated (`*.test.ts` next to the source). `*.smoke-test.ts` files are excluded from the Vitest `include` glob and run via tsx.
- TUI components are `.tsx` and tested with `ink-testing-library`.
- ESLint: `@typescript-eslint/no-explicit-any` is an **error**; `no-console` warns (CLI output goes through Ink or explicit writers, not stray `console.log`).
- TypeScript is `strict`.
