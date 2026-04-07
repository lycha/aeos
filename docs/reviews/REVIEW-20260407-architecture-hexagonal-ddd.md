# Architecture Review: Project Scaffold vs Hexagonal Architecture & DDD

**Date:** 2026-04-07
**Reviewer:** Augment Agent (Staff SWE)
**Scope:** Full project scaffold (`src/`) cross-referenced against all task specifications (`docs/tasks/`)

---

## 1. Executive Summary

The project scaffold in `src/` is a **well-structured hexagonal architecture** with clean DDD layering. The directory structure separates domain, application, infrastructure, and CLI layers correctly. Port/adapter naming conventions are consistent. The domain model contains appropriate aggregates, value objects, and services.

**However, there is a critical structural gap:** every task specification (M1-001 through M7-006) references a completely different, flat file layout (`src/commands/`, `src/db/`, `src/state-machine/`, `src/fs/`, `src/executor/`, `src/prompt/`, `src/validation/`, `src/orchestrator/`, `src/column-spec/`). This means the scaffold and the tasks are **fundamentally misaligned** — an implementer following the task specs will produce code that doesn't match the scaffold, and an implementer following the scaffold will have no guidance on which port/adapter/use-case maps to which task step.

This is the single most important finding. If left unresolved, the first implementation pass will either (a) ignore the scaffold and create the flat structure the tasks describe, or (b) follow the scaffold and struggle to map every task step to the correct file. Either outcome produces inconsistency.

---

## 2. Scaffold Assessment

### 2.1 What's Right (Hexagonal / Ports & Adapters)

| Aspect | Assessment |
|--------|------------|
| **Layer separation** | ✅ Clean 4-layer structure: `domain/` → `application/` → `infrastructure/` → `cli/` |
| **Dependency direction** | ✅ Domain has zero imports from infrastructure or CLI. Ports are defined in domain, implemented in infrastructure. |
| **Driving ports** | ✅ One per use case (`install.port.ts`, `ticket-create.port.ts`, etc.) — correct granularity |
| **Driven ports** | ✅ 9 ports covering all external dependencies (DB, FS, Git, Executor, Spec loaders) |
| **Adapters** | ✅ Named with `.adapter.ts` suffix, grouped by technology (`persistence/`, `filesystem/`, `git/`, `executor/`, `spec-loader/`) |
| **Composition root** | ✅ `cli/container.ts` — single place where adapters are wired to ports |
| **Shared kernel** | ✅ `shared/` for cross-cutting errors, types, config — correctly separated from domain |

### 2.2 What's Right (DDD)

| Aspect | Assessment |
|--------|------------|
| **Aggregates** | ✅ Ticket, Project, Transition, CostRecord — correct aggregate boundaries |
| **Value Objects** | ✅ Column, SubState, ExecutorInvocation, ExecutorResult, AssembledContext, ValidationResult, ColumnSpec, AgentSpec |
| **Domain Services** | ✅ `state-machine.ts` (transition logic) and `output-validation.ts` (rule-based checks) are stateless domain services |
| **Repository pattern** | ✅ TicketRepository, TransitionRepository, CostRepository, ProjectRepository — all as driven ports |
| **Ubiquitous language** | ✅ File names match domain terms: "ticket", "column", "sub-state", "transition", "executor", "artifact" |

---

## 3. Findings

### CRITICAL: Task specs and scaffold are completely misaligned on file paths

**Severity:** Critical — blocks implementation


Every task specifies a flat path that does not exist in the scaffold. The full mapping of conflicts:

| Task | Task says | Scaffold equivalent |
|------|-----------|---------------------|
| M1-001 | `src/commands/install.ts` | `src/cli/commands/install.command.ts` + `src/application/install.use-case.ts` |
| M1-002 | `src/commands/project-init.ts` | `src/cli/commands/project-init.command.ts` + `src/application/project-init.use-case.ts` |
| M1-003 | `src/commands/ticket-create.ts` | `src/cli/commands/ticket-create.command.ts` + `src/application/ticket-create.use-case.ts` |
| M1-004 | `src/commands/ticket-list.ts` | `src/cli/commands/ticket-list.command.ts` + `src/application/ticket-list.use-case.ts` |
| M1-005 | `src/commands/ticket-show.ts` | `src/cli/commands/ticket-show.command.ts` + `src/application/ticket-show.use-case.ts` |
| M1-006 | `src/db/schema.ts` | `src/infrastructure/persistence/database.ts` |
| M1-007 | `src/state-machine/enums.ts` | `src/domain/model/column.ts` + `src/domain/model/sub-state.ts` |
| M1-008 | `src/state-machine/transition.ts` | `src/domain/services/state-machine.ts` |
| M1-009 | `src/state-machine/set-sub-state.ts` | `src/domain/services/state-machine.ts` |
| M1-010 | `src/state-machine/state-machine.test.ts` | `src/domain/services/state-machine.test.ts` |
| M1-011 | `src/fs/aeos-home.ts` | `src/infrastructure/filesystem/fs-config.adapter.ts` |
| M1-012 | `src/fs/project-root.ts` | `src/infrastructure/filesystem/fs-project.repository.ts` |
| M1-013 | `src/fs/artifact-path.ts` | `src/infrastructure/filesystem/fs-artifact-store.adapter.ts` |
| M1-014 | `src/fs/git-commit.ts` | `src/infrastructure/git/simple-git-gateway.adapter.ts` |
| M2-001 | `src/executor/executor.ts` | `src/domain/ports/driven/executor.port.ts` + `src/domain/model/executor-*.ts` |
| M2-002 | `src/executor/stub-executor.ts` | `src/infrastructure/executor/stub-executor.adapter.ts` |
| M2-003 | `src/executor/claude-cli-executor.ts` | `src/infrastructure/executor/claude-cli-executor.adapter.ts` |
| M2-004 | `src/prompt/context-assembler.ts` | Application service + `src/domain/model/assembled-context.ts` |
| M2-006 | `src/validation/output-validator.ts` | `src/domain/services/output-validation.ts` + `src/domain/model/validation-result.ts` |
| M2-008 | `src/column-spec/loader.ts` | `src/infrastructure/spec-loader/yaml-*-spec-loader.adapter.ts` |
| M2-009 | `src/orchestrator/preflight.ts` | `src/application/ticket-run.use-case.ts` (preflight is part of orchestration) |
| M7-005 | `src/errors/error-messages.ts` | `src/shared/errors.ts` |

**Impact:** An implementer (human or AI agent) cannot follow both the task spec and the scaffold. The first task implemented will set the precedent — either the scaffold is abandoned, or every subsequent task is mentally re-mapped.

**Recommendation:** Update every M1/M2/M7 task to reference the scaffold paths. Each task that currently says "Create `src/commands/X.ts`" should instead say:
- "Implement the use case in `src/application/X.use-case.ts`"
- "Wire the CLI command in `src/cli/commands/X.command.ts`"
- "The command delegates to the use case; the use case calls ports; adapters implement ports"

Each task that puts domain logic in a flat file should reference the domain model instead.

---

### MAJOR-1: Tasks conflate CLI layer and application layer

**Severity:** Major

Every command task (M1-001 through M1-005, M2-010 through M2-012, M7-003, M7-004) describes all logic in a single `src/commands/X.ts` file. In the hexagonal scaffold, command logic must be split:

1. **CLI command** (`src/cli/commands/X.command.ts`): parse arguments, call use case, format output, handle exit codes
2. **Use case** (`src/application/X.use-case.ts`): orchestrate domain logic via ports
3. **Domain services** (`src/domain/services/`): enforce invariants (state machine rules)

For example, M1-003 describes steps 1–9 all in `src/commands/ticket-create.ts`. In the scaffold:
- Steps 1–2 (resolve root, read project key) → CLI command parses context, calls use case
- Steps 3–5 (determine next ID, create directory, write file) → use case calls `TicketRepository` and `ArtifactStore` ports
- Step 7 (insert DB row) → use case calls `TicketRepository.save()`
- Step 8 (git commit) → use case calls `GitGateway.commit()`
- Step 9 (print success) → CLI command formats output

Without this split, the use cases are empty shells and all logic lives in the CLI layer, defeating the hexagonal architecture.

**Recommendation:** Each command task should explicitly document the layer split with a "Layer Mapping" section.

---

### MAJOR-2: `transition()` and `setSubState()` take raw `db: Database` — breaks port abstraction

**Severity:** Major

M1-008 and M1-009 define `transition(db: Database, ...)` and `setSubState(db: Database, ...)` where `Database` is the `better-sqlite3` type. These are domain services in the scaffold (`src/domain/services/state-machine.ts`) but they directly depend on an infrastructure type. This violates the fundamental hexagonal rule: domain must never import infrastructure.

The scaffold has `TicketRepository` and `TransitionRepository` ports for exactly this purpose.

**Recommendation:** Refactor to use ports:

```typescript
export class StateMachineService {
  constructor(
    private ticketRepo: TicketRepository,
    private transitionRepo: TransitionRepository,
  ) {}
  transition(projectId: string, ticketId: string, targetColumn: Column): TransitionResult
  setSubState(projectId: string, ticketId: string, subState: SubState): SetSubStateResult
}
```

Update M1-008, M1-009, and M1-010 accordingly. Tests can then use simple port stubs instead of `:memory:` SQLite.

---

### MAJOR-3: No `ConfigStore` port for global config operations

**Severity:** Major

The scaffold has `fs-config.adapter.ts` in infrastructure but no corresponding driven port in `src/domain/ports/driven/`. The `install` use case needs to read/write `~/.aeos/config.json`, `registry.json`, and the global gitignore. Without a port, the use case will directly import `fs` or the adapter, breaking the hexagonal boundary.

**Recommendation:** Add `config-store.port.ts` to `src/domain/ports/driven/`:

```typescript
export interface ConfigStore {
  readConfig(): GlobalConfig;
  writeConfig(config: GlobalConfig): void;
  readRegistry(): ProjectRegistryEntry[];
  writeRegistry(entries: ProjectRegistryEntry[]): void;
  ensureGlobalGitignore(pattern: string): void;
}
```

---

### MINOR-1: Transition and CostRecord misclassified as Aggregates

**Severity:** Minor

`transition.ts` has `// Aggregate — Transition` and `cost-record.ts` has `// Aggregate — CostRecord`. In DDD, neither has an identity lifecycle or invariants to protect. They are **Domain Events** (records of past occurrences). Correct the comments to `// Domain Event` to set the right expectation for implementers.

---

### MINOR-2: Missing `ContextAssembler` and `PromptBuilder` in scaffold

**Severity:** Minor

M2-004 (`ContextAssembler`) and M2-005 (`PromptBuilder`) are application-level orchestration concerns. The scaffold has `assembled-context.ts` (value object) but no application service for the assembly logic. Add `src/application/services/context-assembler.ts` and `src/application/services/prompt-builder.ts` as application services called by `ticket-run.use-case.ts`.

---

### MINOR-3: Composition root (`container.ts`) needs wiring guidance

**Severity:** Minor

No task specifies how to build `cli/container.ts`. The wiring must create all adapters, pass them to use cases, and register use cases with Commander.js commands. Add an M1 task (or extend M1-001) to define the pattern:

```typescript
export function createContainer() {
  const db = getDb();
  const ticketRepo = new SqliteTicketRepository(db);
  const artifactStore = new FsArtifactStore();
  const gitGateway = new SimpleGitGateway();
  return {
    ticketCreate: new TicketCreateUseCase(ticketRepo, artifactStore, gitGateway),
    // ...
  };
}
```

---

## 4. Dependency Flow Validation

The scaffold's dependency flow is correct:

```
CLI → Application → Domain ← Infrastructure
      (use cases)   (model, ports, services)   (adapters implementing ports)
```

- ✅ `cli/` imports from `application/` — never from `domain/` or `infrastructure/` directly
- ✅ `application/` imports from `domain/` — never from `infrastructure/`
- ✅ `domain/` imports nothing external — pure TypeScript types and logic
- ✅ `infrastructure/` imports from `domain/` (to implement ports) — never from `application/` or `cli/`
- ✅ `shared/` is importable by all layers — cross-cutting concerns only

---

## 5. Recommendations Summary

| # | Severity | Action |
|---|----------|--------|
| **C1** | Critical | Update all M1/M2/M7 task specs to reference scaffold paths instead of flat paths. Add "Layer Mapping" to each command task. |
| **M1** | Major | Split command tasks into CLI command + use case + domain service responsibilities. |
| **M2** | Major | Refactor `transition()` / `setSubState()` to use ports instead of raw `db: Database`. |
| **M3** | Major | Add `ConfigStore` driven port for global config operations. |
| **m1** | Minor | Fix DDD classification: Transition and CostRecord are Domain Events, not Aggregates. |
| **m2** | Minor | Add `ContextAssembler` + `PromptBuilder` as application services in the scaffold. |
| **m3** | Minor | Document the composition root wiring pattern in a task. |

---

## 6. Verdict

The scaffold is **architecturally sound** — it follows hexagonal architecture and DDD conventions correctly. The critical problem is that the task specifications were written before the scaffold existed and describe a completely different flat file layout. **The scaffold is the correct structure; the tasks must be updated to match it.**

Until C1 is resolved, no implementation should begin — the misalignment will compound with every task, producing either a flat codebase that ignores the scaffold or a hexagonal codebase with no task guidance.