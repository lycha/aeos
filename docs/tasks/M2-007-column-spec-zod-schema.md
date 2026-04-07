# Task: Define YAML Column Spec Zod Schema

**Milestone:** M2 — Dogfood Harness
**Agent:** typescript-pro
**Method:** Manual (last manual milestone)

## Context
Column specs are YAML files in `.aeos/column-specs/` that configure each pipeline column: which agent to use, what sections are required in the output, min word count, reviewer rubric paths, and advance mode. The Zod schema validates loaded YAML and provides TypeScript types. Required before the YAML loader (M2-008) can be built.

## What needs to be done
Install: `npm install zod`

Create `src/column-spec/schema.ts` exporting:

```typescript
import { z } from 'zod';

export const ColumnSpecSchema = z.object({
  column:      z.string(),
  agentFile:   z.string(),   // relative path to agent YAML, e.g. "agents/pm-agent.yaml"
  outputArtifact: z.string(), // artifact name, e.g. "prd.md"
  minWordCount:   z.number().int().positive().default(50),
  requiredSections: z.array(z.string()).default([]),
  reviewerRubrics: z.array(z.string()).default([]),  // paths to rubric .md files
  advanceMode: z.enum(['manual', 'auto']).default('manual'),
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
  systemPrompt: z.string(),
  taskInstruction: z.string(),
  outputFormat: z.string(),
  selfVerificationChecklist: z.array(z.string()).default([]),
  executor: z.object({
    type: z.enum(['claude-cli', 'stub']),
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

## Out of Scope
- Writing column spec YAML files (that is done per-agent in M3–M6)
- Loading the YAML from disk (M2-008)

## Dependencies
- M0-002: TypeScript configured

## Definition of Done
- [ ] Both schemas exported and compile cleanly
- [ ] Unit tests: valid parse, missing required field, default values applied
- [ ] Code reviewed and approved
