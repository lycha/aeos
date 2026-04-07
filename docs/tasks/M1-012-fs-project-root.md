# Task: Implement `projectRoot()` Filesystem Helper

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** typescript-pro
**Method:** Manual (bootstrapping)

## Context
Walks up the directory tree from the current working directory to find the nearest `.aeos/` directory. Used by every ticket command to locate the project. Analogous to how `git` finds `.git/`. Requires M0-002 (TypeScript configured).

## What needs to be done
Create `src/fs/project-root.ts` exporting:

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

Also export:
```typescript
export function aeosDir(root?: string): string  // returns projectRoot() + '/.aeos'
export function stateDbPath(root?: string): string  // returns aeosDir() + '/state.db'
```

## Acceptance Criteria
- [ ] Given CWD inside a project with `.aeos/` in a parent, when calling `projectRoot()`, then it returns the correct parent directory
- [ ] Given CWD with `.aeos/` in the same directory, when calling `projectRoot()`, then it returns CWD
- [ ] Given CWD outside any AEOS project, when calling `projectRoot()`, then `ProjectRootNotFoundError` is thrown
- [ ] Given `stateDbPath()` in a project, when called, then result ends with `/.aeos/state.db`

## Out of Scope
- Validating that `.aeos/` is a well-formed project (beyond existence check)

## Technical Notes / Hints
- Test with a temporary directory structure using `fs.mkdtempSync` — do not rely on `process.cwd()` in tests
- Use `path.dirname` not string splitting for cross-platform correctness

## Dependencies
- M0-002: TypeScript configured

## Definition of Done
- [ ] `projectRoot()` walks up correctly and throws on missing project
- [ ] Unit tests: found at CWD, found at parent, found at grandparent, not found (throws)
- [ ] Code reviewed and approved
