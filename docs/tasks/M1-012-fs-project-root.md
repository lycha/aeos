# Task: Implement `projectRoot()` Filesystem Helper

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** typescript-pro
**Method:** Manual (bootstrapping)

## Context
Walks up the directory tree from the current working directory to find the nearest `.aeos/` directory. Used by every ticket command to locate the project. Analogous to how `git` finds `.git/`. Requires M0-002 (TypeScript configured).

## What needs to be done
Implement in `src/infrastructure/filesystem/fs-project.repository.ts` as part of the `FsProjectRepository` adapter (implements `ProjectRepository` port). The `projectRoot()` function is an infrastructure concern — it walks the filesystem. Export it from the adapter or as a utility used internally by the adapter.

```typescript
/**
 * Walks up from `startDir` (defaults to process.cwd()) looking for .aeos/.
 * Returns the absolute path of the directory containing .aeos/.
 * Throws ProjectRootNotFoundError if none is found before hitting filesystem root.
 */
export function projectRoot(startDir?: string): string

export class ProjectRootNotFoundError extends Error {}
```

Algorithm:
1. Start at `startDir ?? process.cwd()`
2. Check if `<current>/.aeos/` exists (use `fs.existsSync`)
3. If yes: return `current`
4. If no: move to `path.dirname(current)`
5. If `dirname(current) === current` (filesystem root): throw `ProjectRootNotFoundError`

Also implement in the adapter:
```typescript
export function aeosDir(root?: string): string  // returns projectRoot() + '/.aeos'
```

> **Note:** `stateDbPath()` is no longer needed — the DB is global at `~/.aeos/state.db`, not per-project. Use `aeosHomePath('state.db')` from M1-011 instead.

## Acceptance Criteria
- [ ] Given CWD inside a project with `.aeos/` in a parent, when calling `projectRoot()`, then it returns the correct parent directory
- [ ] Given CWD with `.aeos/` in the same directory, when calling `projectRoot()`, then it returns CWD
- [ ] Given CWD outside any AEOS project, when calling `projectRoot()`, then `ProjectRootNotFoundError` is thrown
- [ ] Given `aeosDir()` in a project, when called, then result ends with `/.aeos`

## Out of Scope
- Validating that `.aeos/` is a well-formed project (beyond existence check)

## Technical Notes / Hints
- Test with a temporary directory structure using `fs.mkdtempSync` — do not rely on `process.cwd()` in tests
- Use `path.dirname` not string splitting for cross-platform correctness

## Dependencies
- M0-002: TypeScript configured

## Layer Mapping
```
Infrastructure:  src/infrastructure/filesystem/fs-project.repository.ts  — projectRoot(), aeosDir() + ProjectRepository impl
Domain port:     src/domain/ports/driven/project-repository.port.ts
Shared:          src/shared/errors.ts                                     — ProjectRootNotFoundError
```

## Definition of Done
- [ ] `projectRoot()` walks up correctly and throws on missing project
- [ ] Unit tests: found at CWD, found at parent, found at grandparent, not found (throws)
- [ ] Code reviewed and approved
