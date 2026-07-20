# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

AEOS is a CLI that drives tickets through LLM-agent pipelines. A ticket is an **epic** or a **task**, and each has its own column sequence:

- **epic** — `BACKLOG → PRODUCT_SCOPING → TECH_SPEC → TASK_BREAKDOWN → DOD_GATE → DONE`
- **task** — `BACKLOG → IMPLEMENTATION → CODE_REVIEW → QA → DONE`

Each column has a worker agent, a reviewer agent with rubrics, and a human approval gate. An epic decomposes into child tasks and cannot leave `TASK_BREAKDOWN` until every child is `DONE`. `aeos orchestrator run <epicId>` drives the whole thing autonomously. See `README.md` for the full command surface, state machine table, and executor matrix — that document is current; prefer it over re-deriving behaviour from code.

AEOS dogfoods itself: `.aeos/` in this repo is a live project directory (key `AEOS`), not fixtures.

## Commands

```bash
npm run build          # tsc → dist/
npm run dev            # tsc --watch
npm test               # vitest run
npm run test:watch
npm run test:coverage  # V8 coverage
npm run typecheck      # tsc --noEmit (strict)
npm run lint           # eslint + prettier --check
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

`src/application/ticket-run.use-case.ts` is the core. One `execute()` call runs the column cycle: eligibility → context → preflight → `WORKING` → **revision loop** → `IN_REVIEW` → `SIGNED_OFF`. The loop body (`runAttempt`) is worker → validate → commit artifact → reviewer → parse verdict; `decideNextAttempt` then says advance, retry, or escalate. It emits `ticket-run.*` events through a `TicketRunObserver`, which is what the Ink TUI renders live. Executors are injected as a `createExecutor(agentSpec)` factory, because worker and reviewer resolve to different executors within one run.

Two invariants that were previously violated and are easy to re-break:

1. **The reviewer verdict comes from a parsed trailer, never the prose.** `domain/services/verdict-parser.ts` reads an `AEOS-VERDICT` HTML comment. Substring-matching the review text misfires on the reviewer's own output-format template. A missing or unparseable trailer escalates — it is never coerced into a pass or a rejection.
2. **Escalation is not failure.** `SubState.ESCALATED` means the pipeline worked and needs a human (preflight blockers, iteration cap, non-convergence, unparseable verdict). `FAILED` means something broke. The orchestrator and `aeos ticket show` rely on the distinction.

### Loop termination

"Iterate until the reviewer approves" does not terminate on its own. Four guards in `domain/services/review-loop-policy.ts` make it finite: severity gate (only `REJECTED` blocks), iteration cap (`reviewLoop.maxIterations`, default 5, column spec overrides global), convergence detection (a retry reproducing the previous blocker topics escalates early), and the orchestrator's budget ceiling. Keep this function pure — it is the most heavily tested logic in the repo.

### Orchestrator

`src/application/orchestrator.use-case.ts` drives an epic and its tasks. **The scheduler is a pure function, not an LLM** (`domain/services/orchestrator-policy.ts` → `decideNextAction`): ask what to do, do exactly that one thing, ask again. Putting a model in the control path would make "why did this advance?" unanswerable from the transition log. Every loop exit is a named `HaltReason`, including the successful ones. Per-epic status, pause state, and budget live in `orchestrator_state` (migration v3).

### Specs, rubrics, and agents are data, not code

Column behaviour lives in YAML under a project's `.aeos/`:

- `.aeos/column-specs/*.yaml` — which worker/reviewer agent a column uses, execution mode, validation rules
- `.aeos/agents/*.yaml` — agent prompts and default executor/model
- `.aeos/rubrics/` — reviewer rubrics
- `.aeos/CONSTRAINTS.md` — project-specific architecture/style/security rules injected into agent context

Changing pipeline behaviour usually means editing YAML, not TypeScript. Loaders validate with Zod (`infrastructure/spec-loader/`).

`templates/` at the package root holds the starter copies of `column-specs/`, `agents/`, and `rubrics/` that `aeos project init` scaffolds into a new project (`infrastructure/filesystem/template-source.ts`). They are plain YAML/Markdown rather than embedded strings, and ship via the `files` field in `package.json`. **Adding a column means adding its template spec too** — otherwise a fresh project fails on its first `ticket run` when a ticket reaches that column. `template-source.test.ts` guards this by scaffolding a temp project and asserting every column spec loads and its agents and rubrics resolve.

### State

- **SQLite at `~/.aeos/state.db`** — the source of truth for tickets, transitions, and costs. All projects share one DB, isolated by `project_id`. Path overridable via `AEOS_HOME`.
- **`<project>/.aeos/tickets/<ticketId>/`** — artifacts, named `<ticketId>-<artifact>.md`. Ticket state is mirrored into a markdown file on disk via `syncTicketDocument`, but **git carries artifacts only** — no commit on sub-state transitions. SQLite is authoritative for state; committing every transition buried the artifact history a human actually reads. Don't reintroduce `[STATE]` commits.
- `Ticket` carries `kind` (`EPIC`/`TASK`) and `parentId`. Migration v2 backfills existing rows as epics and folds retired `ARCH_SPIKE` tickets into `TECH_SPEC`. Migrations must be idempotent — `ALTER TABLE ADD COLUMN` is not, so guard with `hasColumn`.

### Executors

`Executor` (`domain/ports/driven/executor.port.ts`) is a two-method port: `run(invocation)` and `interrupt()`. Adapters in `infrastructure/executor/` spawn external CLIs. Resolution order for a run is override flags → `.aeos/project.json` → agent spec → built-in default (see `ExecutorConfigResolver`).

Only `claude-cli`, `auggie-cli`, `opencode-cli`, and `stub` support agentic `IMPLEMENTATION`; `ollama-cli` is artifact-only and is rejected for those runs. Agentic implementation runs must leave a real git diff or validation fails.

Set `AEOS_EXECUTOR=stub` to exercise the pipeline without real LLM calls. The stub is role-aware by output path: it answers `NO_BLOCKERS` for preflight, emits an `AEOS-VERDICT` trailer for reviews, and pads its artifact past `minWordCount`. If you change the verdict contract or raise a word count, update the stub too — otherwise `AEOS_EXECUTOR=stub` silently stops working, and no unit test will catch it because they all mock the executor.

## Conventions

- ESM throughout (`"type": "module"`, `module: NodeNext`). **Relative imports must carry the `.js` extension**, including from `.ts` sources.
- Each layer has a barrel `index.ts`; import across layers through those.
- Tests are colocated (`*.test.ts` next to the source). `*.smoke-test.ts` files are excluded from the Vitest `include` glob and run via tsx.
- TUI components are `.tsx` and tested with `ink-testing-library`.
- ESLint: `@typescript-eslint/no-explicit-any` is an **error**; `no-console` warns (CLI output goes through Ink or explicit writers, not stray `console.log`).
- TypeScript is `strict`.
