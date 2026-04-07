# Task: Implement `ContextAssembler`

**Milestone:** M2 — Dogfood Harness
**Agent:** backend-architect
**Method:** Manual (last manual milestone)

## Context
Assembles the full context payload passed to `PromptBuilder`. Reads the ticket file, all prior artifacts for this ticket, and the project `CONSTRAINTS.md`. This is the primary source of truth for what the model sees — getting the assembly order wrong is the most common cause of "well-formed but wrong content" artifact failures.

## What needs to be done
Create `src/prompt/context-assembler.ts` exporting:

```typescript
export interface AssembledContext {
  ticketContent: string;
  priorArtifacts: Array<{ name: string; content: string }>;
  constraints: string | null;
  columnSpec: ColumnSpec;
}

export async function assembleContext(
  ticketId: string,
  columnSpec: ColumnSpec,
  root?: string,
): Promise<AssembledContext>
```

Assembly order and logic:
1. Read `<ticketId>-ticket.md` → `ticketContent`
2. Call `listArtifacts(ticketId, root)` and read each file in lexicographic order → `priorArtifacts`
   - Exclude the ticket file itself from prior artifacts
3. Look for `CONSTRAINTS.md` at project root; read if present, set to `null` if absent
4. Return the assembled context object

## Acceptance Criteria
- [ ] Given a ticket with 2 prior artifacts, when calling `assembleContext()`, then `priorArtifacts` contains both in lexicographic order
- [ ] Given no `CONSTRAINTS.md`, when calling `assembleContext()`, then `constraints` is `null` (no error thrown)
- [ ] Given a `CONSTRAINTS.md` at project root, when calling `assembleContext()`, then `constraints` contains its content
- [ ] Given the ticket file itself is in the artifacts directory, when assembling, then it does NOT appear in `priorArtifacts`

## Out of Scope
- Prompt construction (M2-005 — `PromptBuilder`)
- Token counting or truncation (v2 concern)

## Technical Notes / Hints
- Lexicographic order of artifact file names ensures deterministic assembly: `AEOS-1-prd.md` before `AEOS-1-tech-spec.md`
- Use `node:fs/promises` for async reads

## Dependencies
- M1-013: `listArtifacts()` and `artifactPath()`
- M2-008: `ColumnSpec` type (from column spec loader)

## Definition of Done
- [ ] `assembleContext()` correctly reads and orders all context pieces
- [ ] Unit tests: 0 artifacts, 2 artifacts, missing CONSTRAINTS.md, CONSTRAINTS.md present
- [ ] Code reviewed and approved
