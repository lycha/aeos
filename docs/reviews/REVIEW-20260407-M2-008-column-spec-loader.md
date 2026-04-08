# Deep Review: M2-008 — Implement Column Spec YAML Loader

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Task specification — `docs/tasks/M2-008-column-spec-loader.md`
**Cross-referenced against:** System design (03-system-design.md §3.3, §5.1, §5.4), PRD (02-prd.md §5.4, §5.5), Action plan (05-action-plan-v1.md §M2), sibling tasks M1-012, M2-007, M2-009, M2-011, M2-013, existing scaffold in `src/`, prior review REVIEW-20260407-M2-007-column-spec-zod-schema.md

---

## Overall Assessment

The task correctly identifies the two adapter files (`yaml-column-spec-loader.adapter.ts`, `yaml-agent-spec-loader.adapter.ts`), the corresponding domain ports, and the domain model types. The task's layer mapping matches the hexagonal scaffold on disk exactly. The dependency on M2-007 (Zod schemas) and M1-012 (`aeosDir()` helper) is correct and complete.

However, the task has **one major issue**, **two medium issues**, and **several minor observations**. The major issue is a type/API mismatch that would cause a compile error.

**Verdict:** Approve with required changes.

---

## 1. Correctness vs System Design

### ⚠️ MAJOR (GAP-1): `loadColumnSpec()` signature accepts `Column` but the adapter needs a string filename — type mismatch with system design's YAML naming convention

The task defines:
```typescript
export function loadColumnSpec(column: Column, root?: string): ColumnSpec
```

The `Column` type (from `src/domain/model/column.ts`) uses uppercase enum values: `PRODUCT_SCOPING`, `ARCH_SPIKE`, `TECH_SPEC`, etc. But the system design §3.3 defines YAML filenames with lowercase-kebab: `product-scoping.yaml`, `architecture-spike.yaml`, `tech-spec.yaml`.

The task says "case-insensitive filename match" and step 1 resolves `<aeosDir>/.aeos/column-specs/<column>.yaml`. But inserting `PRODUCT_SCOPING` directly would look for `PRODUCT_SCOPING.yaml`, not `product-scoping.yaml`.

**Two sub-problems:**
1. The mapping from `Column` enum value to YAML filename is not defined. The task needs a column-to-filename mapping (e.g., `PRODUCT_SCOPING` → `product-scoping`, `ARCH_SPIKE` → `architecture-spike`). A simple `toLowerCase().replace(/_/g, '-')` would produce `product-scoping` and `arch-spike`, but the system design uses `architecture-spike` (not `arch-spike`). This means the mapping is not a trivial string transform.
2. The system design §3.3 lists 6 column spec files but the `Column` enum has 9 values (including `BACKLOG`, `DOD_GATE`, `DONE`). `BACKLOG` has no agent run, `DONE` is a terminal state. Should `loadColumnSpec('BACKLOG')` throw `ColumnSpecNotFoundError` or is this a caller concern?

**Impact:** Without a defined column-to-filename mapping, the implementation will either fail at runtime (wrong filename) or require the implementer to invent one, creating an undocumented convention.

**Recommendation:** Add an explicit mapping table or convention:
```typescript
const COLUMN_YAML_FILENAMES: Partial<Record<Column, string>> = {
  PRODUCT_SCOPING: 'product-scoping',
  ARCH_SPIKE: 'architecture-spike',
  TECH_SPEC: 'tech-spec',
  IMPLEMENTATION: 'implementation',
  CODE_REVIEW: 'code-review',
  QA: 'qa',
};
```
Document that `BACKLOG`, `DOD_GATE`, and `DONE` have no column specs and `loadColumnSpec()` should throw `ColumnSpecNotFoundError` for these.

### ✅ `loadAgentSpec()` — ALIGNED with system design

The function signature `loadAgentSpec(agentFile: string, root?: string): AgentSpec` correctly takes a relative path (e.g., `agents/pm-agent.yaml`). System design §5.1 shows agent specs as standalone YAML files. M2-013's `reviewer-agent.yaml` is loaded this way. The relative-to-`.aeos/` convention matches the column spec's `workerAgentFile` and `reviewerAgentFile` fields (as amended by M2-007 review). ✓

### ✅ Path resolution: `<aeosDir>/.aeos/column-specs/<column>.yaml` — REDUNDANT `.aeos`

The task says step 1 resolves `<aeosDir>/.aeos/column-specs/<column>.yaml`. But `aeosDir()` already returns `projectRoot() + '/.aeos'` (confirmed in `fs-project.repository.ts` line 43). So the resolved path would be `<root>/.aeos/.aeos/column-specs/<column>.yaml` — double `.aeos`.

**Impact:** Implementation bug if followed literally.

**Recommendation:** Correct to: `<aeosDir>/column-specs/<column>.yaml` (i.e., `path.join(aeosDir(root), 'column-specs', filename + '.yaml')`).

### ✅ Synchronous I/O — ALIGNED with system design

The task correctly uses `fs.readFileSync`. Column spec loading is a setup operation called before the async executor run. The codebase already uses synchronous filesystem operations in the infrastructure layer (`fs-project.repository.ts`). ✓

---

## 2. Dependencies

### ✅ M2-007 (Zod schemas) — CORRECT
The task correctly depends on `ColumnSpecSchema` and `AgentSpecSchema` for validation. The schemas are defined in `src/domain/model/column-spec.ts` and `src/domain/model/agent-spec.ts`. ✓

### ✅ M1-012 (`aeosDir()` helper) — CORRECT
`aeosDir()` is implemented in `src/infrastructure/filesystem/fs-project.repository.ts` (line 42) and returns the absolute path to `.aeos/`. ✓

### ⚠️ INFO: Missing explicit dependency on `js-yaml` installation
The task includes `npm install js-yaml` and `npm install -D @types/js-yaml` in the instructions. This is correct but should be noted as a pre-implementation step. No other M2 task installs `js-yaml`. ✓

---

## 3. File Path Alignment with Hexagonal Scaffold


| Task path | Exists on disk | Content |
|-----------|---------------|---------|
| `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts` | ✓ | `// Adapter — YAML+Zod implementation of ColumnSpecLoader port` (placeholder) |
| `src/infrastructure/spec-loader/yaml-agent-spec-loader.adapter.ts` | ✓ | `// Adapter — YAML+Zod implementation of AgentSpecLoader port` (placeholder) |
| `src/infrastructure/spec-loader/index.ts` | ✓ | Barrel re-exports both adapters |
| `src/domain/ports/driven/column-spec-loader.port.ts` | ✓ | `// Driven port — ColumnSpecLoader` (placeholder) |
| `src/domain/ports/driven/agent-spec-loader.port.ts` | ✓ | `// Driven port — AgentSpecLoader` (placeholder) |
| `src/domain/ports/driven/index.ts` | ✓ | Barrel re-exports both ports (lines 9–10) |
| `src/domain/model/column-spec.ts` | ✓ | Placeholder (Zod schema goes here via M2-007) |
| `src/domain/model/agent-spec.ts` | ✓ | Placeholder (Zod schema goes here via M2-007) |

### ✅ Layer placement is correct

The adapters are in `src/infrastructure/spec-loader/` — infrastructure layer, implementing driven ports in `src/domain/ports/driven/`. This follows the hexagonal architecture pattern established across the codebase. ✓

### ✅ Barrel exports already wired

Both `src/infrastructure/spec-loader/index.ts` and `src/domain/ports/driven/index.ts` already re-export the relevant modules. No barrel changes needed. ✓

---

## 4. Consistency with Sibling Tasks

### vs M2-007 (Column Spec Zod Schema) — ⚠️ MEDIUM (M1): Task defines free functions, not port interface implementations

The task defines `loadColumnSpec()` and `loadAgentSpec()` as free exported functions. However, M2-011 (`ticket-run` use case) injects `columnSpecLoader: ColumnSpecLoader` and `agentSpecLoader: AgentSpecLoader` as port interfaces via constructor injection. The port files (`column-spec-loader.port.ts`, `agent-spec-loader.port.ts`) exist as placeholders.

The task's layer mapping section correctly lists both ports and both adapters, but the "What needs to be done" section only shows free functions — it does not define the port interfaces or show the adapter class implementing them.

**Impact:** An implementer following the task literally would produce free functions that cannot be injected through the port pattern. M2-011's constructor would fail to type-check.

**Recommendation:** Define the port interfaces explicitly and show the adapter implementing them:
```typescript
// Port: src/domain/ports/driven/column-spec-loader.port.ts
export interface ColumnSpecLoader {
  load(column: Column, root?: string): ColumnSpec;
}

// Adapter: src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts
export class YamlColumnSpecLoader implements ColumnSpecLoader {
  load(column: Column, root?: string): ColumnSpec { ... }
}
```

### vs M2-007 (Column Spec Zod Schema) — ✅ Schema usage ALIGNED

The task correctly calls `ColumnSpecSchema.parse()` on the loaded YAML. M2-007 defines `ColumnSpecSchema` in `src/domain/model/column-spec.ts` with all required fields (as amended by the M2-007 review: `workerAgentFile`, `reviewerAgentFile`, `maxIterations`, `escalation`, etc.). ✓

### vs M2-009 (Preflight Pass) — ✅ CONSISTENT

M2-009's `PreflightService.run()` accepts `columnSpec: ColumnSpec` and `agentSpec: AgentSpec` as parameters. These are loaded by M2-008's loaders and passed in by M2-011. The data flow is clean. ✓

### vs M2-011 (ticket-run use case) — ✅ CONSISTENT (with M1 caveat)

M2-011's constructor takes `columnSpecLoader: ColumnSpecLoader` and `agentSpecLoader: AgentSpecLoader`. Step 2: "Load ColumnSpec via columnSpecLoader; load AgentSpec via agentSpecLoader." This matches M2-008's purpose exactly. The port interfaces must be defined (see M1 above). ✓

### vs M2-013 (reviewer-agent.yaml) — ✅ CONSISTENT

M2-013 depends on M2-008 (`loadAgentSpec()` to confirm the YAML loads correctly). The task's `loadAgentSpec('agents/reviewer-agent.yaml')` matches M2-013's file location. ✓

### vs M1-012 (`aeosDir()`) — ✅ CONSISTENT

The task correctly lists M1-012 as a dependency. `aeosDir()` is implemented and returns `projectRoot() + '/.aeos'`. The loader uses this to resolve column spec and agent spec paths. ✓

---

## 5. Gaps That Would Block Implementation

### ⚠️ MAJOR (GAP-1): Column-to-filename mapping undefined — BLOCKS happy-path implementation

Without a defined mapping from `Column` enum values to YAML filenames, the implementer cannot write the path resolution logic. The system design's filenames (`architecture-spike.yaml`) do not match a simple transform of the enum values (`ARCH_SPIKE`). This must be specified.

### ⚠️ MEDIUM (M1): Port interfaces not defined — BLOCKS M2-011 integration

M2-011 injects `ColumnSpecLoader` and `AgentSpecLoader` as typed port interfaces. The task shows free functions but does not define the port interface contracts. The implementer must either define them (undocumented) or produce code that doesn't integrate with M2-011.

### ⚠️ MEDIUM (M2): `ColumnSpecNotFoundError` location not specified

The task defines `ColumnSpecNotFoundError` but does not specify where it should live. The existing error classes (`ProjectRootNotFoundError`, `ProjectConfigNotFoundError`, `ProjectConfigCorruptError`) are all in `src/shared/errors.ts`. The new error should follow the same pattern but the task doesn't mention this file.

**Recommendation:** Add to layer mapping: `Shared: src/shared/errors.ts — ColumnSpecNotFoundError`

### ✅ No other blocking gaps

`js-yaml` installation is documented. Zod schemas will be available from M2-007. `aeosDir()` is implemented and tested. Scaffold files exist for all referenced paths.

---

## 6. Minor Issues and Recommendations

### m1: Double `.aeos` in path resolution

Task step 1 says: "Resolve path: `<aeosDir>/.aeos/column-specs/<column>.yaml`". Since `aeosDir()` already returns `<root>/.aeos`, this would produce `<root>/.aeos/.aeos/column-specs/...`. Should be `<aeosDir>/column-specs/<column>.yaml`.

### m2: `loadAgentSpec` — no `AgentSpecNotFoundError`

`loadColumnSpec` throws `ColumnSpecNotFoundError` for missing files, but `loadAgentSpec` has no equivalent error class for missing agent YAML files. The task should define `AgentSpecNotFoundError` or reuse a generic `SpecNotFoundError`.

### m3: Acceptance criteria reference `product_scoping.yaml` with underscores

AC line 1: "Given a valid `product_scoping.yaml`..." — but system design §3.3 uses `product-scoping.yaml` (kebab-case). This inconsistency reinforces GAP-1 (no defined filename convention).

### m4: No mention of `js-yaml` type for the loaded YAML

`js-yaml.load()` returns `unknown` (with default schema) or can return specific types depending on the schema option. The task correctly notes "always pass through Zod schema" but doesn't mention the `js-yaml` schema option. Using `js-yaml.load(content, { schema: js-yaml.DEFAULT_SCHEMA })` is the safe default. Minor — implementer detail.

### m5: Return type is synchronous but task says "loads at runtime"

The task context says "The orchestrator calls this before each column run." M2-011's orchestration is `async` (executor returns `Promise<ExecutorResult>`). The synchronous return from the loader is correct (setup operation), but the task could note that these are intentionally sync despite being called from an async context.

---

## Findings Summary

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| GAP-1 | **Major** | Column-to-filename mapping undefined — `ARCH_SPIKE` → `architecture-spike.yaml` is not a trivial transform | Add explicit mapping table; document which columns have no spec |
| M1 | Medium | Free functions instead of port interface + adapter class — M2-011 expects typed `ColumnSpecLoader`/`AgentSpecLoader` ports | Define port interfaces; show adapter implementing them |
| M2 | Medium | `ColumnSpecNotFoundError` location not specified — should follow pattern in `src/shared/errors.ts` | Add to layer mapping |
| m1 | Minor | Double `.aeos` in path resolution step | Correct to `<aeosDir>/column-specs/...` |
| m2 | Minor | No `AgentSpecNotFoundError` for missing agent YAML files | Define or reuse generic error |
| m3 | Minor | AC uses `product_scoping.yaml` (underscores) vs system design's `product-scoping.yaml` (kebab) | Align with system design |
| m4 | Minor | No mention of `js-yaml` schema option | Implementer detail — no action needed |
| m5 | Minor | Sync return from async context not explained | Add technical note |
| — | Info | `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts` exists as scaffold placeholder | ✓ |
| — | Info | `src/infrastructure/spec-loader/yaml-agent-spec-loader.adapter.ts` exists as scaffold placeholder | ✓ |
| — | Info | `src/infrastructure/spec-loader/index.ts` barrel already wired | ✓ |
| — | Info | `src/domain/ports/driven/index.ts` barrel already includes both loader ports | ✓ |
| — | Info | `aeosDir()` implemented in `fs-project.repository.ts` line 42 | ✓ |
| — | Info | `js-yaml` not yet in `package.json` — task includes install command | ✓ |

---

## Recommended Task Amendments

### 1. Add column-to-filename mapping

```typescript
/** Maps Column enum values to their YAML spec filenames (without extension). */
const COLUMN_SPEC_FILENAMES: Partial<Record<Column, string>> = {
  PRODUCT_SCOPING: 'product-scoping',
  ARCH_SPIKE: 'architecture-spike',
  TECH_SPEC: 'tech-spec',
  IMPLEMENTATION: 'implementation',
  CODE_REVIEW: 'code-review',
  QA: 'qa',
};
```

Document that `BACKLOG`, `DOD_GATE`, and `DONE` are excluded — `loadColumnSpec()` throws `ColumnSpecNotFoundError` for these.

### 2. Define port interfaces

```typescript
// src/domain/ports/driven/column-spec-loader.port.ts
import type { Column } from '../../model/column.js';
import type { ColumnSpec } from '../../model/column-spec.js';

export interface ColumnSpecLoader {
  load(column: Column, root?: string): ColumnSpec;
}

// src/domain/ports/driven/agent-spec-loader.port.ts
import type { AgentSpec } from '../../model/agent-spec.js';

export interface AgentSpecLoader {
  load(agentFile: string, root?: string): AgentSpec;
}
```

### 3. Update layer mapping to include error class location

```
Shared:          src/shared/errors.ts — ColumnSpecNotFoundError, AgentSpecNotFoundError
```

### 4. Fix path resolution in implementation steps

Change step 1 from:
> Resolve path: `<aeosDir>/.aeos/column-specs/<column>.yaml`

To:
> Resolve path: `path.join(aeosDir(root), 'column-specs', COLUMN_SPEC_FILENAMES[column] + '.yaml')`

### 5. Fix acceptance criteria filename

Change:
> Given a valid `product_scoping.yaml` in `.aeos/column-specs/`

To:
> Given a valid `product-scoping.yaml` in `.aeos/column-specs/`

---

## Verdict

**Approve with required changes:**

1. **Add explicit column-to-filename mapping** — the `Column` enum values and system design YAML filenames don't have a trivial mapping (`ARCH_SPIKE` → `architecture-spike`). Without this, the implementation will silently fail to find spec files.
2. **Define port interfaces** (`ColumnSpecLoader`, `AgentSpecLoader`) — M2-011 injects these as typed ports via constructor injection. Free functions don't satisfy the hexagonal architecture contract.
3. **Fix the double `.aeos` in path resolution** — `aeosDir()` already includes `.aeos`, so the documented step would produce an incorrect path.
4. **Specify error class location** in `src/shared/errors.ts` following the established pattern.

The task is otherwise well-scoped and well-structured. The split into two loaders (column specs and agent specs) correctly mirrors the two port files and two adapter files already scaffolded. The acceptance criteria cover happy path, missing file, and invalid YAML. The dependency chain (M2-007 → M2-008 → M2-011) is clean. The `js-yaml` library choice is appropriate for synchronous YAML parsing. Implementation should be straightforward after the amendments above.
