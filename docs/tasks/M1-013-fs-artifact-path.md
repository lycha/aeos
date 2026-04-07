# Task: Implement `artifactPath(ticketId, artifactName)` Filesystem Helper

**Milestone:** M1 — CLI Skeleton + State Machine
**Agent:** typescript-pro
**Method:** Manual (bootstrapping)

## Context
Returns the canonical filesystem path for any artifact file associated with a ticket. Centralising the naming convention here means every part of the system writes and reads artifacts from the same predictable location. Requires M1-012 (`projectRoot()`).

## What needs to be done
Create `src/fs/artifact-path.ts` exporting:

```typescript
/**
 * Returns the canonical path for a ticket artifact inside .aeos/.
 * Pattern: <projectRoot>/.aeos/<ticketId>-<artifactName>
 *
 * Example:
 *   artifactPath('AEOS-1', 'prd.md')
 *   → '/path/to/project/.aeos/AEOS-1-prd.md'
 */
export function artifactPath(
  ticketId: string,
  artifactName: string,
  root?: string,
): string

/**
 * Returns all artifact paths for a ticket (glob-style, reads disk).
 * Returns only files that actually exist.
 */
export function listArtifacts(
  ticketId: string,
  root?: string,
): string[]
```

`artifactPath` implementation:
1. Call `projectRoot(root)` to resolve the base
2. Construct: `path.join(aeosDir(root), `${ticketId}-${artifactName}`)`

`listArtifacts` implementation:
1. Call `fs.readdirSync(aeosDir(root))`
2. Filter files matching pattern `^${ticketId}-` and ending with `.md`
3. Return full paths

## Acceptance Criteria
- [ ] Given `ticketId='AEOS-1'` and `artifactName='prd.md'`, when calling `artifactPath()`, then result is `<root>/.aeos/AEOS-1-prd.md`
- [ ] Given a `.aeos/` with files `AEOS-1-ticket.md` and `AEOS-1-prd.md`, when calling `listArtifacts('AEOS-1')`, then both paths are returned
- [ ] Given files for `AEOS-2` also present, when calling `listArtifacts('AEOS-1')`, then `AEOS-2` files are excluded
- [ ] Given a non-existent `.aeos/`, when calling `listArtifacts()`, then an empty array is returned (no throw)

## Out of Scope
- Reading or writing file content (caller's responsibility)
- Artifact validation

## Dependencies
- M1-012: `projectRoot()` and `aeosDir()`

## Definition of Done
- [ ] `artifactPath()` constructs correct canonical paths
- [ ] `listArtifacts()` returns only matching files for the given ticket
- [ ] Unit tests using a temp directory fixture
- [ ] Code reviewed and approved
