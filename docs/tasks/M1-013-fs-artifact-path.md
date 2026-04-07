# Task: Implement `artifactPath(ticketId, artifactName)` Filesystem Helper

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** typescript-pro
**Method:** Manual (bootstrapping)

## Context
Returns the canonical filesystem path for any artifact file associated with a ticket. Centralising the naming convention here means every part of the system writes and reads artifacts from the same predictable location. Requires M1-012 (`projectRoot()`).

## What needs to be done
Implement in `src/infrastructure/filesystem/fs-artifact-store.adapter.ts` as the `FsArtifactStore` adapter (implements `ArtifactStore` port). The path construction and file listing are infrastructure concerns — they know about the filesystem layout.

```typescript
/**
 * Returns the canonical path for a ticket artifact inside .aeos/tickets/<ticketId>/.
 * Pattern: <projectRoot>/.aeos/tickets/<ticketId>/<ticketId>-<artifactName>
 *
 * Example:
 *   artifactPath('AEOS-1', 'prd.md')
 *   → '/path/to/project/.aeos/tickets/AEOS-1/AEOS-1-prd.md'
 */
export function artifactPath(
  ticketId: string,
  artifactName: string,
  root?: string,
): string

/**
 * Returns all artifact paths for a ticket (reads disk).
 * Returns only files that actually exist in .aeos/tickets/<ticketId>/.
 */
export function listArtifacts(
  ticketId: string,
  root?: string,
): string[]
```

`artifactPath` implementation:
1. Call `projectRoot(root)` to resolve the base
2. Construct: `path.join(aeosDir(root), 'tickets', ticketId, `${ticketId}-${artifactName}`)`

`listArtifacts` implementation:
1. Call `fs.readdirSync(path.join(aeosDir(root), 'tickets', ticketId))`
2. Filter files matching pattern `^${ticketId}-` and ending with `.md`
3. Return full paths

## Acceptance Criteria
- [ ] Given `ticketId='AEOS-1'` and `artifactName='prd.md'`, when calling `artifactPath()`, then result is `<root>/.aeos/tickets/AEOS-1/AEOS-1-prd.md`
- [ ] Given `.aeos/tickets/AEOS-1/` with files `AEOS-1-ticket.md` and `AEOS-1-prd.md`, when calling `listArtifacts('AEOS-1')`, then both paths are returned
- [ ] Given files for `AEOS-2` in a separate directory, when calling `listArtifacts('AEOS-1')`, then `AEOS-2` files are excluded
- [ ] Given a non-existent ticket directory, when calling `listArtifacts()`, then an empty array is returned (no throw)

## Out of Scope
- Reading or writing file content (caller's responsibility)
- Artifact validation

## Dependencies
- M1-012: `projectRoot()` and `aeosDir()`

## Layer Mapping
```
Infrastructure:  src/infrastructure/filesystem/fs-artifact-store.adapter.ts  — artifactPath(), listArtifacts() + ArtifactStore impl
Domain port:     src/domain/ports/driven/artifact-store.port.ts
```

## Definition of Done
- [ ] `artifactPath()` constructs correct canonical paths under `.aeos/tickets/<ticketId>/`
- [ ] `listArtifacts()` returns only matching files for the given ticket
- [ ] Unit tests using a temp directory fixture
- [ ] Code reviewed and approved
