# Deep Review: M2-010 — Implement `aeos ticket answer <id>` CLI Command

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Task specification — `docs/tasks/M2-010-cli-ticket-answer.md`
**Cross-referenced against:** System design (03-system-design.md §7.1, §7.2, §4.2), PRD (02-prd.md §5.8), Action plan (05-action-plan-v1.md §M2), sibling tasks M2-009, M2-011, M2-012, M1-008, M1-009, existing scaffold in `src/`, prior reviews (M2-009 review)

---

## Overall Assessment

The task correctly identifies `ticket answer` as the operator-initiated unblock after a pre-flight BLOCKED state. The concept, flow, and placement in M2 are sound. The layer mapping places the use case in the application layer and the CLI command in the correct scaffold paths — both files already exist as placeholders.

However, the task has **three major issues**, **two medium issues**, and **several minor observations**. The major issues involve non-existent port methods and a missing dependency that would prevent compilation.

**Verdict:** Approve with required changes.

---

## 1. Correctness vs System Design

### ⚠️ MAJOR (GAP-1): `ArtifactStore.artifactExists()` does not exist on the port

The task says:
```
3. Check questions file exists via `ArtifactStore.artifactExists(ticketId, 'questions.md')`
```

The implemented `ArtifactStore` port (`src/domain/ports/driven/artifact-store.port.ts`) has only three methods:
- `writeArtifact(projectPath, ticketId, filename, content)`
- `removeArtifact(projectPath, ticketId, filename)`
- `listArtifacts(projectPath, ticketId)`

There is **no `artifactExists()` method**. The `FsArtifactStore` adapter also does not implement one.

**Impact:** Compile error. The use case cannot call a method that does not exist on the port.

**Recommendation:** Either:
1. Add `artifactExists(projectPath: string, ticketId: string, filename: string): boolean` to the `ArtifactStore` port and implement it in `FsArtifactStore`, or
2. Use `listArtifacts(projectPath, ticketId)` and check if the questions filename is in the returned array — this avoids amending the port but is less clean.

### ⚠️ MAJOR (GAP-2): `ArtifactStore` calls missing `projectPath` — wrong arity throughout

The task shows:
```
ArtifactStore.artifactExists(ticketId, 'questions.md')
```

Even if `artifactExists` existed, every `ArtifactStore` method requires `projectPath` as its first argument. The task never mentions resolving or passing `projectPath` to the use case. The `ProjectRepository.findRoot()` or `ProjectRepository.read()` methods can resolve this, but the use case constructor and the described flow do not include them.

**Impact:** Every `ArtifactStore` call would fail due to missing `projectPath`.

**Recommendation:** The use case must receive `projectPath` — either as a constructor dependency (via `ProjectRepository`) or as a parameter from the CLI command (which resolves project context in step 2). Align with sibling M2-012 which shows "Resolve project context via `ProjectRepository`" in the CLI command.

### ⚠️ MAJOR (GAP-3): No mechanism to read the questions file content or mtime

The task step 4 says:
```
4. Read the questions file and verify it has been modified (file mtime > ticket `updated_at`)
```

The `ArtifactStore` port has **no `readArtifact()` method** and **no method to get file metadata (mtime)**. The port only supports `writeArtifact`, `removeArtifact`, and `listArtifacts`.

The technical hint says "Use `fs.statSync(path).mtime`" — but calling `fs.statSync` directly from the use case violates hexagonal architecture. The use case (application layer) must not depend on `node:fs` infrastructure.

**Impact:** The core "file modified" check cannot be implemented through the port. Either the port must be extended or the architecture must be bent.

**Recommendation:** Add to the `ArtifactStore` port:
```typescript
readArtifact(projectPath: string, ticketId: string, filename: string): string;
getArtifactMtime(projectPath: string, ticketId: string, filename: string): Date | null;
```
Alternatively, combine into `getArtifactMetadata()` returning `{ content: string; mtime: Date } | null`. This keeps filesystem access in the adapter.

### ⚠️ MEDIUM (M1): Questions artifact filename mismatch with M2-009 and system design

The task uses `'questions.md'` as the artifact name:
```
ArtifactStore.artifactExists(ticketId, 'questions.md')
```

But per the M2-009 review (accepted amendment), M2-009 writes the file as:
```typescript
const questionsFilename = `${ticketId}-${columnSpec.preflight.questionsArtifact}`;
```

This means the actual file on disk is `AEOS-1-questions.md`, not `questions.md`. The system design §4.2 confirms: `SAAS-1-questions.md` (with ticket-ID prefix).

Additionally, `FsArtifactStore.writeArtifact()` takes `filename` as a literal — it does **not** prepend the ticket ID. But the standalone `writeArtifact()` helper function at the top of the adapter file **does** prepend `${ticketId}-`. The port-based path used by M2-009 writes the full filename `AEOS-1-questions.md` directly.

The `ticket-answer` use case must look for the **same filename** that M2-009 wrote: `${ticketId}-questions.md` (or more precisely, `${ticketId}-${columnSpec.preflight.questionsArtifact}`).

**Impact:** The use case would look for the wrong file and always fail the existence check.

**Recommendation:** Use `${ticketId}-questions.md` or derive from `columnSpec.preflight.questionsArtifact`. This requires either hardcoding the convention or loading the column spec (which adds a dependency on M2-008).

### ⚠️ MEDIUM (M2): `stateMachine.setSubState` call uses 3 args but task shows only conceptual call

The task says:
```
5. Call `stateMachine.setSubState(projectId, ticketId, 'WORKING')`
```

This matches the implemented signature: `setSubState(projectId: string, ticketId: string, subState: SubState)`. ✅ Correct.

However, the use case step 1 says `TicketRepository.findById(projectId, ticketId)` — this implies `projectId` is available. But the use case constructor lists no dependencies, and the "What needs to be done" section does not specify constructor injection. Sibling tasks (M2-011, M2-012) explicitly list constructor dependencies.

**Impact:** Ambiguity on how the use case gets its port dependencies.

**Recommendation:** Add an explicit constructor dependency list, matching the pattern established by M2-011 and M2-012.

### ✅ Sub-state transition BLOCKED → WORKING — ALIGNED

The system design §7.1 sub-state map shows:
```
BLOCKED → Available actions: [answer] [sendback]
```

The `answer` action transitioning to WORKING is correct. The `setSubState()` method allows any sub-state transition within a column (no validation rules in v1). ✓

### ✅ System design §7.2 flow — ALIGNED

The system design §7.2 says:
```
The operator answers by editing T001-questions.md directly and running:
aeos ticket answer T001
This commits the answered file and triggers the main run with the questions file injected.
```

The task implements the answer command but explicitly puts "Auto-resuming the run after answering" in Out of Scope. This is a **deliberate deviation**: the system design implies `ticket answer` triggers the main run, but the task requires `ticket run` to be called separately. This is acceptable for M2 but should be documented.

---

## 2. Dependencies

### ✅ M1-008/M1-009 (StateMachineService) — CORRECT
`setSubState()` is implemented with the expected 3-parameter signature. ✓

### ✅ M2-009 (Pre-flight pass) — CORRECT
M2-009 creates the questions file that M2-010 checks. The dependency direction is correct. ✓

### ⚠️ Missing dependency: `ArtifactStore` port amendments
The use case requires `artifactExists()`, `readArtifact()` (or `getArtifactMtime()`) — none of which exist on the current port. These are not listed as dependencies.

### ⚠️ Missing dependency: `ColumnSpec` / `ColumnSpecLoader`
If the questions filename is derived from `columnSpec.preflight.questionsArtifact` (as it should be for consistency with M2-009), then M2-007/M2-008 become dependencies. Currently not listed.

### ⚠️ Missing dependency: `ProjectRepository`
The use case needs `projectPath` for all `ArtifactStore` calls. The CLI command says "Resolve project context via `ProjectRepository`" but the use case has no access to it. Either the CLI passes `projectPath` to the use case, or the use case injects `ProjectRepository`.

---

## 3. File Path Alignment with Hexagonal Scaffold

| Task path | Exists on disk | Content |
|-----------|---------------|---------|
| `src/cli/commands/ticket-answer.command.ts` | ✓ | Placeholder: `// CLI command — aeos ticket answer` |
| `src/application/ticket-answer.use-case.ts` | ✓ | Placeholder: `// Use case — TicketAnswer` |
| `src/domain/services/state-machine.ts` | ✓ | Full implementation with `setSubState()` |
| `src/domain/ports/driven/artifact-store.port.ts` | ✓ | 3-method interface (missing `artifactExists`, `readArtifact`, `getArtifactMtime`) |
| `src/domain/ports/driving/ticket-answer.port.ts` | ✓ | Placeholder: `// Driving port — TicketAnswer` |

### ✅ Layer placement is correct
CLI → Application use case → Domain service/ports. The hexagonal architecture is respected. ✓

### ⚠️ INFO: Driving port not defined
The `ticket-answer.port.ts` placeholder exists but the task does not define the driving port interface. Sibling tasks implicitly define their driving ports. The task should specify the interface shape for consistency.

---

## 4. Consistency with Sibling Tasks

### vs M2-009 (preflight pass) — ⚠️ FILENAME MISMATCH
M2-009 (as amended per its review) writes: `${ticketId}-${columnSpec.preflight.questionsArtifact}` (e.g., `AEOS-1-questions.md`).
M2-010 checks: `ArtifactStore.artifactExists(ticketId, 'questions.md')` (bare `questions.md`).
These do not match. See GAP-1 / M1 above.

### vs M2-011 (ticket-run) — ✅ CONSISTENT
M2-011 step 3 says: "Run pre-flight (M2-009); if blocked → return blocked result." The `ticket-answer` command correctly handles the BLOCKED state that `ticket-run` leaves behind. ✓

### vs M2-012 (ticket-approve) — ✅ PATTERN CONSISTENT
Both follow the same CLI command pattern: parse `<id>`, resolve project, call use case, print result/error. M2-012 explicitly lists constructor dependencies — M2-010 should do the same. ✓ (with gap noted)

### vs M1-009 (setSubState) — ✅ ALIGNED
The `setSubState(projectId, ticketId, 'WORKING')` call matches the implemented signature exactly. ✓

---

## 5. Gaps That Would Block Implementation

### ⚠️ MAJOR (GAP-1): `ArtifactStore.artifactExists()` does not exist — BLOCKS compilation
No such method on the port or adapter. Must be added or worked around via `listArtifacts()`.

### ⚠️ MAJOR (GAP-2): `projectPath` not available to use case — BLOCKS all `ArtifactStore` calls
Every port method requires `projectPath` but the use case has no way to obtain it.

### ⚠️ MAJOR (GAP-3): No port method to read file content or mtime — BLOCKS core validation logic
The "file modified" check requires `fs.statSync().mtime`, but the port has no metadata accessor. Calling `fs` directly from the use case violates hexagonal architecture.

### ⚠️ MEDIUM: Filename convention mismatch with M2-009 — BLOCKS correct file lookup
Use case would look for the wrong filename.

---

## 6. Minor Issues and Recommendations

### m1: Confirmation prompt (`readline`) — hexagonal concern
The task says to use `readline` from `node:readline` for the interactive prompt. This is an infrastructure concern. In strict hexagonal architecture, the CLI command layer should handle the prompt, not the use case. The use case should return a result like `{ needsConfirmation: true }`, and the CLI command should prompt the user and call the use case again with `{ confirmed: true }`.

### m2: `ticket.updated_at` vs file mtime comparison — timezone/precision concerns
The task compares `file mtime > ticket updated_at`. The `Ticket.updatedAt` is an ISO-8601 string. Comparing a `Date` object (from `fs.statSync`) against a parsed ISO string is fragile. Should specify that both values are converted to epoch milliseconds for comparison.

### m3: Missing test case — questions file exists but is empty
The AC covers: BLOCKED + modified file, not BLOCKED, unmodified file. Missing: questions file exists but has zero content (operator opened it but didn't write anything).

### m4: AC says `aeos ticket answer` without `<id>` for the unmodified-file case
AC #3: "when running `aeos ticket answer`" — missing the `<id>` argument. Should be `aeos ticket answer AEOS-1`.

### m5: System design §7.2 says `ticket answer` commits the answered file
The system design says: "This commits the answered file as `[T001][QUESTIONS][v1][human][answered]`." The task does not mention a git commit step. If the answered file should be committed, the use case needs `GitGateway` as a dependency.

### m6: No barrel re-export mentioned
The task does not mention adding the use case to `src/application/index.ts`. Existing use cases are re-exported there.

---

## Findings Summary

| # | Severity | Finding | Recommendation |
|---|----------|---------|----------------|
| GAP-1 | **Major** | `ArtifactStore.artifactExists()` does not exist on port | Add method to port + adapter, or use `listArtifacts()` |
| GAP-2 | **Major** | `projectPath` missing — all `ArtifactStore` calls impossible | Pass `projectPath` from CLI or inject `ProjectRepository` |
| GAP-3 | **Major** | No port method for file content/mtime — blocks core validation | Add `getArtifactMtime()` to `ArtifactStore` port |
| M1 | Medium | Filename `'questions.md'` vs M2-009's `'${ticketId}-questions.md'` — lookup fails | Use `${ticketId}-questions.md` |
| M2 | Medium | No constructor dependency list — ambiguous how use case gets ports | Add explicit constructor with injected ports |
| m1 | Minor | `readline` prompt belongs in CLI layer, not use case | Use case returns `{ needsConfirmation: true }`, CLI prompts |
| m2 | Minor | `Date` vs ISO-8601 string comparison fragile | Convert both to epoch ms |
| m3 | Minor | Missing test case for empty questions file | Add to DoD |
| m4 | Minor | AC #3 missing `<id>` argument in command | Fix typo |
| m5 | Minor | System design requires git commit of answered file — not mentioned | Add `GitGateway` dependency and commit step |
| m6 | Minor | Barrel re-export not mentioned | Add to `src/application/index.ts` |
| — | Info | `ticket-answer.command.ts` and `ticket-answer.use-case.ts` placeholders exist | ✓ |
| — | Info | `ticket-answer.port.ts` driving port placeholder exists but undefined | Define interface |
| — | Info | Out-of-scope "auto-resume" is a deliberate deviation from system design §7.2 | Acceptable for M2 |

---

## Recommended Task Amendments

### 1. Extend `ArtifactStore` port — add 3 methods

Add to `src/domain/ports/driven/artifact-store.port.ts`:
```typescript
artifactExists(projectPath: string, ticketId: string, filename: string): boolean;
readArtifact(projectPath: string, ticketId: string, filename: string): string;
getArtifactMtime(projectPath: string, ticketId: string, filename: string): Date | null;
```

This is a cross-cutting amendment affecting M2-009 and M2-011 as well. Document as a prerequisite sub-task or note in the Dependencies section.

### 2. Add explicit constructor dependencies

```typescript
export class TicketAnswerUseCase {
  constructor(
    private ticketRepo: TicketRepository,
    private artifactStore: ArtifactStore,
    private stateMachine: StateMachineService,
    private gitGateway: GitGateway,        // for committing answered file
  ) {}

  async execute(
    projectId: string,
    projectPath: string,                   // from CLI's project resolution
    ticketId: string,
    confirmed?: boolean,                   // set to true if user confirmed unmodified-file prompt
  ): Promise<TicketAnswerResult>
}
```

### 3. Fix artifact filename convention

Change step 3 to:
```
3. Check questions file exists via `artifactStore.artifactExists(projectPath, ticketId, `${ticketId}-questions.md`)`
```

### 4. Add git commit step (per system design §7.2)

After transitioning to WORKING, commit the answered questions file:
```
6. gitGateway.commit(`[${ticketId}][QUESTIONS][v1][human][answered]`, [questionsFilePath])
```

### 5. Separate confirmation logic between layers

Use case step 4 should return `{ needsConfirmation: true, reason: 'questions file not modified' }` instead of prompting. The CLI command handles the interactive prompt and re-calls with `confirmed: true`.

### 6. Add to Dependencies section

```
- ArtifactStore port extension: `artifactExists()`, `readArtifact()`, `getArtifactMtime()` (cross-cutting — also affects M2-009 and M2-011)
- M2-007/M2-008: ColumnSpec (if deriving filename from `columnSpec.preflight.questionsArtifact`)
```

---

## Verdict

**Approve with required changes:**

1. **Extend `ArtifactStore` port** — add `artifactExists()`, `readArtifact()`, and `getArtifactMtime()`. The current port cannot support the use case's core logic. This is a cross-cutting amendment.
2. **Provide `projectPath`** — either pass from CLI command or inject `ProjectRepository`. All `ArtifactStore` methods require it as the first argument.
3. **Fix questions filename** — use `${ticketId}-questions.md` to match M2-009's output and the system design's `SAAS-1-questions.md` convention.
4. **Add constructor dependency list** — match the pattern from M2-011 and M2-012 for consistency.
5. **Add git commit step** — the system design §7.2 explicitly requires committing the answered file with `[human][answered]` attribution.
6. **Separate prompt logic** — the `readline` confirmation belongs in the CLI layer, not the use case. Return a result type and let the CLI handle interaction.

The task's concept is correct and well-scoped. The dependency on M2-009 and M1-009 is accurate. The out-of-scope items are appropriate. After the amendments above, the task should be implementable without ambiguity.
