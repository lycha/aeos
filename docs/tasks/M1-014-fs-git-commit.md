# Task: Implement `gitCommit(message, files[])` Filesystem Helper

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** javascript-pro
**Method:** Manual (bootstrapping)

## Context
Wraps `simple-git` to produce structured commits in the `.aeos/.git` artifact repository. Every artifact write must be committed so the pipeline has a full history. Used by `aeos ticket create` and later by `aeos ticket run`. This task owns the `simple-git` dependency installation.

## What needs to be done
Install: `npm install simple-git`

Implement in `src/infrastructure/git/simple-git-gateway.adapter.ts` as part of the `SimpleGitGateway` adapter (implements `GitGateway` port):

```typescript
/**
 * Stages the given files and commits them to the .aeos/.git repo.
 * Format-agnostic — message format construction is the caller's responsibility.
 *
 * @param message  Commit message (any string — callers use the system design format)
 * @param files    Array of absolute paths to stage (must be inside .aeos/)
 * @param root     Optional project root; defaults to projectRoot()
 */
export async function gitCommit(
  message: string,
  files: string[],
  root?: string,
): Promise<void>
```

> **Commit message convention (for callers, not enforced here):**
> The system design (Section 3.3) defines: `[TICKET-ID][ARTIFACT][vN][AGENT][action: reason]`
> Example: `[AEOS-1][TICKET][v1][human][create]`
> `gitCommit()` commits the message verbatim — format validation belongs in the use case layer.

Implementation:
1. Initialise `simpleGit({ baseDir: aeosDir(root) })`
2. Stage only the specified files: `git.add(files)`
3. Commit with the message: `git.commit(message)`
4. If there is nothing to commit (no changes), skip silently

## Acceptance Criteria
- [ ] Given a new file in `.aeos/`, when calling `gitCommit()`, then a commit appears in `git -C .aeos log --oneline`
- [ ] Given message `[AEOS-1][TICKET][v1][human][create]`, when inspecting `git log`, then the commit message is stored verbatim
- [ ] Given an empty diff (file unchanged), when calling `gitCommit()`, then no error is thrown and no empty commit is created
- [ ] Given a file outside `.aeos/`, when calling `gitCommit()`, then an error is thrown
- [ ] Given a corrupt `.aeos/.git` (e.g. deleted), when calling `gitCommit()`, then a descriptive error is thrown (not an unhandled `GitError`)

## Out of Scope
- Pushing to a remote (`.aeos/.git` is local-only in v1)
- Branching or tagging within the artifact repo

## Technical Notes / Hints
- `simple-git` async API: all methods return Promises
- Check for empty diff: catch the `"nothing to commit"` error from `git.commit()` — `simple-git` throws a `GitError` in this case; inspect `err.message`
- Wrap `git.add()` and `git.commit()` in try/catch. On `GitError` with `"nothing to commit"`, return silently. On all other `GitError` types, re-throw with a descriptive message: `Error: Git commit failed in .aeos/: <original message>`. Callers catch this at the use case or CLI command level.
- `gitCommit()` does NOT validate or enforce the commit message format — it commits the message verbatim. The system design format (`[TICKET-ID][ARTIFACT][vN][AGENT][action]`) is constructed by callers in the use case layer.

## Dependencies
- M1-012: `aeosDir()` helper

## Layer Mapping
```
Infrastructure:  src/infrastructure/git/simple-git-gateway.adapter.ts  — gitCommit() + GitGateway impl
Domain port:     src/domain/ports/driven/git-gateway.port.ts
```

## Definition of Done
- [ ] `gitCommit()` stages and commits correctly
- [ ] Commit message stored verbatim (format-agnostic)
- [ ] Empty diff handled without error
- [ ] Git failures throw descriptive errors
- [ ] Unit tests using a temp git repo (via `simple-git` init in test setup)
- [ ] Code reviewed and approved
