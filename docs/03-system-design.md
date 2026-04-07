# System Design: AI Engineering Operating System — v1

**Author:** Kris
**Date:** March 24, 2026
**Last Updated:** March 30, 2026
**Status:** Draft
**Version:** 0.3

> This document covers **v1 (CLI)** only. v2 (web UI, Kanban board, Electron) design is in the appendix and in `03-system-design-v2-reference.md`.

---

## 1. System Overview

The AI Engineering Operating System is a pipeline orchestrator. It moves tickets through a structured SDLC pipeline, assembles context for each stage, triggers an agent executor, validates the output, and manages the artifact tree. The human operator controls flow at every meaningful decision point.

```
┌─────────────────────────────────────────────────────────────────┐
│                        HUMAN OPERATOR                           │
│  Creates tickets │ Triggers runs │ Approves │ Edits artifacts   │
└────────────────────────────┬────────────────────────────────────┘
                             │  CLI commands
                    ┌────────▼────────┐
                    │   ORCHESTRATOR  │
                    │  State machine  │
                    │  Context layer  │
                    │  Artifact store │
                    └────────┬────────┘
                             │  Prompt + context
              ┌──────────────▼──────────────┐
              │      EXECUTOR ABSTRACTION    │
              │                             │
              │  v1: Claude Code CLI        │
              │  v2: Direct API / BYOK      │
              └──────────────┬──────────────┘
                             │  Artifact output
          ┌──────────────────▼──────────────────┐
          │         ARTIFACT STORE               │
          │   Git-backed Markdown document tree  │
          │   Linear history, structured commits │
          └─────────────────────────────────────┘
```

**What the system owns:**
- The pipeline state machine (column, sub-state, transitions)
- Context assembly (which artifacts, constraints, index, rubrics get injected)
- Artifact templates (the schema each agent output must conform to)
- The rubric and prompt library (institutional knowledge)
- The git commit model (structured, attributed, linear)
- Artifact output validation (rule-based structural check)
- The cost record log

**What the system does not own:**
- LLM execution (delegated to the executor)
- Agent temperature, model config beyond model name selection (executor handles this)
- The code the engineer agent writes

---

## 2. Pipeline Architecture

### 2.1 Phase Groups and Columns

Four phase groups, each containing columns. The ticket moves forward one column at a time. Leftward movement (rework) is normal and supported.

```
┌──────────────────────────────────────────────────────────────────────┐
│  PLAN              │  PREPARE             │  BUILD        │  DEPLOY  │
├────────────────────┼──────────────────────┼───────────────┼──────────┤
│  Backlog           │  Architecture Spike  │  Implement    │  QA      │
│  (human triage)    │  (architect agent)   │  (eng agent)  │  (qa     │
│                    │  ↳ sign-off          │  ↳ sign-off   │   agent) │
│                    │                      │               │  ↳ sign- │
│  Product Scoping   │  Tech Spec           │  Code Review  │   off    │
│  (pm agent)        │  (architect agent)   │  (reviewer)   │          │
│  ↳ sign-off        │  ↳ sign-off          │  ↳ sign-off   │  DoD     │
│                    │                      │               │  Gate    │
│                    │                      │               │  (human) │
└────────────────────┴──────────────────────┴───────────────┴──────────┘
```

**Notes:**
- Backlog is human-only. No agent runs. Cards sit until the operator moves them forward.
- Every non-Backlog column has an internal sign-off sub-state. The reviewer is triggered within the column lifecycle — the card does not advance until the operator approves.
- Implementation vs Code Review: Implementation sign-off reviews `implementation-notes.md` (the plan — approach, reasoning, design decisions). Code Review sign-off reviews the actual code diff (correctness, adherence to CONSTRAINTS.md, test coverage). Two distinct concerns, reviewed in sequence.
- DEPLOY columns are the least defined — needs further design in a later iteration.

### 2.2 Artifact Produced Per Column

Each ticket has its own directory. All artifacts for that ticket live flat inside it, prefixed with the ticket ID. This keeps the structure human-navigable without any tooling.

| Column | Input | Worker Output | Reviewer Output |
|--------|-------|---------------|-----------------|
| Backlog | Operator input | `SAAS-1-ticket.md` | — |
| Product Scoping | `SAAS-1-ticket.md` | `SAAS-1-prd.md` | `SAAS-1-prd-review.md` |
| Architecture Spike | `SAAS-1-prd.md` + priors | `SAAS-1-spike.md` | `SAAS-1-spike-review.md` |
| Tech Spec | `SAAS-1-spike.md` + priors | `SAAS-1-tech-spec.md` | `SAAS-1-spec-review.md` |
| Implementation | All PREPARE artifacts | `SAAS-1-implementation-notes.md` + code | `SAAS-1-impl-review.md` |
| Code Review | Code diff + `SAAS-1-implementation-notes.md` | `SAAS-1-code-review.md` | `SAAS-1-code-review-signoff.md` |
| QA | All BUILD artifacts | `SAAS-1-qa-report.md` | `SAAS-1-qa-signoff.md` |
| DoD Gate | All artifacts + ticket DoD | `SAAS-1-dod-verification.md` | Human approval |

---

## 3. Filesystem Layout

### 3.1 Design Constraints

- Each engineer owns their own directory structure — AEOS cannot impose a layout on the project
- Artifacts must live close to the code so the operator can open them from the same workspace
- Artifacts must NOT be tracked by the project's git
- AEOS must have global visibility across all projects it has been initialised in, regardless of the current working directory

### 3.2 Global AEOS Home

AEOS maintains a home directory at `~/.aeos/`. This is created on first install and never moves.

```
~/.aeos/
  config.json          ← global config (default model, currency, billing period)
  registry.json        ← index of all projects where AEOS has been initialised
  state.db             ← SQLite: pipeline state for all tickets across all projects
  costs.db             ← SQLite: all cost records across all projects
  logs/
    execution.log      ← durable execution log (append-only, survives crashes)
```

`state.db` and `costs.db` are the source of truth for `aeos dashboard`, `aeos project list`, and all cost commands. They are updated by the orchestrator after every state transition and every executor invocation.

### 3.3 Per-Project Layout

When the operator runs `aeos project init` inside a project directory, AEOS creates a `.aeos/` directory at the project root. This directory is a self-contained AEOS workspace for that project.

```
~/projects/startup-a/          ← engineer's existing project directory
  src/                         ← normal source code
  package.json
  .git/                        ← project's own git (never touches .aeos/)
  .aeos/                       ← owned entirely by AEOS
    .git/                      ← AEOS's own git repo (separate from the project)
    CONSTRAINTS.md             ← architectural laws injected into PREPARE + BUILD agents
    column-specs/              ← column configuration for this project
      product-scoping.yaml
      architecture-spike.yaml
      tech-spec.yaml
      implementation.yaml
      code-review.yaml
      qa.yaml
    tickets/
      T001/
        T001-ticket.md
        T001-prd.md
        T001-prd-review.md
        T001-tech-spec.md
        T001-spec-review.md
        ...
      T002/
        T002-ticket.md
        ...
```

**Two separate git repositories:** The project's `.git/` and AEOS's `.aeos/.git/` are completely independent. The project git never sees `.aeos/` (global gitignore). AEOS's git only ever commits Markdown artifact files — it never touches source code.

### 3.4 Global Gitignore

AEOS configures the operator's global gitignore on first install to exclude `.aeos/` from every git repository on the machine:

```bash
# ~/.gitignore_global
.aeos/
```

```bash
git config --global core.excludesfile ~/.gitignore_global
```

This is a one-time setup. No project `.gitignore` needs to be touched. Every existing and future project on the machine automatically ignores `.aeos/` without any per-project configuration.

### 3.5 Project Registry

`~/.aeos/registry.json` is updated every time `aeos project init` is run. It gives AEOS global visibility across all projects.

```json
{
  "projects": [
    {
      "id": "startup-a",
      "name": "Startup A",
      "path": "/Users/kris/projects/startup-a",
      "aeos_path": "/Users/kris/projects/startup-a/.aeos",
      "created_at": "2026-03-01T09:00:00Z"
    },
    {
      "id": "startup-b",
      "name": "Startup B",
      "path": "/Users/kris/projects/startup-b",
      "aeos_path": "/Users/kris/projects/startup-b/.aeos",
      "created_at": "2026-03-15T10:30:00Z"
    }
  ]
}
```

`aeos dashboard` and `aeos project list` read this registry and cross-reference `~/.aeos/state.db` to show live state. The operator can run these commands from any directory — AEOS does not need to be run from inside a project root.

### 3.6 Initialisation Commands

```bash
aeos install          # one-time global setup: creates ~/.aeos/, configures global gitignore
aeos project init     # run from project root: creates .aeos/, registers in ~/.aeos/registry.json
aeos project init --name "Startup A"   # optional human-readable name
```

---

## 4. Ticket and Artifact Model

### 3.1 Ticket Structure

Created by the operator. Immutable after creation — only the artifact tree grows.

```markdown
# Ticket: {ticket-id}

## Title
{title}

## Description
{description}

## Definition of Done
{acceptance criteria — evaluated only at DoD Gate}

## Notes
{additional context, links, constraints}
```

### 3.2 Artifact Tree

Each ticket has its own directory. Artifacts are stored flat inside it — no subdirectories. The ticket ID prefix makes every file self-identifying when viewed in any file explorer, editor, or terminal without needing the folder context.

```
/tickets/
  SAAS-1/
    SAAS-1-ticket.md                ← immutable after creation
    SAAS-1-questions.md             ← created by pre-flight pass if blockers found; operator fills answers
    SAAS-1-prd.md
    SAAS-1-prd-review.md
    SAAS-1-spike.md
    SAAS-1-spike-review.md
    SAAS-1-tech-spec.md
    SAAS-1-spec-review.md
    SAAS-1-implementation-notes.md
    SAAS-1-impl-review.md
    SAAS-1-code-review.md
    SAAS-1-code-review-signoff.md
    SAAS-1-qa-report.md
    SAAS-1-qa-signoff.md
    SAAS-1-dod-verification.md
  SAAS-2/
    SAAS-2-ticket.md
    SAAS-2-prd.md
    ...
```

**Why flat:** Subdirectories (`plan/`, `prepare/`, `build/`) add navigation overhead with no benefit — the filename prefix and the artifact name already communicate phase and purpose. A flat list sorts cleanly, grep works without `-r`, and the operator can open any artifact directly from `aeos ticket artifacts T001` without path juggling.

**Ticket ID format:** Jira-style per-project identifier. A 2–4 letter project key derived from the project name, followed by a sequential number with no cap or zero-padding: `SAAS-1`, `SAAS-2`, ..., `SAAS-100`, ..., `SAAS-10382`. The project key is set at `aeos project init` time and can be customised. IDs are unique per project, not per workspace — two projects can both have `SAAS-1` if they have the same key prefix, so the full identifier when referenced across projects is `{project-id}:{ticket-id}` (e.g. `startup-a:SAAS-42`).

```
Examples:
  Project "Startup A"     → key: SAAS  → tickets: SAAS-1, SAAS-2, SAAS-3 ...
  Project "Pet Project"   → key: PET   → tickets: PET-1, PET-2 ...
  Project "Mobile App"    → key: MOB   → tickets: MOB-1, MOB-2 ...
```

### 3.3 Git Commit Convention

Every agent action and human edit produces a git commit with a structured message:

```
[TICKET-ID][ARTIFACT][vN][AGENT][action: reason]

Examples:
[SAAS-1][PRD][v1][pm-agent][create]
[SAAS-1][PRD][v2][pm-agent][rework: architect-feedback-prd-assumptions-wrong]
[SAAS-1][PRD][v2][human][edit: clarified-target-user]
[SAAS-1][TECH-SPEC][v1][architect-agent][create]
[SAAS-1][CODE-REVIEW][v1][reviewer-agent][create: WARNING×3 INFO×1]
[SAAS-2][TICKET][v1][human][create]
```

**Rules:**
- History is always linear — no branches within the artifact store
- One agent owns an artifact at a time
- Human edits are committed directly and attributed as `[human]`
- Version number increments on each rework cycle

---

## 5. Executor Abstraction

### 4.1 The Contract

An executor is anything that accepts a prompt + context bundle and produces a text artifact at a specified path. The orchestrator does not care how it works internally.

```typescript
interface ExecutorResult {
  success: boolean
  artifactPath: string
  exitCode?: number
  stderr?: string
}

interface Executor {
  run(invocation: AgentInvocation): Promise<ExecutorResult>
  interrupt(): Promise<void>
}
```

The orchestrator assembles the invocation — prompt, context, artifact template, output path — and hands it to the executor. The executor runs it and returns a result. All state management, git commits, and validation happen in the orchestrator, not the executor.

### 4.2 v1 Executor: Claude Code CLI

In v1, the executor shells out to the Claude Code CLI (`claude` command) installed locally on the operator's machine.

```
aeos ticket run T001
  → orchestrator assembles prompt + context bundle as a single string
  → invokes: claude -p "<prompt>" > /tmp/aeos-output-T001.md
  → monitors exit code
  → reads output from temp file
  → validates artifact structure
  → copies to artifact store path and commits
```

**Validated:** `claude -p "prompt"` runs in non-interactive print-and-exit mode and writes the response to stdout. This is confirmed Claude Code CLI behaviour. The orchestrator captures stdout, writes it to a temp file, validates it, then commits it to the artifact store.

**Why Claude Code CLI:**
- Operators already have it installed and trust it
- No API key management in the orchestrator for v1 — Claude Code handles auth
- `-p` flag provides clean non-interactive execution suitable for subprocess orchestration
- Exit code reflects success/failure — maps directly to WORKING → FAILED transition

**Executor config (per column spec):**

```yaml
executor:
  type: claude-code-cli
  model: claude-opus-4-6         # passed as --model flag
  max_tokens: 8000               # passed as flag
```

### 4.3 Future Executors (v2+)

The abstraction is designed to support:

| Executor | Description |
|----------|-------------|
| `claude-code-cli` | v1 default — shells out to local `claude` CLI |
| `anthropic-api` | Direct API call with BYOK — no Claude Code dependency |
| `factory-droid-cli` | Shells out to Factory AI Droid CLI |
| `augment-cli` | Shells out to Augment AI CLI |
| `openai-api` | Direct OpenAI API with BYOK |

Adding a new executor means implementing the `Executor` interface. The pipeline, state machine, artifact store, and rubric library are unchanged.

### 4.4 Prompt Assembly

The orchestrator assembles the full prompt before handing to the executor. The executor receives a single, complete prompt — it does not do context assembly.

```
[ROLE]
{system prompt from agent spec}

[CONTEXT]
{assembled context: ticket.md + prior artifacts + CONSTRAINTS.md + codebase index}

[TASK]
{column-specific task description}

[OUTPUT FORMAT]
{artifact template — required sections, format rules}

[SELF-VERIFICATION]
Before writing your output, produce a numbered checklist of steps.
Execute each step. Verify your output against the checklist.
Include the checklist at the end of your output.
```

---

## 6. Agent and Prompt Library

### 5.1 What "Agent" Means in v1

In v1, an agent is not a running process — it is a configuration. It defines:
- The system prompt (role, behaviour, focus)
- The context scope (what gets injected)
- The artifact template (what the output must look like)
- The executor config (which executor, which model)

The executor brings the computation. The agent brings the knowledge.

```yaml
name: pm-agent
role: worker
executor:
  type: claude-code-cli
  model: claude-opus-4-6
system_prompt: |
  You are a senior product manager with deep experience in B2B SaaS.
  Your job is to translate a raw ticket into a structured PRD that
  gives an architect everything they need to spike a solution.
  Be precise. Be opinionated. Flag assumptions explicitly.
context_scope:
  - ticket.md
  - business_context
output_template: rubrics/templates/prd-template.md
self_verification: true
```

### 5.2 Agent Roster

| Agent | Role | Phase | Responsibility |
|-------|------|-------|----------------|
| `pm-agent` | worker | PLAN | Translates ticket into structured PRD |
| `architect-agent` | worker | PREPARE | Spikes technical options; produces tech spec |
| `engineer-agent` | worker | BUILD | Implements code against spec and constraints |
| `qa-agent` | worker | DEPLOY | Writes and runs automated tests |
| `reviewer-agent` | reviewer | ALL | Two-pass review; prompt assembled at runtime from column spec + rubric |

> ⚠️ Draft roster. Agent names and boundaries will evolve during build.

**One generic reviewer:** There is one `reviewer-agent`, not one per column. Its behaviour is entirely determined by the rubrics referenced in the column spec. Improving the reviewer agent improves every column.

### 5.3 Rubric Library

Rubrics are the institutional knowledge layer — maintained separately from agent specs, versioned, reusable.

```
/rubrics/
  structure/
    prd-structure.md          ← required sections, measurable metrics, no ambiguity
    tech-spec-structure.md    ← ADRs, API contracts, data models
    code-structure.md         ← naming, test coverage, no raw SQL, patterns
    qa-report-structure.md    ← test cases, edge cases, pass rate
  drift/
    intent-drift.md           ← generic drift detection (all columns)
  dod/
    dod-evaluation.md         ← full DoD evaluation (DoD Gate only)
  templates/
    prd-template.md           ← artifact output template for pm-agent
    tech-spec-template.md     ← artifact output template for architect-agent
    implementation-notes-template.md
    qa-report-template.md
```

### 5.4 Column Spec

Each column is fully specified in a config file. This is the single source of truth for what happens in a column.

```yaml
column: product-scoping
phase: PLAN
worker_agent: pm-agent
reviewer_agent: reviewer-agent
rubrics:
  pass1_structure: rubrics/structure/prd-structure.md
  pass2_drift: rubrics/drift/intent-drift.md
max_iterations: 3
escalation: escalate_to_human     # what to do when max_iterations hit with unresolved WARNINGs
advance_mode: manual              # manual | auto
```

### 5.5 Reviewer Prompt Assembly

```
[GENERIC REVIEWER BEHAVIOUR]
You are a critical reviewer. Output findings tagged INFO / WARNING / BLOCKER.
Pass 1 findings are injected as context into Pass 2.
Each pass stays strictly in its lane.

[PASS 1 — STRUCTURE]
Evaluate the artifact against this rubric:
{contents of rubrics/structure/prd-structure.md}

[PASS 2 — DRIFT DETECTION]
Evaluate whether the artifact still solves the original problem.
Original intent: {ticket title + description from ticket.md}
Drift rubric: {contents of rubrics/drift/intent-drift.md}

[PASS CRITERIA]
max_iterations: 3
escalation: escalate_to_human
```

### 5.6 Review Cycle

```
Worker produces artifact
  │
  ▼
Output validation (rule-based — see Section 6)
  │ passes
  ▼
Reviewer prompt assembled → executor invoked
  │
  ▼
PASS 1: Structure (artifact vs structure rubric)
  │
  ▼
PASS 2: Drift (artifact vs ticket intent)
        Pass 1 findings injected as context
  │
  ▼
Findings merged → INFO / WARNING / BLOCKER
  │
  ├─ No findings or INFO only → SIGNED-OFF
  │
  ├─ WARNING
  │     iterations < max → worker reworks
  │     iterations = max → escalate to human
  │
  └─ BLOCKER → always escalate to human
```

**Finding format:**

```markdown
## Review Findings

### BLOCKER
- [BLOCKER] No authentication check on POST /api/tickets

### WARNING
- [WARNING] Missing error handling for git commit failure

### INFO
- [INFO] Consider extracting ticket validation into a separate function
```

---

## 7. State Machine

### 7.1 Sub-State Map

Every column has an internal sub-state. The card does not advance until the operator approves.

```
SUB-STATE MAP
─────────────────────────────────────────────────────────────
  BLOCKED      Pre-flight pass found open questions
               Operator must answer before main run starts
               Available actions: [answer] [sendback]

  WORKING      Executor running the main task normally

  INTERRUPTED  Operator stopped it deliberately
               Available actions: [resume] [sendback]
               On resume: restarts from step 1

  FAILED       Unexpected failure — executor crash, timeout,
               output validation failure, malformed response
               Available actions: [retry] [sendback]
               On retry: restarts from step 1
               Partial artifact writes ROLLED BACK to last clean commit

  IN-REVIEW    Worker finished; reviewer executor running

  SIGNED-OFF   Reviewer passed; card eligible to advance
─────────────────────────────────────────────────────────────
```

**FAILED vs INTERRUPTED are distinct.** INTERRUPTED = deliberate operator action. FAILED = unexpected system problem. Both surface as URGENT but recovery paths differ.

### 7.2 Pre-Flight Question Pass

Before the main agent run begins, the orchestrator triggers a lightweight **pre-flight pass** — a short, cheap executor invocation that reads the assembled context and identifies any blockers that would prevent a quality output.

```
aeos ticket run T001
  │
  ▼
Pre-flight pass (short executor invocation)
  │
  ├─ No blockers found → proceed to WORKING immediately
  │
  └─ Blockers found → sub-state = BLOCKED
                      questions committed to T001-questions.md
                      PENDING alert surfaces to operator
```

**Why a separate pass rather than pause-mid-run:** The Claude Code CLI executor cannot be paused mid-execution and resumed with injected context. Running questions as a pre-flight invocation sidesteps this entirely — the main run only starts when context is complete.

**Pre-flight prompt structure:**

```
[ROLE]
{agent system prompt}

[CONTEXT]
{same assembled context as the main run}

[TASK]
Before executing your main task, review the context above and identify
any information gaps that would force you to make significant assumptions.

Output ONLY a list of specific, answerable questions. If you have no
blockers, output: NO_BLOCKERS

Do not attempt the main task yet.
```

**Questions artifact format** — committed to the artifact store as `T001-questions.md`:

```markdown
# Questions: T001 — Add notifications feature

**Column:** Product Scoping
**Status:** AWAITING OPERATOR

## Open Questions

1. **Notification channels:** Should notifications support email, push,
   in-app, or some combination? The ticket doesn't specify.

2. **Notification triggers:** Are notifications triggered by system events
   only, or can users configure custom triggers?

## Operator Answers

<!-- Operator fills this section in -->
```

The operator answers by editing `T001-questions.md` directly and running:

```bash
aeos ticket answer T001
```

This commits the answered file as `[T001][QUESTIONS][v1][human][answered]` and triggers the main run with the questions file injected as the first context item.

### 7.3 Assumption Convention

Even when the pre-flight pass finds no blockers, the agent may still make implicit assumptions during execution. Agents are instructed to surface these explicitly in the artifact using a standard tag:

```markdown
## Assumptions

> ⚠️ ASSUMPTION: Notifications are email-only. Validate before proceeding.
> ⚠️ ASSUMPTION: PostgreSQL is the target database per CONSTRAINTS.md convention.
```

The reviewer is trained to treat unvalidated assumptions as at minimum a WARNING finding. This catches unknown unknowns that the pre-flight pass couldn't surface — the pre-flight handles known gaps in context, the assumption convention handles gaps the agent discovers mid-execution.

### 7.4 On Failure

1. Uncommitted artifact changes discarded (rollback to last clean git commit)
2. Sub-state → FAILED
3. URGENT alert surfaces with failure reason (e.g. "Output validation failed: missing section '## API Contract'")
4. Failure reason persisted in execution log — no artifact commit is made, so the log is the only record
5. Operator chooses retry or sendback

### 7.5 Output Validation

Rule-based structural check before any artifact is committed. Not an LLM call.

```
1. File is non-empty
2. File path matches output_spec in agent config
3. Required top-level sections present (derived from structure rubric)
```

On failure: artifact not committed → sub-state → FAILED immediately. No silent retry.

### 7.6 Concurrency Constraints

**Within a project:** Only one ticket may be in BUILD or DEPLOY at a time per project. A second ticket reaching BUILD waits in PREPARE until the slot is free. This prevents git conflicts in the codebase. Parallel BUILD workstreams within a project are a v2 concern.

**Across projects:** There is no cross-project concurrency constraint. The operator may run agents on multiple projects simultaneously — for example, a PLAN agent on Startup A, a PREPARE agent on Startup B, and a BUILD agent on Startup C can all run at the same time. Each project has its own `.aeos/.git` artifact store and its own codebase, so there is no contention. The `~/.aeos/state.db` handles concurrent writes from multiple project processes via SQLite's WAL mode.

---

## 8. Context Layer

### 8.1 Context Scoping by Phase

| Context Object | PLAN | PREPARE | BUILD | DEPLOY |
|----------------|------|---------|-------|--------|
| `ticket.md` | ✓ | ✓ | ✓ | ✓ |
| Prior phase artifacts | — | PLAN only | PLAN + PREPARE | All |
| Business context docs | ✓ | — | — | — |
| `CONSTRAINTS.md` | — | ✓ | ✓ | ✓ |
| Codebase index (high-level) | — | ✓ | ✓ | ✓ |
| Codebase index (full) | — | — | ✓ | ✓ |
| Reviewer findings (current column) | — | ✓ | ✓ | ✓ |

### 8.2 CONSTRAINTS.md

Board-level file injected into all PREPARE and BUILD agents. Contains architectural laws for the project.

```markdown
# Project Constraints

## Architecture
- Repository pattern for all data access
- All service methods covered by unit tests
- Event-driven communication between services

## Code Standards
- TypeScript strict mode
- No raw SQL — use the ORM
- All endpoints require authentication middleware

## Security
- No secrets in code — use environment variables
- Input validation on all public endpoints
```

### 8.3 Codebase Index

Structured file tree where each node has a description of purpose, ownership, and dependencies. Agents navigate the index rather than receiving raw files.

```
src/
  services/
    ticketService.ts  ← "Handles ticket CRUD and state transitions."
    agentRunner.ts    ← "Orchestrates agent execution for a column."
```

- PREPARE agents receive high-level index (file names + descriptions only)
- BUILD agents receive full index and can request individual file content
- Index refreshed at phase boundaries (before PREPARE, before DEPLOY)
- Powered by `github.com/lycha/code-indexer` in v1

---

## 9. Operator Interface (v1 CLI)

### 8.1 Command Surface

```bash
# Project management
aeos project create "Startup A"
aeos project list

# Ticket management
aeos ticket create "Add dark mode toggle" --project startup-a
aeos ticket list [--project startup-a]
aeos ticket status ticket-001           # sub-state, column, artifact tree

# Pipeline execution
aeos ticket run ticket-001              # triggers current column's worker
aeos ticket approve ticket-001          # signs off → advances to next column
aeos ticket sendback ticket-001 "Reason"  # moves left with transition comment
aeos ticket interrupt ticket-001        # pauses running executor (INTERRUPTED)
aeos ticket retry ticket-001            # retries from FAILED state

# Artifact inspection
aeos ticket artifacts ticket-001        # lists artifact tree with paths
aeos ticket diff ticket-001             # shows last commit diff

# Cost
aeos cost ticket-001                   # cost for one ticket
aeos cost --project startup-a          # cost breakdown for project
aeos cost                              # workspace-level summary

# Config
aeos config set api-key                # stores in OS keychain via keytar
aeos config set model claude-opus-4-6  # default model
```

### 8.2 Terminal Dashboard

`aeos dashboard` opens a live full-screen terminal UI (built with Ink — React for the terminal). Refreshes in real time. The dashboard is a **full control surface** — the operator does not need a second terminal window. All pipeline actions are executed via the persistent command field at the bottom of the screen.

**Layout: three zones**

```
╔══════════════════════════════════════════════════════════════════════╗
║  AI ENG OS  │  3 projects  │  7 tickets in flight  │  $47.23/mo    ║  ← HEADER
╠══════════════════════════════════════════════════════════════════════╣
║  ⚠  URGENT                                                          ║
║  └─ [startup-a] Add SSO login  │  Tech Spec  │  BLOCKER escalated   ║
╠══════════════════════════════════════════════════════════════════════╣
║  STARTUP A                                            $18.60 / mo   ║
║  ─────────────────────────────────────────────────────────────────  ║
║  🔴 SAAS-12 Add SSO login       │ Tech Spec      │ BLOCKER   IN-REVIEW   ║
║  🟡 SAAS-8  Refactor auth       │ Architecture   │           SIGNED-OFF  ║  ← MAIN VIEW
║  🟢 SAAS-15 Fix token expiry    │ Implementation │ ████░░░   WORKING 45% ║
║                                                                          ║
║  STARTUP B                                               $12.15 / mo    ║
║  ─────────────────────────────────────────────────────────────────────  ║
║  🟢 MOB-3  Add webhook support  │ Tech Spec      │ ██░░░░░   WORKING 28% ║
║  ❓ MOB-4  Dark mode toggle     │ Product Scope  │           BLOCKED     ║
║  ⚪ MOB-5  API caching          │ Backlog        │           WAITING     ║
╠══════════════════════════════════════════════════════════════════════════╣
║  > approve SAAS-8                                                        ║  ← COMMAND FIELD
║  ─────────────────────────────────────────────────────────────────  ║
║  enter to run · tab to complete · ? help · ctrl+c quit              ║
╚══════════════════════════════════════════════════════════════════════╝
```

**Command field behaviour:**
- Always visible at the bottom of the screen — the operator's cursor lives here
- Accepts the full `aeos` command surface without the `aeos` prefix (e.g. `approve T001`, `run T002`, `sendback T001 "needs more detail"`)
- Tab completion on ticket IDs and command names
- Command output (success confirmation, error message) displays inline above the field, then fades after 3 seconds
- The main view continues to refresh behind the command output
- `?` opens an inline help overlay listing all available commands

**Command field examples:**
```
> run MOB-4
> approve SAAS-8
> sendback SAAS-12 "Scope too broad, focus on email only"
> interrupt MOB-3
> retry SAAS-15
> status SAAS-12
> cost
> ?
```

**Attention tiers rendered in the main view:**
- 🔴 URGENT — needs you now (BLOCKER, FAILED, max iterations hit)
- 🟡 PENDING — needs you soon (SIGNED-OFF awaiting manual advance, INTERRUPTED)
- 🟢 RUNNING — no action needed (WORKING, IN-REVIEW)
- ❓ BLOCKED — awaiting operator answers to pre-flight questions
- ⚪ WAITING — idle (Backlog, blocked on BUILD slot)

### 8.3 Operator Actions

| Action | CLI command | Git commit |
|--------|-------------|------------|
| Create ticket | `ticket create` | `[TICKET][v1][human][create]` |
| Run agent | `ticket run` | — (executor runs; artifact committed on completion) |
| Approve + advance | `ticket approve` | `[HUMAN][v1][advance]` |
| Send back | `ticket sendback "reason"` | `[HUMAN][v1][reject: reason]` |
| Direct edit artifact | edit file in editor, then `ticket commit` | `[HUMAN][v1][edit]` |
| Interrupt agent | `ticket interrupt` | `[HUMAN][v1][interrupt]` |
| Retry after failure | `ticket retry` | — |

All operator actions that move state produce a `[human]` git commit. The operator's judgment is traceable alongside agent work.

---

## 10. Cost Model

### 9.1 Cost Record

Every executor invocation writes a cost record to SQLite:

```json
{
  "ticket_id": "ticket-042",
  "project": "startup-a",
  "column": "tech-spec",
  "agent": "architect-agent",
  "executor": "claude-code-cli",
  "model": "claude-opus-4-6",
  "input_tokens": 290000,
  "output_tokens": 90000,
  "cost_usd": 1.80,
  "timestamp": "2026-03-24T14:22:01Z"
}
```

Human edits produce no cost record.

### 9.2 Cost Views

**Ticket:** `aeos cost ticket-001` — total tokens and cost for the full ticket lifecycle.

**Project:** `aeos cost --project startup-a` — per-ticket breakdown with column and total.

**Workspace:** `aeos cost` — by project and by model, with monthly total.

### 9.3 API Key and Model Config

API key stored in OS keychain (macOS Keychain / Windows Credential Manager) via `keytar`. Never written to config files or environment variables. Retrieved from keychain at runtime for each invocation.

Model configured per agent per column spec. Default model set globally via `aeos config set model`.

---

## 11. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | **TypeScript** | Single language across CLI, pipeline logic, dashboard, and eventual frontend |
| Runtime | **Node.js** | No JVM, no native compilation — runs anywhere Node runs |
| CLI framework | **Commander.js** | Lightweight, well-maintained, idiomatic TypeScript CLI |
| Terminal dashboard | **Ink** | React for the terminal — same mental model as the v2 web UI; reuses component patterns |
| Agent orchestration | **DIY state machine** (async/await + EventEmitter) | Full control; async/await maps to sub-state lifecycle; EventEmitter handles transitions |
| Executor interface | **child_process** (Node built-in) | Shells out to Claude Code CLI; no external dependency |
| Git | **simple-git** | Thin Node wrapper around git CLI; precise commit message control |
| Local DB | **SQLite via better-sqlite3** | Synchronous, zero-config; durable state for pipeline sub-states, cost records, execution log |
| OS Keychain | **keytar** | Native Node module; macOS Keychain + Windows Credential Manager |
| Distribution (v1) | **pkg** | Single self-contained binary; ~40–60MB; no Node install on end-user machine |

**Implementation notes:**
- `better-sqlite3` is synchronous by design — correct for a local single-user tool
- `keytar` requires `node-gyp` native build — verify in CI early
- CLI commands are designed 1:1 with future v2 API endpoints (`run` → `POST /tickets/:id/run`)
- Ink components in the dashboard will be reusable as React components in the v2 web UI

---

## 12. Open Design Decisions

| # | Decision | Status |
|---|----------|--------|
| ~~OD-01~~ | ~~Review stages: separate columns or sign-off sub-states?~~ | **RESOLVED:** Sign-off sub-states within the column. |
| ~~OD-02~~ | ~~DoD vs rubric coexistence in reviewer?~~ | **RESOLVED:** Two-pass review. Generic reviewer, rubric library, prompt assembled at runtime. |
| ~~OD-03~~ | ~~Operator interface?~~ | **RESOLVED:** CLI (v1), web UI (v2). |
| ~~OD-04~~ | ~~Agent handoff context?~~ | **RESOLVED:** Full artifact history injected in v1. |
| ~~OD-05~~ | ~~Codebase index?~~ | **RESOLVED:** `github.com/lycha/code-indexer`, no LLM enrichment in v1. |

---

## 13. Known Hard Problems

- **Agent quality variance:** Reviewer may find issues on every pass. Max iterations + escalation mitigates but doesn't eliminate. Prompt quality is the primary lever.
- **Context window growth:** As artifact trees grow across rework cycles, context can get large. Pruning strategies deferred to v2.
- **Executor opacity:** In v1, error handling is limited to exit codes and artifact validation. What happens inside Claude Code is not fully visible. Artifact structural validation is the primary signal.
- **Index staleness:** Index rebuilt at phase boundaries, not continuously. Accurate for the pipeline model; may miss changes made outside a ticket flow.

---

## Appendix A: v2 Planned Extensions

These are not v1 scope. Documented here as forward references so v1 design decisions account for them.

**Web UI (Kanban board):**
- Fastify HTTP server wrapping the v1 pipeline logic
- React + TypeScript frontend (Electron shell for distribution)
- Three zoom levels: Workspace → Execution Dashboard → Card Execution Panel
- Real-time agent streaming via WebSocket
- Artifacts open in editor of choice; diffs in configured diff viewer

**Additional executors:**
- `anthropic-api` — direct Anthropic API with BYOK (no Claude Code dependency)
- `factory-droid-cli` — Factory AI Droid
- `augment-cli` — Augment AI
- `openai-api` — OpenAI direct

**Parallel BUILD workstreams:**
- Multiple tickets in BUILD simultaneously per project
- Git conflict resolution strategy required

**Level 2 output validation:**
- LLM-based coherence check before reviewer
- Deferred: redundant with reviewer in v1, adds token cost

**Multi-operator support:**
- Shared projects, role-based access
- Deferred: v1 is single-operator by design

**Existing project onboarding / artifact import:**
- Operators frequently start using AEOS on projects that already have PRDs, tech specs, and other documents written by hand or with other tools
- `aeos ticket import` command: takes an existing document, lets the operator specify which column it corresponds to, and commits it to the artifact store with `[human]` authorship — making it a first-class artifact the pipeline can build on
- Enables a "meet you where you are" adoption path: no requirement to start from a blank Backlog
- Deferred to post-v1; the import format and column mapping logic need design

> For full v2 operator interface design including all UI mockups and interaction specs, see `03-system-design-v2-reference.md`.
