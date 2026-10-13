# Task: Implement `aeosHome()` Filesystem Helper

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** typescript-pro
**Method:** Manual (bootstrapping)

## Context
Single-responsibility utility that resolves the global AEOS home directory (`~/.aeos/`). Used by `aeos install`, `aeos project init`, and the registry lookup. Centralising this prevents `os.homedir()` being scattered across the codebase.

## What needs to be done
Implement in `src/infrastructure/filesystem/fs-config.adapter.ts` (internal helpers used by the `FsConfigStore` adapter). These path utilities are infrastructure concerns — they know about the filesystem layout. Export them from the adapter file for use by other adapters in the infrastructure layer.

Alternatively, place pure path resolution in a shared utility at `src/shared/paths.ts` if multiple infrastructure adapters need them. Either way, these must NOT be imported by domain or application code — use the `ConfigStore` port instead.

Path helpers:

```typescript
import { join } from 'node:path';
import { homedir } from 'node:os';

/** Returns the absolute path to ~/.aeos/ (overridable via AEOS_HOME env var for testing) */
export function aeosHome(): string {
  return process.env.AEOS_HOME ?? join(homedir(), '.aeos');
}

/** Returns the absolute path to a file inside ~/.aeos/ */
export function aeosHomePath(...segments: string[]): string {
  return join(aeosHome(), ...segments);
}
```

Also export named convenience wrappers for the three most-used global paths:
```typescript
export const aeosConfigPath   = () => aeosHomePath('config.json');
export const aeosRegistryPath = () => aeosHomePath('registry.json');
export const aeosDbPath       = () => aeosHomePath('state.db');
```

## Acceptance Criteria
- [ ] Given any environment without `AEOS_HOME` set, when calling `aeosHome()`, then the result ends with `/.aeos` and is an absolute path
- [ ] Given `AEOS_HOME=/tmp/test-aeos`, when calling `aeosHome()`, then it returns `/tmp/test-aeos` (not `~/.aeos/`)
- [ ] Given `aeosHomePath('config.json')`, when called, then it returns `<homedir>/.aeos/config.json`
- [ ] Given `aeosConfigPath()`, when called, then result equals `aeosHomePath('config.json')`
- [ ] Given `aeosDbPath()`, when called, then result equals `aeosHomePath('state.db')`
- [ ] Given a Windows-style path (mocked), when calling `aeosHome()`, then no hardcoded `/` separators are used (uses `path.join`)

## Out of Scope
- Creating the directory (that is `aeos install`'s responsibility)
- Any filesystem I/O in this module

## Technical Notes / Hints
- Always use `node:path` join — never string concatenation — for cross-platform safety
- This module must have zero side effects; pure functions only
- `AEOS_HOME` is intended for testing and development only. It is not documented as a user-facing feature. Production always uses `~/.aeos/`. Integration tests should set `process.env.AEOS_HOME = tmpDir` in `beforeEach` and delete it in `afterEach`.

## Dependencies
- M0-002: TypeScript configured

## Layer Mapping
```
Infrastructure:  src/infrastructure/filesystem/fs-config.adapter.ts   — path helpers + ConfigStore implementation
   — or —       src/shared/paths.ts                                   — if shared across multiple adapters
Domain port:     src/domain/ports/driven/config-store.port.ts          — ConfigStore interface (M1-006 review)
```

## Definition of Done
- [ ] Path helpers implemented and used by `FsConfigStore` adapter
- [ ] Unit tests: path construction, AEOS_HOME override, convenience wrappers (including `aeosDbPath`) return correct paths
- [ ] Code reviewed and approved
