# Task: Define YAML Column Spec Zod Schema

**Milestone:** M2 — Dogfood Harness
**Agent:** typescript-pro
**Method:** Manual (last manual milestone)

## Context
Column specs are YAML files in `.aeos/column-specs/` that configure each pipeline column: which worker and reviewer agents to use, what sections are required in the output, min word count, reviewer rubric paths, max iteration limit, escalation behaviour, and advance mode. The Zod schema validates loaded YAML and provides TypeScript types. Required before the YAML loader (M2-008) can be built.

## What needs to be done
Install: `npm install zod`

Implement the Zod schemas alongside the existing domain model types. The schemas provide runtime validation; the inferred types replace the placeholder types:
- `ColumnSpecSchema` → `src/domain/model/column-spec.ts`
- `AgentSpecSchema` → `src/domain/model/agent-spec.ts`

Exports:

```typescript
import { z } from 'zod';

export const ColumnSpecSchema = z.object({
  column:            z.string(),
  phase:             z.enum(['PLAN', 'PREPARE', 'BUILD', 'DEPLOY']).optional(),
  workerAgentFile:   z.string(),   // relative path to worker agent YAML, e.g. "agents/pm-agent.yaml"
  reviewerAgentFile: z.string(),   // relative path to reviewer agent YAML, e.g. "agents/reviewer-agent.yaml"
  outputArtifact:    z.string(),   // artifact name, e.g. "prd.md"
  minWordCount:      z.number().int().positive().default(50),
  requiredSections:  z.array(z.string()).default([]),
  reviewerRubrics:   z.array(z.string()).default([]),  // paths to rubric .md files
  maxIterations:     z.number().int().positive().default(3),
  escalation:        z.enum(['escalate_to_human', 'mark_done']).default('escalate_to_human'),
  advanceMode:       z.enum(['manual', 'auto']).default('manual'),
  preflight: z.object({
    enabled: z.boolean().default(true),
    questionsArtifact: z.string().default('questions.md'),
  }).default({}),
});

export type ColumnSpec = z.infer<typeof ColumnSpecSchema>;
```

Also export an `AgentSpecSchema`:
```typescript
export const AgentSpecSchema = z.object({
  name:         z.string(),
  role:         z.enum(['worker', 'reviewer']).optional(),
  systemPrompt: z.string(),
  taskInstruction: z.string(),
  outputFormat: z.string(),
  selfVerificationChecklist: z.array(z.string()).default([]),
  executor: z.object({
    type: z.enum(['claude-cli', 'stub']),
    model: z.string().optional(),
    timeoutSeconds: z.number().int().positive().default(300),
  }),
});

export type AgentSpec = z.infer<typeof AgentSpecSchema>;
```

## Acceptance Criteria
- [ ] Given a valid YAML object, when parsing with `ColumnSpecSchema.parse()`, then a typed `ColumnSpec` is returned
- [ ] Given a YAML object missing `column`, when parsing, then Zod throws a `ZodError`
- [ ] Given a YAML object with no `minWordCount`, when parsing, then default of `50` is applied
- [ ] Given `AgentSpecSchema`, when parsing an agent with `type: "stub"`, then no error is thrown
- [ ] Given `advanceMode: "invalid"`, when parsing, then Zod throws a `ZodError`
- [ ] Given a column spec with `maxIterations: 5`, when parsing, then `5` is returned
- [ ] Given a column spec with no `maxIterations`, when parsing, then default `3` is applied
- [ ] Given a column spec with `escalation: "mark_done"`, when parsing, then `"mark_done"` is returned
- [ ] Given a column spec with `workerAgentFile` and `reviewerAgentFile`, when parsing, then both paths are returned

## Out of Scope
- Writing column spec YAML files (that is done per-agent in M3–M6)
- Loading the YAML from disk (M2-008)

## Dependencies
- M0-002: TypeScript configured

## Layer Mapping
```
Domain model:  src/domain/model/column-spec.ts   — ColumnSpecSchema + ColumnSpec type
Domain model:  src/domain/model/agent-spec.ts     — AgentSpecSchema + AgentSpec type
Barrel:        src/domain/model/index.ts          — re-exports both
```

## Design Notes

### Executor type rename: `claude-code-cli` → `claude-cli`
System design §4.2 uses `claude-code-cli`. This task and M2-013 use the shorter `claude-cli`.
This is a deliberate simplification — the full name adds no clarity. All M2 tasks are aligned
on `claude-cli`. The system design should be updated to match.

### Zod in the domain layer
Zod schemas live in domain model files alongside the inferred types. This is a pragmatic choice:
the schema IS the type definition (via `z.infer`), so separating them would create duplication.
The Zod runtime dependency in the domain layer is accepted.

### Executor config on agent spec vs column spec
System design §4.2 places executor config on the column spec. This task places it on the agent spec.
Agent-level config is preferred: different agents may need different timeouts and models regardless
of which column they run in. The reviewer agent (M2-013) already defines its own executor config.

## Definition of Done
- [ ] Both schemas exported and compile cleanly
- [ ] Unit tests: valid parse, missing required field, default values applied
- [ ] Code reviewed and approved
