# Task: Implement `aeosHome()` Filesystem Helper

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** typescript-pro
**Method:** Manual (bootstrapping)

## Context
Single-responsibility utility that resolves the global AEOS home directory (`~/.aeos/`). Used by `aeos install`, `aeos project init`, and the registry lookup. Centralising this prevents `os.homedir()` being scattered across the codebase.

## What needs to be done
Create `src/fs/aeos-home.ts` exporting:

```typescript
import { join } from 'node:path';
import { homedir } from 'node:os';

/** Returns the absolute path to ~/.aeos/ */
export function aeosHome(): string {
  return join(homedir(), '.aeos');
}

/** Returns the absolute path to a file inside ~/.aeos/ */
export function aeosHomePath(...segments: string[]): string {
  return join(aeosHome(), ...segments);
}
```

Also export `aeosConfigPath()` and `aeosRegistryPath()` as named convenience wrappers:
```typescript
export const aeosConfigPath   = () => aeosHomePath('config.json');
export const aeosRegistryPath = () => aeosHomePath('registry.json');
```

## Acceptance Criteria
- [ ] Given any environment, when calling `aeosHome()`, then the result ends with `/.aeos` and is an absolute path
- [ ] Given `aeosHomePath('config.json')`, when called, then it returns `<homedir>/.aeos/config.json`
- [ ] Given `aeosConfigPath()`, when called, then result equals `aeosHomePath('config.json')`
- [ ] Given a Windows-style path (mocked), when calling `aeosHome()`, then no hardcoded `/` separators are used (uses `path.join`)

## Out of Scope
- Creating the directory (that is `aeos install`'s responsibility)
- Any filesystem I/O in this module

## Technical Notes / Hints
- Always use `node:path` join — never string concatenation — for cross-platform safety
- This module must have zero side effects; pure functions only

## Dependencies
- M0-002: TypeScript configured

## Definition of Done
- [ ] `src/fs/aeos-home.ts` implemented with all exports
- [ ] Unit tests: path construction, convenience wrappers return correct paths
- [ ] Code reviewed and approved
