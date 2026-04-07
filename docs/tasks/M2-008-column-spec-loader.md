# Task: Implement Column Spec YAML Loader

**Milestone:** M2 — Dogfood Harness
**Agent:** typescript-pro
**Method:** Manual (last manual milestone)

## Context
Reads and validates `.aeos/column-specs/*.yaml` files at runtime. The orchestrator calls this before each column run to get the configuration for that column. Requires M2-007 (Zod schema) and a YAML parsing library.

## What needs to be done
Install: `npm install js-yaml` and `npm install -D @types/js-yaml`

Implement in `src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts` (implements `ColumnSpecLoader` port) and `src/infrastructure/spec-loader/yaml-agent-spec-loader.adapter.ts` (implements `AgentSpecLoader` port):


```typescript
/**
 * Loads and validates the column spec for the given column name.
 * Looks for <projectRoot>/.aeos/column-specs/<column>.yaml (case-insensitive filename match)
 * Throws ColumnSpecNotFoundError if the file does not exist.
 * Throws ZodError if the file content does not match the schema.
 */
export function loadColumnSpec(
  column: Column,
  root?: string,
): ColumnSpec

/**
 * Loads and validates an agent spec YAML file.
 * `agentFile` is relative to <projectRoot>/.aeos/
 */
export function loadAgentSpec(
  agentFile: string,
  root?: string,
): AgentSpec

export class ColumnSpecNotFoundError extends Error {}
```

Implementation for `loadColumnSpec`:
1. Resolve path: `<aeosDir>/.aeos/column-specs/<column>.yaml`
2. If not found: throw `ColumnSpecNotFoundError`
3. Read and parse YAML using `js-yaml.load()`
4. Validate with `ColumnSpecSchema.parse()` — let ZodError propagate naturally
5. Return typed `ColumnSpec`

## Acceptance Criteria
- [ ] Given a valid `product_scoping.yaml` in `.aeos/column-specs/`, when calling `loadColumnSpec('PRODUCT_SCOPING')`, then a typed `ColumnSpec` is returned
- [ ] Given no file for the column, when calling `loadColumnSpec()`, then `ColumnSpecNotFoundError` is thrown
- [ ] Given a YAML file missing a required field, when calling `loadColumnSpec()`, then `ZodError` is thrown with a descriptive message
- [ ] Given `loadAgentSpec('agents/pm-agent.yaml')`, when calling it, then the agent YAML is parsed and validated

## Out of Scope
- Caching loaded specs between calls (v2 performance concern)
- Writing or updating column spec files

## Technical Notes / Hints
- Use `fs.readFileSync` (synchronous) — column spec loading is a setup operation, sync is fine
- `js-yaml.load()` returns `unknown` — always pass through Zod schema

## Dependencies
- M2-007: Zod schemas
- M1-012: `aeosDir()` helper

## Layer Mapping
```
Infrastructure:  src/infrastructure/spec-loader/yaml-column-spec-loader.adapter.ts  — ColumnSpecLoader impl
                 src/infrastructure/spec-loader/yaml-agent-spec-loader.adapter.ts    — AgentSpecLoader impl
Domain ports:    src/domain/ports/driven/column-spec-loader.port.ts
                 src/domain/ports/driven/agent-spec-loader.port.ts
Domain model:    src/domain/model/column-spec.ts — ColumnSpec type
                 src/domain/model/agent-spec.ts  — AgentSpec type
```

## Definition of Done
- [ ] `loadColumnSpec()` and `loadAgentSpec()` load, validate, and return typed specs
- [ ] Missing file throws `ColumnSpecNotFoundError`
- [ ] Unit tests: happy path, missing file, invalid YAML content
- [ ] Code reviewed and approved
