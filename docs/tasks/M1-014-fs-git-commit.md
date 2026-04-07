# Task: Implement `commitFiles()` Filesystem Helper (GitGateway)

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** javascript-pro
**Method:** Manual (bootstrapping)

## Context
Uses `execFileSync` from `node:child_process` to produce structured commits in the `.aeos/.git` artifact repository. Every artifact write must be committed so the pipeline has a full history. Used by `aeos ticket create` and later by `aeos ticket run`.

## What needs to be done
Implement in `src/infrastructure/git/simple-git-gateway.adapter.ts` as part of the `SimpleGitGateway` adapter (implements `GitGateway` port):

```typescript
interface GitGateway {
  init(dir: string): void;
  commit(dir: string, message: string): void;
  commitFiles(dir: string, files: string[], message: string): void;
}
```

> **Commit message convention (for callers, not enforced here):**
> The system design (Section 3.3) defines: `[TICKET-ID][ARTIFACT][vN][AGENT][action: reason]`
> Example: `[AEOS-1][TICKET][v1][human][create]`
> `commitFiles()` commits the message verbatim — format validation belongs in the use case layer.

The primary method owned by this task is `commitFiles()`. The port also exposes `init()` (used by M1-002) and `commit()` (stage-all variant, used by M1-003), both implemented in the same adapter.

Implementation (for `commitFiles`):
1. Validate all files are inside `dir`
2. Stage only the specified files: `execFileSync('git', ['add', '--', ...files], { cwd: dir })`
3. Commit with the message: `execFileSync('git', ['commit', '-m', message], { cwd: dir })`
4. If there is nothing to commit (no changes), skip silently

## Acceptance Criteria
- [ ] Given a new file in `.aeos/`, when calling `commitFiles()`, then a commit appears in `git -C .aeos log --oneline`
- [ ] Given message `[AEOS-1][TICKET][v1][human][create]`, when inspecting `git log`, then the commit message is stored verbatim
- [ ] Given an empty diff (file unchanged), when calling `commitFiles()`, then no error is thrown and no empty commit is created
- [ ] Given a file outside `.aeos/`, when calling `commitFiles()`, then an error is thrown
- [ ] Given a corrupt `.aeos/.git` (e.g. deleted), when calling `commitFiles()`, then a descriptive error is thrown (not an unhandled exception)

## Out of Scope
- Pushing to a remote (`.aeos/.git` is local-only in v1)
- Branching or tagging within the artifact repo

## Technical Notes / Hints
- Uses `execFileSync` from `node:child_process` — synchronous, matching the `better-sqlite3` sync pattern used elsewhere in the codebase. No additional npm dependency required.
- Check for empty diff: catch the error from `execFileSync('git', ['commit', ...])` and inspect the stderr/message for `"nothing to commit"`. Return silently in that case.
- Wrap `execFileSync` calls in try/catch. On `"nothing to commit"`, return silently. On all other errors, re-throw with a descriptive message: `Error: Git commit failed in .aeos/: <original message>`. Callers catch this at the use case or CLI command level.
- `commitFiles()` does NOT validate or enforce the commit message format — it commits the message verbatim. The system design format (`[TICKET-ID][ARTIFACT][vN][AGENT][action]`) is constructed by callers in the use case layer.
- The `git` binary must be available on PATH. Availability is validated by M1-002 (`aeos project init`) — no redundant check is needed here.

## Dependencies
- M1-012: `aeosDir()` helper

## Layer Mapping
```
Infrastructure:  src/infrastructure/git/simple-git-gateway.adapter.ts  — SimpleGitGateway adapter (GitGateway impl)
Domain port:     src/domain/ports/driven/git-gateway.port.ts           — GitGateway interface
```
Port methods: `init(dir)` (used by M1-002), `commit(dir, message)` (stage-all, used by M1-003), `commitFiles(dir, files, message)` (file-scoped, owned by this task).

## Definition of Done
- [ ] `commitFiles()` stages and commits correctly
- [ ] Commit message stored verbatim (format-agnostic)
- [ ] Empty diff handled without error
- [ ] Git failures throw descriptive errors
- [ ] Unit tests using a temp git repo (via `execFileSync('git', ['init'])` in test setup)
- [ ] Code reviewed and approved
