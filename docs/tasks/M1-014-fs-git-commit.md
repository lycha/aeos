# Task: Implement `gitCommit(message, files[])` Filesystem Helper

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** javascript-pro
**Method:** Manual (bootstrapping)

## Context
Wraps `simple-git` to produce structured commits in the `.aeos/.git` artifact repository. Every artifact write must be committed so the pipeline has a full history. Used by `aeos ticket create` and later by `aeos ticket run`. Requires `simple-git` (installed in M1-002).

## What needs to be done
Install if not already present: `npm install simple-git`

Implement in `src/infrastructure/git/simple-git-gateway.adapter.ts` as part of the `SimpleGitGateway` adapter (implements `GitGateway` port):

```typescript
/**
 * Stages the given files and commits them to the .aeos/.git repo.
 *
 * @param message  Commit message — must follow the structured format below
 * @param files    Array of absolute paths to stage (must be inside .aeos/)
 * @param root     Optional project root; defaults to projectRoot()
 */
export async function gitCommit(
  message: string,
  files: string[],
  root?: string,
): Promise<void>
```

Structured commit message format:
```
aeos(<ticketId>/<column>): <description>

[artifact: <artifactName>]
```
Example: `aeos(AEOS-1/BACKLOG): create ticket`

Implementation:
1. Initialise `simpleGit({ baseDir: aeosDir(root) })`
2. Stage only the specified files: `git.add(files)`
3. Commit with the structured message: `git.commit(message)`
4. If there is nothing to commit (no changes), skip silently

## Acceptance Criteria
- [ ] Given a new file in `.aeos/`, when calling `gitCommit()`, then a commit appears in `git -C .aeos log --oneline`
- [ ] Given the commit message, when inspecting `git log`, then it follows the structured `aeos(<id>/<column>):` format
- [ ] Given an empty diff (file unchanged), when calling `gitCommit()`, then no error is thrown and no empty commit is created
- [ ] Given a file outside `.aeos/`, when calling `gitCommit()`, then an error is thrown

## Out of Scope
- Pushing to a remote (`.aeos/.git` is local-only in v1)
- Branching or tagging within the artifact repo

## Technical Notes / Hints
- `simple-git` async API: all methods return Promises
- Check for empty diff: catch the `"nothing to commit"` error from `git.commit()` — `simple-git` throws a `GitError` in this case; inspect `err.message`

## Dependencies
- M1-002: `simple-git` available
- M1-012: `aeosDir()` helper

## Layer Mapping
```
Infrastructure:  src/infrastructure/git/simple-git-gateway.adapter.ts  — gitCommit() + GitGateway impl
Domain port:     src/domain/ports/driven/git-gateway.port.ts
```

## Definition of Done
- [ ] `gitCommit()` stages and commits correctly
- [ ] Empty diff handled without error
- [ ] Unit tests using a temp git repo (via `simple-git` init in test setup)
- [ ] Code reviewed and approved
