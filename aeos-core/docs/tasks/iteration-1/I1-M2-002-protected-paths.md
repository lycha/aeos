# Task: Protected Paths

**Milestone:** I1-M2 — Guard
**Plan package:** 2.2
**Agent:** typescript-pro
**Method:** Agentic implementation, test-first
**Size:** M
**Human-owned inputs:** none

## Context
"Everything an agent is judged against … is defined outside the agent's workspace, so an agent cannot weaken the checks it has to pass." That is not true today. An agentic Claude run is started with `--allowedTools Bash,Glob,Grep,LS,Read,Edit,MultiEdit,Write` in the project root, and `.aeos/rubrics/`, `.aeos/column-specs/`, `.aeos/agents/` and `.aeos/project.json` are ordinary files beneath it. An agent rewarded for a passing review can edit the rubric.

Sandboxing differs per executor. A diff check after the run works for all of them.

## What needs to be done
1. **Configuration.** Add `protectedPaths: string[]` (globs, relative to the project root) to `.aeos/project.json`. Built-in defaults are always applied and cannot be removed by configuration:
   ```
   .aeos/project.json
   .aeos/pipelines.yaml
   .aeos/CONSTRAINTS.md
   .aeos/rubrics/**
   .aeos/column-specs/**
   .aeos/agents/**
   .aeos/schemas/**
   .aeos/features/**
   .aeos/contexts/**
   .aeos/tickets/*/runs/**
   ```
2. **Pure matcher.** A small glob matcher in `src/domain/services/path-guard.ts` supporting `*`, `**` and literal segments. No npm dependency: `domain/` may not import one. Export `findViolations(changedPaths, globs)`.
3. **Git gateway.** Add `changedFiles(dir): string[]` (tracked modifications, staged changes and untracked files, from porcelain status) and `restoreFiles(dir, paths)` (checkout tracked paths, delete untracked ones).
4. **Snapshot and compare.** `.aeos/` is its own repository, ignored by the project's. So take the changed-file set of **both** repositories before each executor invocation and again after. The difference is what the run touched.
5. **Enforce.** After every executor invocation (worker and reviewer, artifact and agentic), compute violations against the protected globs. On any violation: restore those paths, mark the attempt `failed` with an error listing each file, and write the run record with the violation in `error`. This is `FAILED`, not `ESCALATED`: the agent broke a rule.
6. **Engine writes are not violations.** The engine itself writes under `.aeos/tickets/` after the executor returns. Only compare the window around the executor call.
7. **Decomposition.** At `TASK_BREAKDOWN` the agent legitimately runs `aeos ticket create`, which writes `.aeos/tickets/<new>/`. That path is not protected; `runs/` beneath it is.

## Acceptance Criteria
- [ ] Given a stub worker that edits `.aeos/rubrics/structure/code-structure.md`, when the attempt ends, then it is `FAILED`, the error names that file, and the file is restored
- [ ] Given a worker that creates a new file under `.aeos/column-specs/`, when the attempt ends, then the file is deleted and the attempt fails
- [ ] Given a worker that edits `src/` only, when the attempt ends, then there is no violation
- [ ] Given a file that was already modified before the run, when the run does not touch it, then it is not reported
- [ ] Given `protectedPaths: ["src/cli/generated/**"]` in configuration, when a worker edits a file there, then it is a violation
- [ ] Given configuration that tries to list a default as unprotected, when loaded, then the default still applies
- [ ] Given `findViolations` with `**`, `*` and literal patterns, when tested, then matches follow the documented rules

## Out of Scope
- Preventing the write in the first place (per-executor permission rules). Worth doing later for Claude via `--settings`; detection comes first because it is universal.
- Read protection. Agents may read rubrics (Kerckhoffs's principle).

## Technical Notes / Hints
- The agentic path already calls `gitGateway.commitAll(projectPath, '[BASELINE] …')` on attempt 1 and `stageAll` before the diff check. Take the "before" snapshot after the baseline commit, or baselined files will look untouched.
- Add a stub hook for tests: an environment variable naming a file for the stub to touch, off by default.
- Later tasks append to the protected set: generated code (I1-M4-004b), the CLI contract (I1-M4-004a).

## Layer Mapping
```
Domain svc:  src/domain/services/path-guard.ts
Domain port: src/domain/ports/driven/git-gateway.port.ts
Adapter:     src/infrastructure/git/simple-git-gateway.adapter.ts
Model:       src/domain/model/project-executor-config.ts
Application: src/application/ticket-run.use-case.ts, services/preflight.ts
```

## Dependencies
- I1-M0-001: the end-to-end harness, extended with a violating stub run

## Definition of Done
- [ ] Common Definition of Done in `README.md`
- [ ] End-to-end test covers one violation in each repository (project and `.aeos`)
