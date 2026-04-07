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
 * Writes content to the canonical artifact path for a ticket.
 * Creates the ticket directory (.aeos/tickets/<ticketId>/) if it doesn't exist.
 * Returns the absolute path of the written file.
 */
export function writeArtifact(
  ticketId: string,
  artifactName: string,
  content: string,
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

`writeArtifact` implementation:
1. Resolve path via `artifactPath(ticketId, artifactName, root)`
2. Ensure the ticket directory exists: `fs.mkdirSync(path.dirname(filePath), { recursive: true })`
3. Write: `fs.writeFileSync(filePath, content, 'utf-8')`
4. Return the absolute path

`listArtifacts` implementation:
1. Call `fs.readdirSync(path.join(aeosDir(root), 'tickets', ticketId))`
2. Filter files matching the ticket ID prefix pattern: `^${ticketId}-` (no extension filter — future artifacts may be `.yaml`, `.json`, etc.)
3. Return full paths
4. If the directory does not exist (`ENOENT`), return `[]` (no throw)

## Acceptance Criteria
- [ ] Given `ticketId='AEOS-1'` and `artifactName='prd.md'`, when calling `artifactPath()`, then result is `<root>/.aeos/tickets/AEOS-1/AEOS-1-prd.md`
- [ ] Given `writeArtifact('AEOS-1', 'ticket.md', '# Ticket')`, when checking the filesystem, then `.aeos/tickets/AEOS-1/AEOS-1-ticket.md` exists with the correct content
- [ ] Given `writeArtifact()` called on a ticket with no existing directory, when checking the filesystem, then the ticket directory was auto-created
- [ ] Given `.aeos/tickets/AEOS-1/` with files `AEOS-1-ticket.md` and `AEOS-1-prd.md`, when calling `listArtifacts('AEOS-1')`, then both paths are returned
- [ ] Given `.aeos/tickets/AEOS-1/` with a non-`.md` file `AEOS-1-report.json`, when calling `listArtifacts('AEOS-1')`, then the file is included (no extension filter)
- [ ] Given files for `AEOS-2` in a separate directory, when calling `listArtifacts('AEOS-1')`, then `AEOS-2` files are excluded
- [ ] Given a non-existent ticket directory, when calling `listArtifacts()`, then an empty array is returned (no throw)
- [ ] Given a freshly initialised project with no `.aeos/tickets/` parent directory, when calling `listArtifacts()`, then an empty array is returned (no throw)

## Out of Scope
- Artifact content validation

## Dependencies
- M1-012: `projectRoot()` and `aeosDir()`

## Layer Mapping
```
Infrastructure:  src/infrastructure/filesystem/fs-artifact-store.adapter.ts  — artifactPath(), writeArtifact(), listArtifacts() + ArtifactStore impl
Domain port:     src/domain/ports/driven/artifact-store.port.ts
```

## Technical Notes / Hints
- Wrap `fs.readdirSync` in a try/catch. If the directory doesn't exist (`ENOENT`), return `[]`. This handles both missing ticket directories and missing `tickets/` parent directories (freshly initialised projects).
- `writeArtifact` uses `fs.mkdirSync` with `{ recursive: true }` — this safely handles both the `tickets/` parent and the ticket subdirectory in one call.

## Definition of Done
- [ ] `artifactPath()` constructs correct canonical paths under `.aeos/tickets/<ticketId>/`
- [ ] `writeArtifact()` creates ticket directory and writes content
- [ ] `listArtifacts()` returns only matching files for the given ticket (prefix filter, no extension filter)
- [ ] Unit tests using a temp directory fixture: path construction, write + read round-trip, missing directory returns `[]`, non-`.md` files included
- [ ] Code reviewed and approved
