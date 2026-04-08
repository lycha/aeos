# Deep Review: M2-004 — Implement `ContextAssembler`

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Task specification — `docs/tasks/M2-004-context-assembler.md`
**Cross-referenced against:** System design (03-system-design.md §8/4.4), PRD (02-prd.md §5.6), Action plan (05-action-plan-v1.md M2), sibling tasks M1-013, M2-005, M2-007, M2-008, M2-009, M2-011, existing scaffold in `src/`, prior reviews for M2-001 through M2-003

---

## Overall Assessment

The task correctly identifies the file path (`src/application/services/context-assembler.ts`), the hexagonal layer (application service), and the general purpose (assemble context for the executor). The assembly order (ticket → prior artifacts → CONSTRAINTS.md) is sensible and matches the system design's prompt structure (§4.4).

However, the task has **three major gaps**, **two medium gaps**, and **several minor issues** that would block implementation or cause rework if not addressed.

**Verdict:** Approve with required changes.

---

## 1. Correctness vs System Design

### ⚠️ MAJOR: `ArtifactStore` port has no `readArtifact()` method

The task says ContextAssembler receives `ArtifactStore` via constructor injection and uses it to read the ticket file and prior artifacts. However, the actual `ArtifactStore` port interface (`src/domain/ports/driven/artifact-store.port.ts`) only has:

```typescript
interface ArtifactStore {
  writeArtifact(projectPath, ticketId, filename, content): void;
  removeArtifact(projectPath, ticketId, filename): void;
  listArtifacts(projectPath, ticketId): string[];  // returns filenames, not content
}
```

**There is no `readArtifact()` method.** The port can list and write artifacts but cannot read their content. The `FsArtifactStore` adapter also has no read capability. The standalone `listArtifacts()` function returns absolute paths, but reading content still requires direct `fs.readFileSync` — violating the hexagonal boundary.

**Required fix:** Add `readArtifact(projectPath: string, ticketId: string, filename: string): string` to the `ArtifactStore` port and implement it in `FsArtifactStore`. This is a prerequisite change that affects M1-013's scope.

### ⚠️ MAJOR: `ProjectRepository` port has no method for reading `CONSTRAINTS.md`

The task says ContextAssembler receives `ProjectRepository` for reading `CONSTRAINTS.md`. The actual `ProjectRepository` port (`src/domain/ports/driven/project-repository.port.ts`) has:

```typescript
interface ProjectRepository {
  exists(projectPath): boolean;
  read(projectPath): Project;
  writeProject(project): void;
  ensureColumnSpecsDir(projectPath): void;
  findRoot(startDir): string | null;
}
```

**None of these methods read `CONSTRAINTS.md`.** The `read()` method returns a `Project` object (from `project.json`), not arbitrary file content.

**Required fix:** Either:
1. Add `readConstraints(projectPath: string): string | null` to `ProjectRepository` (preferred — keeps CONSTRAINTS.md reading behind a port)
2. Create a dedicated `ConstraintsReader` port (over-engineered for this)

### ⚠️ MAJOR: `AssembledContext` value object shape not defined

The task says "The `AssembledContext` value object is already scaffolded in `src/domain/model/assembled-context.ts`." In reality, that file contains only:

```typescript
// Value Object — AssembledContext (collected inputs for executor invocation)
```

The shape is not defined anywhere. The downstream consumer M2-005 (`PromptBuilder`) expects specific properties: `context.ticketContent`, `context.constraints`, and iterable prior artifacts with `.name` and `.content`. The task must define the `AssembledContext` interface explicitly, e.g.:

```typescript
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

Without this, neither M2-004 nor M2-005 can be implemented.

### ⚠️ MEDIUM: Phase-based context scoping not addressed

System design §8.1 specifies different context per phase:

| Phase | CONSTRAINTS.md | Prior Artifacts | Business Context |
|-------|---------------|-----------------|------------------|
| PLAN | ✗ | — | ✓ |
| PREPARE | ✓ | PLAN only | — |
| BUILD | ✓ | PLAN + PREPARE | — |
| DEPLOY | ✓ | All | — |

The task ignores phase scoping entirely — it always reads CONSTRAINTS.md and all prior artifacts regardless of phase. The `ColumnSpec` parameter is accepted but never used in the implementation steps.

**Recommendation:** For v1/M2, the current "assemble everything" approach is acceptable as a simplification, but the task should:
1. Document this as a deliberate simplification ("v1: all context assembled; phase scoping deferred")
2. Either use `ColumnSpec` to determine phase, or remove it from the signature to avoid confusion

### ⚠️ MEDIUM: `ColumnSpec` parameter accepted but unused

The `assemble()` method signature includes `columnSpec: ColumnSpec`, but none of the four implementation steps reference it. If phase scoping is deferred, remove it. If it's needed (e.g., to determine which artifacts to include), the implementation steps must show how it's used.

### ✅ Assembly order — ALIGNED

Steps 1→2→3→4 (ticket → prior artifacts in lex order → CONSTRAINTS.md → return) matches the [CONTEXT] section structure in system design §4.4. ✓

### ✅ Lexicographic artifact ordering — ALIGNED

`FsArtifactStore.listArtifacts()` already sorts results with `.sort()`. The deterministic ordering claim in the task is achievable. ✓


---

## 2. Dependencies

### ✅ M1-013 (`ArtifactStore` port implementation) — CORRECT but incomplete

M1-013 provides `listArtifacts()` and `writeArtifact()`. ContextAssembler needs `listArtifacts()` ✓ but also needs `readArtifact()` which does not exist ✗. See GAP-1 below.

### ⚠️ M2-008 (`ColumnSpec` type) — LISTED but may be unnecessary

The task lists M2-008 for `ColumnSpec`, but the implementation steps never use `ColumnSpec`. If phase scoping is deferred, this dependency is cosmetic. If `ColumnSpec` is removed from the signature, this dependency can be dropped entirely.

### ⚠️ Missing dependency: `AssembledContext` type definition

No task owns the definition of the `AssembledContext` interface. M2-004 says it's "already scaffolded" but the scaffold is an empty comment. Either M2-004 itself must define it (add to scope), or a new sub-task must be created.

### ⚠️ Missing dependency: `readArtifact` on ArtifactStore port

Adding `readArtifact()` to the `ArtifactStore` port is a change to M1-013's deliverable. This should be documented as a blocking prerequisite amendment to M1-013.

### ⚠️ Missing dependency: `readConstraints` on ProjectRepository

Same as above — adding `readConstraints()` to `ProjectRepository` affects M1-002/M1-012 scope.

### ✅ No circular dependencies

M1-013 → M2-004 → M2-005 → M2-011. Clean DAG. ✓

---

## 3. File Path Alignment with Hexagonal Scaffold

### ✅ Target file exists as scaffolded placeholder

| Task path | Exists on disk | Content |
|-----------|---------------|---------|
| `src/application/services/context-assembler.ts` | ✓ | `// Application service — ContextAssembler...` (placeholder) |
| `src/domain/model/assembled-context.ts` | ✓ | `// Value Object — AssembledContext...` (placeholder) |
| `src/domain/ports/driven/artifact-store.port.ts` | ✓ | Full interface (missing `readArtifact`) |
| `src/domain/ports/driven/project-repository.port.ts` | ✓ | Full interface (missing `readConstraints`) |

### ✅ Layer placement is correct

Application service depending on driven domain ports. Correct per hexagonal architecture. ✓

### ✅ Barrel exports

`src/application/services/index.ts` exists and should re-export the assembler. ✓

---

## 4. Consistency with Sibling Tasks

### vs M2-005 (PromptBuilder) — ⚠️ INCONSISTENT (shape undefined)

M2-005 consumes `AssembledContext` and accesses `context.ticketContent`, `context.constraints`, and iterates `priorArtifacts` with `.name` and `.content`. M2-004 does not define this shape. Both tasks assume it exists but neither specifies it. The implementer of whichever task runs first will invent the shape ad-hoc.

**Fix:** M2-004 must define the `AssembledContext` interface explicitly. M2-005's expected access pattern should be cross-validated.

### vs M2-009 (Preflight Pass) — ✅ CONSISTENT

M2-009 lists M2-004 as a dependency ("for reading ticket content"). M2-009's preflight prompt uses "ticket content only — no prior artifacts", which means it would call the assembler with a filtered scope or read the ticket directly. Slight ambiguity, but not a conflict. ✓

### vs M2-011 (ticket run) — ✅ CONSISTENT

M2-011 step 5 calls `contextAssembler.assemble()`. The orchestration receives `ContextAssembler` via constructor injection. Consistent with M2-004's class-based design. ✓

### vs M1-013 (ArtifactStore) — ⚠️ INCONSISTENT (port API mismatch)

M1-013 specifies three methods on `ArtifactStore`: `artifactPath`, `writeArtifact`, `listArtifacts`. M2-004 needs to read artifact content through the port, but no read method exists. The standalone functions in `fs-artifact-store.adapter.ts` return paths, not content.

Additionally, the `ArtifactStore` port's `listArtifacts(projectPath, ticketId)` returns bare filenames (e.g., `AEOS-1-prd.md`), while the standalone `listArtifacts(ticketId, root?)` returns absolute paths. The task's step 2 says "call `listArtifacts(ticketId, root)` and read each file" — this conflates the two APIs. The class-based port must be used (per hexagonal principles), but it lacks both the right signature pattern and a read method.

### vs M2-007 (ColumnSpec Zod Schema) — ✅ CONSISTENT

`ColumnSpec` type referenced in signature matches M2-007's `z.infer<typeof ColumnSpecSchema>`. ✓

### vs Prior Reviews (M2-001, M2-002, M2-003) — ✅ CONSISTENT

No direct conflicts. Prior reviews focused on executor concerns (interrupt, model config). ContextAssembler is upstream of the executor and does not interact with it. ✓

---

## 5. Gaps That Would Block Implementation

### GAP-1: No `readArtifact()` on `ArtifactStore` port (BLOCKING)

Without this, the implementer must either:
- Call `fs.readFileSync` directly → violates hexagonal architecture
- Add the method ad-hoc → changes port contract without task spec authority

### GAP-2: No `readConstraints()` on `ProjectRepository` port (BLOCKING)

Same issue for CONSTRAINTS.md. The implementer has no port-compliant way to read this file.

### GAP-3: `AssembledContext` interface undefined (BLOCKING)

Both M2-004 and M2-005 depend on this type but neither defines it. The scaffold file is empty.

### GAP-4: `ColumnSpec` parameter unused (NON-BLOCKING but confusing)

Accepting a parameter that's never used creates dead code and misleads the implementer about expected behavior.

---

## 6. Minor Issues and Recommendations

### m1: Method name inconsistency in acceptance criteria

The code block shows `assemble()` but the acceptance criteria reference `assembleContext()`. Pick one and use it consistently. Recommendation: `assemble()` (matches the code block).

### m2: Technical Notes say "Use `node:fs/promises`" — contradicts port-based design

The task says to use `node:fs/promises` for async reads, but the `ArtifactStore` port methods are synchronous. If the service wraps synchronous port calls in `async`, the `fs/promises` hint is misleading. The implementer should use the port methods, not raw `fs`.

### m3: Step 2 says "call `listArtifacts(ticketId, root)`" — wrong signature

The `ArtifactStore` port's `listArtifacts` takes `(projectPath, ticketId)`, not `(ticketId, root)`. The standalone function takes `(ticketId, root?)`. The task must use the port's signature since the class receives `ArtifactStore` via injection.

### m4: No guidance on `projectRoot` parameter vs port-based approach

The `assemble()` method accepts `projectRoot: string`, but the `ArtifactStore` port methods also accept `projectPath`. The task should clarify how `projectRoot` maps to port calls — presumably passed as `projectPath` to each port method.

### m5: Ticket file exclusion logic underspecified

Step 2 says "Exclude the ticket file itself from prior artifacts." The exclusion pattern is not specified. Presumably filter out any filename matching `<ticketId>-ticket.md`, but this should be explicit (e.g., `filename !== \`${ticketId}-ticket.md\``).

---

## Findings Summary

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| M1 | **Major** | `ArtifactStore` port has no `readArtifact()` method | Add `readArtifact(projectPath, ticketId, filename): string` to port and adapter. Amend M1-013. |
| M2 | **Major** | `ProjectRepository` port has no method for reading CONSTRAINTS.md | Add `readConstraints(projectPath): string \| null` to port and adapter. |
| M3 | **Major** | `AssembledContext` interface shape undefined — scaffold file is empty | Define the interface in M2-004 scope: `{ ticketContent, priorArtifacts, constraints }`. |
| M4 | **Medium** | Phase-based context scoping (§8.1) not addressed; ColumnSpec param unused | Document as v1 simplification; either use ColumnSpec or remove from signature. |
| M5 | **Medium** | `ColumnSpec` parameter accepted but never referenced in implementation steps | Remove from signature if phase scoping is deferred; avoids dead parameter. |
| m1 | Minor | `assemble()` vs `assembleContext()` naming inconsistency | Use `assemble()` consistently (matches code block). |
| m2 | Minor | "Use `node:fs/promises`" contradicts port-based design | Remove hint; reads should go through port methods, not raw `fs`. |
| m3 | Minor | `listArtifacts(ticketId, root)` — wrong signature vs port | Use port signature: `listArtifacts(projectPath, ticketId)`. |
| m4 | Minor | `projectRoot` parameter mapping to port calls unspecified | Clarify: `projectRoot` is passed as `projectPath` to all port calls. |
| m5 | Minor | Ticket file exclusion pattern not explicit | Specify: filter `filename !== \`${ticketId}-ticket.md\``. |
| — | Info | File path `src/application/services/context-assembler.ts` matches scaffold | No action needed. |
| — | Info | `src/domain/model/assembled-context.ts` exists as placeholder | Needs content — see M3. |
| — | Info | Lexicographic ordering achievable — `FsArtifactStore.listArtifacts()` already sorts | No action needed. |

---

## Recommended Task Amendments

### 1. Add `readArtifact()` to `ArtifactStore` port (amend M1-013)

```typescript
// src/domain/ports/driven/artifact-store.port.ts
export interface ArtifactStore {
  // ... existing methods ...
  /** Reads artifact content. Throws if file does not exist. */
  readArtifact(projectPath: string, ticketId: string, filename: string): string;
}
```

### 2. Add `readConstraints()` to `ProjectRepository` port

```typescript
// src/domain/ports/driven/project-repository.port.ts
export interface ProjectRepository {
  // ... existing methods ...
  /** Reads CONSTRAINTS.md from .aeos/ directory. Returns null if not present. */
  readConstraints(projectPath: string): string | null;
}
```

### 3. Define `AssembledContext` interface in task scope

```typescript
// src/domain/model/assembled-context.ts
export interface PriorArtifact {
  name: string;
  content: string;
}

export interface AssembledContext {
  ticketContent: string;
  priorArtifacts: PriorArtifact[];
  constraints: string | null;
}
```

### 4. Remove `ColumnSpec` from signature (defer phase scoping)

```typescript
async assemble(
  ticketId: string,
  projectRoot: string,
): Promise<AssembledContext>
```

Or, if phase scoping should be addressed now, add implementation steps that use `columnSpec.column` to determine which artifacts and context to include per system design §8.1.

### 5. Update implementation steps to use port signatures

```
1. Read ticket: this.artifactStore.readArtifact(projectRoot, ticketId, `${ticketId}-ticket.md`)
2. List artifacts: this.artifactStore.listArtifacts(projectRoot, ticketId)
   - Filter out ticket file: filename !== `${ticketId}-ticket.md`
   - For each remaining filename: this.artifactStore.readArtifact(projectRoot, ticketId, filename)
   - Already sorted by listArtifacts
3. Read constraints: this.projectRepo.readConstraints(projectRoot) → string | null
4. Return { ticketContent, priorArtifacts, constraints }
```

---

## Verdict

**Approve with required changes:**

1. **Add `readArtifact()` to `ArtifactStore` port** — without this, the implementer cannot read artifact content through the hexagonal boundary. Requires amending M1-013 and the `FsArtifactStore` adapter.
2. **Add `readConstraints()` to `ProjectRepository` port** — without this, CONSTRAINTS.md cannot be read through a port.
3. **Define `AssembledContext` interface** — both M2-004 and M2-005 depend on this type; neither currently defines it.
4. **Resolve `ColumnSpec` parameter** — either use it for phase scoping or remove it.
5. **Fix port signature references** — implementation steps must use actual port method signatures.

After these amendments, the task is implementation-ready. File paths, layer placement, and dependency chain are correct. The assembly logic (ticket → artifacts → constraints) is sound and matches the system design's prompt structure.
