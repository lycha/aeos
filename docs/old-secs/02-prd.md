# Product Requirements Document: AI Engineering Operating System

**Author:** Kris
**Date:** March 24, 2026
**Status:** Draft
**Version:** 0.1

---

## 1. Overview

The AI Engineering Operating System (AI Eng OS) is a Kanban-based operator interface for running an AI-powered product squad through a structured, human-controlled SDLC pipeline. Each stage of the pipeline is owned by a configured AI agent that transforms the ticket artifact. The human operator maintains master control over flow, quality gates, and all significant decisions.

The core metaphor is a factory floor from *The Phoenix Project*: the ticket is the work order, the Kanban board is the factory floor, and each station transforms the work order into a richer, more refined artifact. Nothing moves to the next station without passing quality control.

---

## 2. Problem Statement

Engineering managers and senior engineers with deep SDLC expertise have no tool that lets them apply that expertise *to* AI. Current tools force a choice between:

- **Too narrow:** AI coding assistants (Copilot, Cursor) that augment individuals but don't model team process
- **Too opaque:** Agentic pipelines (AutoGen, CrewAI) that automate without operator visibility or control
- **Too manual:** Custom-built one-off solutions hacked together by individuals solving their own problem

The result is that AI adoption stays shallow — at the individual contributor level — and the leverage that experienced EMs could apply at the *process* level remains untapped.

---

## 3. Goals

- Enable a solo operator with SDLC expertise to run a full AI-powered product squad
- Make every agent action, artifact, and decision traceable and reviewable
- Keep the human operator in control at all meaningful decision points
- Support the full pipeline from raw idea to deployable code
- Be configurable enough to adapt to different projects and team conventions without being rebuilt from scratch

### Non-Goals (v1)
- Full automation with no human involvement
- Multi-operator / team collaboration
- Integration with external PM tools (Jira, Linear)
- Post-deployment feedback loop / OBSERVE phase
- Parallel workstreams on a single ticket
- Backlog triage and prioritisation automation

---

## 4. Users

**Primary:** Kris — solo founder, experienced EM and engineer, operating the system alone. Deep understanding of SDLC, high trust in structured process, low tolerance for black-box automation.

**Future:** Other EMs, technical leads, and senior engineers who want to run AI-powered squads with full process rigour.

---

## 5. Core Concepts

### 5.1 The Ticket
The unit of work. Created by the human operator. Contains:
- **Title**
- **Description**
- **Definition of Done (DoD)** — end-to-end acceptance criteria; evaluated only at the final gate before DEPLOY
- **Additional Notes**

The ticket is the identity anchor. It does not change as it moves through the pipeline. What changes is the artifact tree attached to it.

### 5.2 The Artifact Tree
Each column produces a specific artifact (a Markdown file). Artifacts accumulate as the ticket progresses, forming a document tree:

```
/tickets/{ticket-id}/
  ticket.md            ← created at card creation, never overwritten
  plan/
    prd.md
    prd-review.md
  prepare/
    spike.md
    tech-spec.md
    spec-review.md
  build/
    implementation-notes.md
    pr-description.md
    code-review.md
  deploy/
    deploy-checklist.md
    dod-verification.md
```

All artifacts are versioned via git with structured commit messages:
```
[ARTIFACT][vN][action: reason]
e.g. [PRD][v2][rework: architect-feedback-spike-blocked]
```

History is always linear (no branches). One agent owns an artifact at a time. Human edits are committed directly and attributed.

### 5.3 The Board
A Kanban board organised into **phase groups**, each containing **columns**.

```
PLAN          │ PREPARE         │ BUILD              │ DEPLOY
──────────────┼─────────────────┼────────────────────┼──────────────
Backlog       │ Architecture    │ Implementation     │ QA Validation
              │ Spike           │                    │
Product       │                 │ Code Review        │ DoD Gate
Scoping       │ Tech Spec       │                    │
              │                 │                    │ Release
              │                 │                    │
```

> ⚠️ Exact column map is an open design question — see Section 9.

### 5.4 The Agent
An agent is a spec, not a type. Every agent — worker or reviewer — is defined by the same object:

| Field | Description |
|-------|-------------|
| `name` | Human-readable identifier |
| `role` | e.g. `worker`, `reviewer` |
| `system_prompt` | Full instruction set for this agent |
| `context_scope` | What context this agent receives (see 5.6) |
| `input_spec` | What artifact(s) it reads |
| `output_spec` | What artifact(s) it produces |
| `model` | LLM model to use |
| `self_verification` | Whether agent produces a plan + checklist before executing |

Agents are maintained in a **library** curated by the operator. They cannot be modified per board or per column — only selected.

### 5.5 The Column
Each column is configured independently:

| Field | Description |
|-------|-------------|
| `worker_agent` | Agent from library that performs the transformation |
| `reviewer_agent` | Agent from library that reviews the output |
| `rubric` | Review criteria for this column (process quality, not outcome quality) |
| `input_spec` | What the column expects to receive |
| `output_spec` | What the column must produce to be considered complete |
| `max_iterations` | Maximum review cycles before escalation |
| `escalation_behaviour` | `escalate_to_human` or `mark_done` (per column config) |
| `advance_mode` | `auto` (moves to next column on sign-off) or `manual` (requires operator action) |

### 5.6 Context Scoping
Agents do not all receive the same context. Context is scoped by phase:

| Phase | Context Available |
|-------|-------------------|
| PLAN | Business context, product decisions, ticket |
| PREPARE | Ticket, PLAN artifacts, high-level architecture index, CONSTRAINTS.md |
| BUILD | Ticket, all prior artifacts, full codebase index, CONSTRAINTS.md |
| DEPLOY | Ticket, all artifacts, full codebase index, CONSTRAINTS.md |

The **codebase index** is a file tree with per-file descriptions (similar to Shotgun's approach) — agents navigate the index to find relevant files rather than receiving the full codebase. The index is refreshed before the DEPLOY phase.

**CONSTRAINTS.md** is a board-level config file containing architectural laws and coding constraints (e.g. "use repository pattern, no direct DB calls in controllers"). It is injected automatically to all agents in PREPARE and BUILD phases.

### 5.7 The Review Cycle
Every column runs the same review loop:

```
Worker agent executes
  → Self-verification (plan → execute → check against plan)
  → Produces artifact
Reviewer agent evaluates artifact against column rubric
  → Returns findings with severity tags:
      INFO    — note, no action required
      WARNING — should fix; accumulates toward max iterations
      BLOCKER — must fix; always escalates to human regardless of iteration count
If findings exist and iterations < max:
  → Worker agent reworks
If max iterations reached:
  → Escalate to human (if column config = escalate_to_human)
  → OR mark done (if column config = mark_done)
If no findings (or only INFO):
  → Column sign-off flag set
  → Card becomes eligible to advance
```

### 5.8 The Human Operator
The operator is master of the process. Operator capabilities:

- **Create tickets** — only the operator adds cards to the backlog
- **Move cards** — forward (to next column) or backward (to any prior column) at any time
- **Direct edit** — edit any artifact directly; edit is committed as a new git commit
- **Pause agent** — interrupt an agent mid-execution
- **Override sign-off** — advance a card even if the sign-off flag is not set
- **Approve or reject BLOCKER escalations** — the only path forward when a BLOCKER is raised
- **Configure advance mode** — set per column whether cards auto-advance or wait for operator action

### 5.9 Leftward Movement
Cards can move left at any time. When a card moves left:
- It returns to the target column in a "rework" state
- The worker agent for that column receives the full artifact history, including the reason for the return and any reviewer findings from the failed pass
- The agent produces a new version of the artifact as a new git commit
- The review cycle restarts

---

## 6. Board Templates

Boards are reusable. The operator can:
- Create a board template with a fixed column map and agent assignments
- Instantiate a new board from a template for each project
- Run multiple boards simultaneously (one per project)

Templates do not modify agents — they only reference agents from the library by name.

---

## 7. Functional Requirements

### Must Have (v1)
- FR-01: Operator can create tickets with title, description, DoD, and notes
- FR-02: Tickets move through columns in a Kanban board organised by phase groups
- FR-03: Each column has a configured worker agent and reviewer agent
- FR-04: Worker agent produces an artifact; reviewer agent evaluates it in two passes (structure + drift)
- FR-05: Reviewer returns findings tagged INFO / WARNING / BLOCKER
- FR-06: BLOCKER findings always escalate to the operator
- FR-07: Max iteration limit is configurable per column
- FR-08: Escalation behaviour on max iterations is configurable per column (`escalate_to_human` or `mark_done`)
- FR-09: All artifacts are stored as Markdown files in a git-backed document tree
- FR-10: All agent and human commits use structured commit message convention `[ARTIFACT][vN][AGENT][action: reason]`
- FR-11: Operator can directly edit any artifact in their editor of choice; edit is committed as `[human][edit]`
- FR-12: Operator can move cards forward or backward at any time with an optional transition comment
- FR-13: Operator can interrupt a running agent; agent restarts from step 1 on resume
- FR-14: Operator can configure advance mode (auto / manual) per column
- FR-15: Board-level CONSTRAINTS.md is injected to relevant agents automatically
- FR-16: Codebase index is available to BUILD and DEPLOY agents
- FR-17: Codebase index is refreshed before the DEPLOY phase
- FR-18: DoD is evaluated only at the final gate before DEPLOY
- FR-19: Board configurations are saveable as reusable templates
- FR-20: Agent library is curated by the operator; agents cannot be modified per board
- FR-21: One generic reviewer agent in library; system prompt assembled dynamically at runtime from column spec + rubric library
- FR-22: Rubric library is a first-class, independently maintained collection of reusable rubrics
- FR-23: Reviewer agent runs two passes per review cycle: Pass 1 (structure vs rubric), Pass 2 (drift vs ticket intent)
- FR-24: Every card move (forward or backward) presents a transition comment panel; comment committed as `[human][transition-note]`
- FR-25: Operator interface is a custom web UI with three zoom levels: Workspace, Execution Dashboard, Card Execution Panel
- FR-26: Workspace view shows all projects as cards, each listing in-flight tickets with column, sub-state, and progress
- FR-27: Attention model surfaces URGENT / PENDING / RUNNING tiers; operator is only interrupted for URGENT items
- FR-28: Card view allows opening artifacts and diffs in editor of choice (not rendered in-UI)
- FR-29: Card view shows list of files changed by the ticket
- FR-30: Every agent invocation writes a structured cost record (model, input tokens, output tokens, timestamp)
- FR-31: Cost visible at card level (total tokens + total cost), project level (per-ticket summary), and workspace level (by project and by model in USD)
- FR-32: Global settings allow configuration of API provider, API key, available models, and cost per 1M tokens in/out

### Should Have (v1)
- FR-33: Agent self-verification — worker produces a plan and checklist, executes, verifies against checklist before handing to reviewer
- FR-34: Execution panel (Level 3) showing current step with preconditions and verification steps, step list, and live timestamped log
- FR-35: Operator can view full artifact history (git log) per ticket
- FR-36: Execution dashboard (Level 2) showing all running agents across all projects simultaneously

### Won't Have (v1)
- FR-24: Multi-operator collaboration
- FR-25: Post-deploy feedback loop
- FR-26: Backlog triage automation
- FR-27: External PM tool integration
- FR-28: Parallel workstreams per ticket

---

## 8. Non-Functional Requirements

- NFR-01: Artifacts must be human-readable Markdown, optimised for agent consumption
- NFR-02: All agent activity must be auditable via git history
- NFR-03: The system must run against a local git repository
- NFR-04: Context injection must be scoped — agents receive only the context appropriate to their phase
- NFR-05: The operator must always be able to intervene, override, or pause at any point

---

## 9. Open Questions

| # | Question | Priority | Notes |
|---|----------|----------|-------|
| OQ-01 | What is the exact column map inside each phase group? | High | Partially drafted — needs finalisation |
| OQ-02 | How do the ticket DoD and the column rubric coexist in the reviewer agent's prompt? | High | Known tension — not yet resolved |
| OQ-03 | What is the operator interface? Custom UI, existing Kanban tool, or CLI? | High | Deferred to product design phase |
| OQ-04 | How do agents communicate context across column handoffs? Structured handoff doc, shared memory, or full artifact history? | Medium | Leaning toward full artifact history in context |
| OQ-05 | What is the minimum viable ticket input that the first agent can work with? | Medium | Need to define seed template |
| OQ-06 | How is the codebase index built and maintained incrementally? | Medium | Known hard problem — refresh-before-deploy is the v1 answer |

---

## 10. Assumptions

- ⚠️ The operator (Kris) is willing to learn and operate a new interface rather than rely solely on chat
- ⚠️ Agent-to-agent handoff quality is sufficient with full artifact history as context, without a dedicated memory layer in v1
- ⚠️ A Markdown-native artifact store is sufficient for v1 without a structured database layer
- ⚠️ Linear git history per ticket is sufficient without branching for parallel exploration
