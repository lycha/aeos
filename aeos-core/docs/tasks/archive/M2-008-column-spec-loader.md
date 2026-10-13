# Task: Implement Column Spec YAML Loader

**Milestone:** M2 — Dogfood Harness
**Agent:** typescript-pro
**Method:** Manual (last manual milestone)

## Context
Reads and validates `.aeos/column-specs/*.yaml` files at runtime. The orchestrator calls this before each column run to get the configuration for that column. Requires M2-007 (Zod schema) and a YAML parsing library.

## What needs to be done
Install: `npm install js-yaml` and `npm install -D @types/js-yaml`

### Port interfaces

Define the port interfaces that the adapters implement (required for M2-011 constructor injection):

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

### Column-to-filename mapping

The `Column` enum values do not map to YAML filenames via a trivial string transform (e.g. `ARCH_SPIKE` → `architecture-spike`, not `arch-spike`). Define an explicit mapping:

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

`BACKLOG`, `DOD_GATE`, and `DONE` have no column specs. `loadColumnSpec()` (i.e. `YamlColumnSpecLoader.load()`) must throw `ColumnSpecNotFoundError` for these columns.

### Adapter classes

Implement in `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts` (implements `ColumnSpecLoader` port) and `src/infrastructure/spec-loader/yaml-agent-spec-loader.adapter.ts` (implements `AgentSpecLoader` port):

```typescript
// src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts
export class YamlColumnSpecLoader implements ColumnSpecLoader {
  /**
   * Loads and validates the column spec for the given column.
   * Resolves path: path.join(aeosDir(root), 'column-specs', COLUMN_SPEC_FILENAMES[column] + '.yaml')
   * Throws ColumnSpecNotFoundError if the column has no spec or the file does not exist.
   * Throws ZodError if the file content does not match the schema.
   */
  load(column: Column, root?: string): ColumnSpec;
}

// src/infrastructure/spec-loader/yaml-agent-spec-loader.adapter.ts
export class YamlAgentSpecLoader implements AgentSpecLoader {
  /**
   * Loads and validates an agent spec YAML file.
   * `agentFile` is relative to aeosDir() (e.g. 'agents/pm-agent.yaml')
   * Throws AgentSpecNotFoundError if the file does not exist.
   * Throws ZodError if the file content does not match the schema.
   */
  load(agentFile: string, root?: string): AgentSpec;
}
```

### Error classes

Defined in `src/shared/errors.ts` (following the existing pattern for `ProjectRootNotFoundError`, etc.):

```typescript
export class ColumnSpecNotFoundError extends Error {}
export class AgentSpecNotFoundError extends Error {}
```

### Implementation steps for `YamlColumnSpecLoader.load()`:
1. Look up `COLUMN_SPEC_FILENAMES[column]` — if not found, throw `ColumnSpecNotFoundError`
2. Resolve path: `path.join(aeosDir(root), 'column-specs', COLUMN_SPEC_FILENAMES[column] + '.yaml')`
3. If file not found: throw `ColumnSpecNotFoundError`
4. Read and parse YAML using `js-yaml.load(content, { schema: js-yaml.DEFAULT_SCHEMA })`
5. Validate with `ColumnSpecSchema.parse()` — let ZodError propagate naturally
6. Return typed `ColumnSpec`

## Acceptance Criteria
- [ ] Given a valid `product-scoping.yaml` in `.aeos/column-specs/`, when calling `loadColumnSpec('PRODUCT_SCOPING')`, then a typed `ColumnSpec` is returned
- [ ] Given a column with no spec (`BACKLOG`, `DOD_GATE`, `DONE`), when calling `loadColumnSpec()`, then `ColumnSpecNotFoundError` is thrown
- [ ] Given no file for a mapped column, when calling `loadColumnSpec()`, then `ColumnSpecNotFoundError` is thrown
- [ ] Given a YAML file missing a required field, when calling `loadColumnSpec()`, then `ZodError` is thrown with a descriptive message
- [ ] Given `loadAgentSpec('agents/pm-agent.yaml')`, when calling it, then the agent YAML is parsed and validated
- [ ] Given a missing agent YAML file, when calling `loadAgentSpec()`, then `AgentSpecNotFoundError` is thrown

## Out of Scope
- Caching loaded specs between calls (v2 performance concern)
- Writing or updating column spec files

## Technical Notes / Hints
- Use `fs.readFileSync` (synchronous) — column spec loading is a setup operation; intentionally sync despite being called from an async context (M2-011's executor)
- `js-yaml.load()` returns `unknown` — always pass through Zod schema; use `{ schema: js-yaml.DEFAULT_SCHEMA }` for safety

## Dependencies
- M2-007: Zod schemas
- M1-012: `aeosDir()` helper

## Layer Mapping
```
Infrastructure:  src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts  — YamlColumnSpecLoader (implements ColumnSpecLoader)
                 src/infrastructure/spec-loader/yaml-agent-spec-loader.adapter.ts    — YamlAgentSpecLoader (implements AgentSpecLoader)
Domain ports:    src/domain/ports/driven/column-spec-loader.port.ts                  — ColumnSpecLoader interface
                 src/domain/ports/driven/agent-spec-loader.port.ts                   — AgentSpecLoader interface
Domain model:    src/domain/model/column-spec.ts — ColumnSpec type
                 src/domain/model/agent-spec.ts  — AgentSpec type
Shared:          src/shared/errors.ts — ColumnSpecNotFoundError, AgentSpecNotFoundError
```

## Definition of Done
- [ ] `YamlColumnSpecLoader.load()` and `YamlAgentSpecLoader.load()` load, validate, and return typed specs
- [ ] Missing file throws `ColumnSpecNotFoundError` / `AgentSpecNotFoundError`
- [ ] Columns without specs (`BACKLOG`, `DOD_GATE`, `DONE`) throw `ColumnSpecNotFoundError`
- [ ] Unit tests: happy path, missing file, invalid YAML content
- [ ] Code reviewed and approved
