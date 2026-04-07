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
6. If depth exceeds 256 iterations: throw `ProjectRootNotFoundError` with message `"Max directory depth (256) exceeded — possible symlink loop"`. This prevents infinite loops in pathological symlink configurations (matches git's safety pattern).

Also implement in the adapter:
```typescript
export function aeosDir(root?: string): string  // returns projectRoot() + '/.aeos'
```

Also implement a `readProjectConfig()` helper to centralise `.aeos/project.json` reading. Every ticket command (M1-004, M2-012, M2-011) needs both the project root and the project metadata — without this helper, each command independently reads, parses, and error-handles `project.json`:
```typescript
export interface ProjectConfig {
  uuid: string;
  id: string;       // slug, used as project_id in DB queries
  name: string;
  key: string;
  path: string;
  created_at: string;
}

/** Reads and parses .aeos/project.json. Throws if not found or invalid JSON. */
export function readProjectConfig(root?: string): ProjectConfig
```

Implementation:
1. Resolve `aeosDir(root)` to find `.aeos/`
2. Read `path.join(aeosDir, 'project.json')` — if not found, throw with message `"project.json not found. Run 'aeos project init' first."`
3. `JSON.parse` the content — if invalid JSON, throw with message `"project.json is corrupt. Run 'aeos project init' to re-initialise."`
4. Return the typed `ProjectConfig` object

> **Note:** `stateDbPath()` is no longer needed — the DB is global at `~/.aeos/state.db`, not per-project. Use `aeosDbPath()` from M1-011 instead.

## Acceptance Criteria
- [ ] Given CWD inside a project with `.aeos/` in a parent, when calling `projectRoot()`, then it returns the correct parent directory
- [ ] Given CWD with `.aeos/` in the same directory, when calling `projectRoot()`, then it returns CWD
- [ ] Given CWD outside any AEOS project, when calling `projectRoot()`, then `ProjectRootNotFoundError` is thrown
- [ ] Given a directory structure deeper than 256 levels with no `.aeos/`, when calling `projectRoot()`, then `ProjectRootNotFoundError` is thrown (max-depth guard)
- [ ] Given `aeosDir()` in a project, when called, then result ends with `/.aeos`
- [ ] Given a valid `.aeos/project.json`, when calling `readProjectConfig()`, then a typed `ProjectConfig` object is returned with `id`, `key`, `name`, etc.
- [ ] Given a missing `project.json`, when calling `readProjectConfig()`, then a clear error is thrown
- [ ] Given a corrupt (non-JSON) `project.json`, when calling `readProjectConfig()`, then a clear error is thrown

## Out of Scope
- Validating that `.aeos/` is a well-formed project (beyond existence check)

## Technical Notes / Hints
- Test with a temporary directory structure using `fs.mkdtempSync` — do not rely on `process.cwd()` in tests
- Use `path.dirname` not string splitting for cross-platform correctness
- The max-depth constant (256) can be a module-level `const MAX_WALK_DEPTH = 256` — no need to make it configurable

## Dependencies
- M0-002: TypeScript configured

## Layer Mapping
```
Infrastructure:  src/infrastructure/filesystem/fs-project.repository.ts  — projectRoot(), aeosDir(), readProjectConfig() + ProjectRepository impl
Domain port:     src/domain/ports/driven/project-repository.port.ts
Shared:          src/shared/errors.ts                                     — ProjectRootNotFoundError
```

## Definition of Done
- [ ] `projectRoot()` walks up correctly and throws on missing project
- [ ] `readProjectConfig()` reads and parses `project.json` correctly
- [ ] Unit tests: found at CWD, found at parent, found at grandparent, not found (throws), max-depth guard, readProjectConfig happy path, missing project.json, corrupt project.json
- [ ] Code reviewed and approved
