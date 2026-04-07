# Task: Implement `ContextAssembler`

**Milestone:** M2 — Dogfood Harness
**Agent:** backend-architect
**Method:** Manual (last manual milestone)

## Context
Assembles the full context payload passed to `PromptBuilder`. Reads the ticket file, all prior artifacts for this ticket, and the project `CONSTRAINTS.md`. This is the primary source of truth for what the model sees — getting the assembly order wrong is the most common cause of "well-formed but wrong content" artifact failures.

> **v1 simplification:** Phase-based context scoping (system design §8.1) is deferred. In v1, all context is assembled regardless of phase — CONSTRAINTS.md and all prior artifacts are always included. Phase scoping will be addressed in a future milestone.

## Prerequisites (port amendments required before implementation)

### 1. Add `readArtifact()` to `ArtifactStore` port (amends M1-013)

The `ArtifactStore` port (`src/domain/ports/driven/artifact-store.port.ts`) currently has `writeArtifact`, `removeArtifact`, and `listArtifacts` but no read method. Add:

```typescript
/** Reads artifact content. Throws if file does not exist. */
readArtifact(projectPath: string, ticketId: string, filename: string): string;
```

The `FsArtifactStore` adapter must also implement this method.

### 2. Add `readConstraints()` to `ProjectRepository` port

The `ProjectRepository` port (`src/domain/ports/driven/project-repository.port.ts`) has no method for reading `CONSTRAINTS.md`. Add:

```typescript
/** Reads CONSTRAINTS.md from .aeos/ directory. Returns null if not present. */
readConstraints(projectPath: string): string | null;
```

### 3. Define `AssembledContext` interface

The scaffold file `src/domain/model/assembled-context.ts` contains only a placeholder comment. Define the full interface:

```typescript
// src/domain/model/assembled-context.ts
export interface PriorArtifact {
  name: string;     // e.g. "AEOS-1-prd.md"
  content: string;
}

export interface AssembledContext {
  ticketContent: string;
  priorArtifacts: PriorArtifact[];
  constraints: string | null;
}
```

## What needs to be done
Implement as an application service in `src/application/services/context-assembler.ts`. Define the `AssembledContext` value object in `src/domain/model/assembled-context.ts` (see Prerequisites §3).

The service receives `ArtifactStore` and `ProjectRepository` ports via constructor injection — it does NOT directly call `fs` or standalone functions. The `projectRoot` parameter is passed as `projectPath` to all port method calls:

```typescript
// src/application/services/context-assembler.ts
export class ContextAssembler {
  constructor(
    private artifactStore: ArtifactStore,
    private projectRepo: ProjectRepository,
  ) {}

  async assemble(
    ticketId: string,
    projectRoot: string,
  ): Promise<AssembledContext>
}
```

Assembly order and logic:
1. Read ticket content: `this.artifactStore.readArtifact(projectRoot, ticketId, \`${ticketId}-ticket.md\`)` → `ticketContent`
2. List and read prior artifacts:
   - Call `this.artifactStore.listArtifacts(projectRoot, ticketId)` → sorted filenames
   - Filter out the ticket file: `filename !== \`${ticketId}-ticket.md\``
   - For each remaining filename: `this.artifactStore.readArtifact(projectRoot, ticketId, filename)` → `{ name: filename, content }`
   - Result is already in lexicographic order (port sorts results)
3. Read constraints: `this.projectRepo.readConstraints(projectRoot)` → `string | null`
4. Return `{ ticketContent, priorArtifacts, constraints }`

## Acceptance Criteria
- [ ] Given a ticket with 2 prior artifacts, when calling `assemble()`, then `priorArtifacts` contains both in lexicographic order
- [ ] Given no `CONSTRAINTS.md`, when calling `assemble()`, then `constraints` is `null` (no error thrown)
- [ ] Given a `CONSTRAINTS.md` at project root, when calling `assemble()`, then `constraints` contains its content
- [ ] Given the ticket file itself is in the artifacts directory, when assembling, then it does NOT appear in `priorArtifacts` (filtered by `filename !== \`${ticketId}-ticket.md\``)

## Out of Scope
- Prompt construction (M2-005 — `PromptBuilder`)
- Token counting or truncation (v2 concern)
- Phase-based context scoping per system design §8.1 (deferred; v1 assembles all context)

## Technical Notes / Hints
- Lexicographic order of artifact file names ensures deterministic assembly: `AEOS-1-prd.md` before `AEOS-1-tech-spec.md`
- All file reads go through port methods (`ArtifactStore`, `ProjectRepository`) — do NOT use `node:fs` or `node:fs/promises` directly
- `projectRoot` is passed as `projectPath` to all port calls

## Layer Mapping
```
Application:   src/application/services/context-assembler.ts  — ContextAssembler service
Domain model:  src/domain/model/assembled-context.ts           — AssembledContext value object (+ PriorArtifact)
Domain ports:  src/domain/ports/driven/artifact-store.port.ts  — ArtifactStore (for reading/listing artifacts)
               src/domain/ports/driven/project-repository.port.ts — ProjectRepository (for CONSTRAINTS.md)
```

## Dependencies
- M1-013: `ArtifactStore` port implementation (must be amended to add `readArtifact()` — see Prerequisites §1)
- M1-002/M1-012: `ProjectRepository` port (must be amended to add `readConstraints()` — see Prerequisites §2)

## Definition of Done
- [ ] `AssembledContext` and `PriorArtifact` interfaces defined in `src/domain/model/assembled-context.ts`
- [ ] `ArtifactStore` port extended with `readArtifact()` and implemented in `FsArtifactStore`
- [ ] `ProjectRepository` port extended with `readConstraints()` and implemented in adapter
- [ ] `ContextAssembler.assemble()` correctly reads and orders all context pieces
- [ ] Unit tests with stub ports: 0 artifacts, 2 artifacts, missing CONSTRAINTS.md, CONSTRAINTS.md present
- [ ] Code reviewed and approved
