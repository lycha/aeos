# AEOS v1 — Action Plan

**Author:** Kris
**Date:** 2026-04-07
**Status:** Revised (post peer review 2026-04-07)
**Build Mode:** Dogfood — AEOS builds AEOS using its own pipeline

---

## Guiding Principle

We use the pipeline to build the pipeline. Every feature ticket goes through Backlog → Product Scoping → Architecture Spike → Tech Spec → Implementation → Code Review. This is the live proof-of-concept. If the pipeline cannot build itself, the design is wrong.

The first few milestones are bootstrapping exceptions — we need enough of a harness to run the first real ticket before we can dogfood anything. After Milestone 2, every new feature is a ticket.

---

## Milestone Map

```
M0   Repo & Toolchain Setup          ← Manual (no pipeline yet)
M1   CLI Skeleton + State Machine     ← Manual (bootstrapping)
M2   Dogfood Harness                  ← Pipeline can run its first ticket
M3   PM Agent End-to-End              ← First full PLAN column run
M4   Architect Agent                  ← Full PREPARE column run
M5a  Engineer Agent — Implementation  ← impl-notes + plan review
M5b  Engineer Agent — Code Review     ← diff-based review (distinct gate)
M6   QA Agent + DoD Gate             ← Full DEPLOY column run
M7   Polish & Distribution            ← pkg binary, install experience
```

**Critical path:** M2 (`ClaudeCodeCliExecutor` + `reviewer-agent.yaml`) → M3 (PM agent) → M4 (Architect agent) → M5a → M5b → M6. Everything from M3 onward is blocked on M2's executor integration being verified end-to-end.

---

## M0 — Repo & Toolchain Setup

**Goal:** Empty repo with working build pipeline.
**Method:** Manual. No AEOS yet.

### Tasks

- [ ] Create GitHub repo: `aeos` (private)
- [ ] `npm init`, `tsconfig.json` (strict, ESM, Node 20)
- [ ] `prettier` + `eslint` (ts-eslint, opinionated ruleset)
- [ ] `vitest` for unit tests
- [ ] `package.json` scripts: `build`, `dev`, `test`, `lint`
- [ ] **Manually** configure `~/.gitignore_global` to include `.aeos/` and run `git config --global core.excludesfile ~/.gitignore_global` — this protects the dev environment before a single `aeos` command exists. Note: M1's `aeos install` replicates this programmatically for end users.
- [ ] GitHub Actions CI: lint → build → test on every push

**Exit criteria:** `npm run build` passes. `npm test` passes (zero tests). CI green. `.aeos/` confirmed absent from `git status` in the dev repo.

---

## M1 — CLI Skeleton + State Machine

**Goal:** `aeos` command exists; state machine core is implemented and tested.
**Method:** Manual (bootstrapping).

### Tasks

**CLI shell (Commander.js)**

- [ ] `aeos install` — creates `~/.aeos/`, configures global gitignore, writes default `config.json`
- [ ] `aeos project init [--name]` — creates `.aeos/` at CWD, registers in `registry.json`
- [ ] `aeos ticket create <title>` — writes `T001-ticket.md`, commits to `.aeos/.git`
- [ ] `aeos ticket list` — reads `state.db`, prints column/sub-state for all tickets
- [ ] `aeos ticket show <id>` — prints current sub-state, artifact list

**State machine**

- [ ] SQLite schema via `better-sqlite3` (tickets, transitions, cost_records)
- [ ] Column enum: BACKLOG → PRODUCT_SCOPING → ARCH_SPIKE → TECH_SPEC → IMPLEMENTATION → CODE_REVIEW → QA → DOD_GATE → DONE
- [ ] Sub-state enum: BLOCKED / WORKING / INTERRUPTED / FAILED / IN_REVIEW / SIGNED_OFF
- [ ] `transition(ticketId, targetColumn)` — validates legal transitions, writes to DB
- [ ] `setSubState(ticketId, subState)` — immediate state update
- [ ] Unit tests: legal transitions, illegal transition rejection, sub-state lifecycle

**Filesystem helpers**

- [ ] `aeosHome()` — resolves `~/.aeos/`
- [ ] `projectRoot()` — walks up from CWD to find `.aeos/`
- [ ] `artifactPath(ticketId, artifactName)` — returns canonical path
- [ ] `gitCommit(message, files[])` — wraps `simple-git`, writes structured commit

**Exit criteria:** Can `aeos install`, `aeos project init`, `aeos ticket create`, and `aeos ticket list` from terminal. State machine unit tests all pass. No executor yet. **Validation:** run `aeos project init` in the `aeos` dev repo itself and confirm `.aeos/` does not appear in `git status` output — verifying the gitignore chain works end-to-end.

---

## M2 — Dogfood Harness

**Goal:** The pipeline can run its first ticket end-to-end with a stub executor. After this milestone, all further work is a ticket in the pipeline.
**Method:** Manual (last manual milestone).

### Tasks

**Executor abstraction**

- [ ] `Executor` interface (TypeScript): `run(invocation): Promise<ExecutorResult>`
- [ ] `StubExecutor` — writes a placeholder markdown file to the output path; used for testing state machine flow without real LLM calls
- [ ] `ClaudeCodeCliExecutor` — shells out to `claude -p "<prompt>"`, captures stdout, writes to temp file

**Prompt assembly**

- [ ] `ContextAssembler` — reads ticket.md + prior artifacts + CONSTRAINTS.md, concatenates in order
- [ ] `PromptBuilder` — wraps context in [ROLE] / [CONTEXT] / [TASK] / [OUTPUT FORMAT] / [SELF-VERIFICATION] sections

**Output validation**

- [ ] Rule-based structural check: required sections present, minimum word count, no empty template placeholders
- [ ] Returns `ValidationResult { passed: boolean; violations: string[] }`

**Column spec loader**

- [ ] YAML column spec schema (TypeScript Zod schema)
- [ ] Loader: reads `.aeos/column-specs/*.yaml`, validates, returns typed config

**Pre-flight pass**

- [ ] Lightweight executor invocation before main run
- [ ] If blockers found → writes `T001-questions.md`, transitions to BLOCKED
- [ ] `aeos ticket answer <id>` — operator fills answers, resumes run

**Run command**

- [ ] `aeos ticket run <id>` — full orchestration: pre-flight → WORKING → executor → validate → reviewer → SIGNED-OFF
- [ ] `aeos ticket approve <id>` — advances SIGNED-OFF ticket to next column

**Reviewer agent spec (manual — prerequisite to M3)**

- [ ] Write `reviewer-agent.yaml` by hand during M2 (there is no pipeline yet to produce it). This is the one agent spec that cannot dogfood itself. Covers: system prompt, executor config, context scope. The rubrics referenced are produced by later AEOS tickets — the spec only needs to define the agent's role and behaviour; rubric paths are injected at runtime from the column spec.

**`ClaudeCodeCliExecutor` smoke test**

- [ ] Run a trivial prompt through `ClaudeCodeCliExecutor` directly (e.g., `"Write one sentence about software engineering."`) and assert: (a) artifact written to correct path, (b) output is non-empty valid text, (c) structured git commit produced with correct format. This validates the executor integration independently before M3 depends on it.

**Exit criteria:** Run a single ticket using `StubExecutor` through the full pipeline (BACKLOG → DONE). All state transitions recorded. Artifacts committed to `.aeos/.git`. `ClaudeCodeCliExecutor` smoke test passes. `reviewer-agent.yaml` exists and is valid YAML. All unit tests pass.

---

## M3 — PM Agent (Product Scoping Column)

**Goal:** First real agent run. A ticket in PRODUCT_SCOPING produces a real PRD reviewed by the reviewer agent.
**Method:** Dogfood — this feature is a ticket in the pipeline.

**Ticket ID convention:** `AEOS` is the project key for the AEOS project itself. Set at `aeos project init --key AEOS` when initialising the dev project. All dogfood tickets are `AEOS-N`.

### Prerequisites from M2

- Column spec loader
- `ClaudeCodeCliExecutor` (smoke tested)
- `reviewer-agent.yaml` (hand-authored in M2)
- Reviewer prompt assembly working

### Tickets to run through pipeline

1. **AEOS-1** — *PM Agent system prompt and context scope*
   - Produces: `pm-agent.yaml` (agent spec)
2. **AEOS-2** — *PRD structure rubric (`prd-structure.md`)*
   - Produces: first rubric in the library
3. **AEOS-3** — *PRD artifact template (`prd-template.md`)*
   - Produces: template injected into pm-agent prompt
4. **AEOS-4** — *Intent drift rubric (`intent-drift.md`)*
   - Produces: pass-2 rubric used by reviewer in all columns

**Rubric iteration note:** Expect to iterate on `prd-structure.md` and `intent-drift.md` during M3. If the reviewer is too noisy (false WARNINGs) or too permissive (passes bad PRDs), the rubric is the primary dial — not the agent spec. First diagnose using the protocol below before touching rubrics.

**Exit criteria:** `aeos ticket run AEOS-X` on a real feature ticket completes PRODUCT_SCOPING with a real PRD. Reviewer passes or flags blockers. Operator approves. Ticket advances to ARCH_SPIKE.

---

## M4 — Architect Agent (Architecture Spike + Tech Spec Columns)

**Goal:** Both PREPARE columns produce real artifacts reviewed end-to-end.
**Method:** Dogfood.

### Tickets to run through pipeline

5. **AEOS-5** — *Architect agent system prompt and context scope*
6. **AEOS-6** — *Architecture spike template (`spike-template.md`)*
7. **AEOS-7** — *Tech spec structure rubric (`tech-spec-structure.md`)*
8. **AEOS-8** — *Tech spec artifact template (`tech-spec-template.md`)*

**Exit criteria:** A ticket can move from BACKLOG through PRODUCT_SCOPING → ARCH_SPIKE → TECH_SPEC with real artifacts at each column. Reviewer running in each column.

---

## M5a — Engineer Agent (Implementation Column)

**Goal:** The pipeline produces a real implementation plan (`implementation-notes.md`) that passes reviewer sign-off.
**Method:** Dogfood.

### Tickets to run through pipeline

9. **AEOS-9** — *Engineer agent system prompt and context scope*
10. **AEOS-10** — *Implementation notes template (`implementation-notes-template.md`)*
11. **AEOS-11** — *Implementation structure rubric (reviewer pass-1 for IMPLEMENTATION column)*
12. **AEOS-12** — *`CONSTRAINTS.md` injection into engineer-agent context*

**Exit criteria:** A ticket runs through IMPLEMENTATION producing a real `implementation-notes.md`. Reviewer evaluates the plan (not code). Operator approves. Ticket advances to CODE_REVIEW.

---

## M5b — Code Review Column

**Goal:** The pipeline produces real code and a code review that evaluates the diff.
**Method:** Dogfood.

**Key design checkpoint:** Code Review sign-off evaluates the code diff — not a markdown artifact. The reviewer prompt assembly for this column is fundamentally different: it must inject the diff, not just prior artifacts. This is a distinct implementation concern from M5a.

### Tickets to run through pipeline

13. **AEOS-13** — *Code structure rubric (`code-structure.md`)*
14. **AEOS-14** — *Code review artifact template and diff injection into reviewer context*

**Exit criteria:** A ticket runs through CODE_REVIEW with a diff-based reviewer invocation. Code review artifact produced. Reviewer sign-off recorded. Both M5a and M5b sign-offs visible to operator as distinct gates.

---

## M6 — QA Agent + DoD Gate

**Goal:** Full pipeline, end to end.
**Method:** Dogfood.

**Design prerequisite:** DEPLOY columns are partially designed as of plan authoring. Before running M6 tickets, complete the DEPLOY column design (DoD Gate human approval UX, QA agent context scope). Treat this design work as AEOS-15 (a ticket through the pipeline, not a manual task).

### Tickets to run through pipeline

15. **AEOS-15** — *DEPLOY column design (DoD Gate flow + QA context scope)*
16. **AEOS-16** — *QA agent system prompt*
17. **AEOS-17** — *QA report template (`qa-report-template.md`)*
18. **AEOS-18** — *QA structure rubric (`qa-report-structure.md`)*
19. **AEOS-19** — *DoD evaluation rubric (`dod-evaluation.md`)*
20. **AEOS-20** — *DoD Gate human approval CLI flow*

**Exit criteria:** A real ticket (not a stub) moves from BACKLOG to DONE with artifacts at every column and a human-approved DoD gate.

---

## M7 — Polish & Distribution

**Goal:** v1 is shippable. Someone who has never used AEOS can install it in 5 minutes.
**Method:** Dogfood where possible; manual for packaging tooling.

### Tasks

- [ ] `pkg` single binary packaging — one file, no Node install required
- [ ] `aeos install` experience: first-run wizard (global gitignore, default model, currency)
- [ ] `aeos dashboard` — cross-project Kanban summary in terminal
- [ ] `aeos costs` — spend report (by project, by ticket, by billing period)
- [ ] Error messages: every FAILED state has a clear, actionable message
- [ ] README: install → first ticket → approve → done

**Exit criteria:** Install from a GitHub release. Create a project, run a ticket through the full pipeline, reach DONE. No setup beyond `aeos install`.

---

## Dogfooding Protocol

Starting from M3, all new features follow this rule:

1. Write the ticket (`aeos ticket create`)
2. Run it through the pipeline (`aeos ticket run`)
3. Approve each column manually
4. The implementation that comes out of CODE_REVIEW is what gets merged

If the pipeline produces a bad artifact — bad PRD, bad spec, bad code — use the diagnostic below to identify root cause before touching anything. Fix the rubric, not the output. This keeps the institutional knowledge in the system, not in your head.

### Artifact Failure Diagnostic

Three failure modes produce "bad artifact" symptoms. Diagnose before acting:

**1. Artifact is malformed or empty**
→ Suspect executor or output validation. Check: did `ClaudeCodeCliExecutor` exit with non-zero code? Did `ValidationResult` catch a violation? Did prompt assembly produce a truncated string?

**2. Artifact is well-formed but wrong content**
→ Suspect prompt assembly or context scope. Check: is the ticket description fully present in the assembled context? Is `ContextAssembler` including all required prior artifacts? Is the [TASK] section of the prompt specific enough?

**3. Artifact is well-formed, correct content, but reviewer rejects it**
→ Suspect rubric. Check: is the rubric criterion genuinely failing, or is the reviewer being over-literal? Update the rubric — don't fix the artifact manually.

Each failure mode has a different fix. Don't iterate on rubrics when the problem is prompt assembly.

---

## Risk Register

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `claude -p` flag changes / deprecated | Low | Executor abstraction isolates this; swap to API executor if needed |
| Pre-flight pass adds latency with no value | Medium | Make pre-flight optional per column spec |
| Reviewer LLM noise — too many WARNINGs on valid artifacts | High | Tight rubric authoring is the primary quality lever; start narrow |
| State machine diverges from file system | Low | Validation command: `aeos project validate` cross-checks DB vs disk |
| Dogfooding slows down M3–M6 | Medium | Acceptable — the slowdown IS the test. If it's painful, the UX is wrong |

---

## Open Decisions

- **DEPLOY columns (QA → DoD Gate):** Partially designed. Complete before M6 via AEOS-15 (a dogfood ticket).
- **Cost recording schema:** Rough shape exists; finalise during M2 when executor is wired.
- **`advance_mode: auto` vs `manual`:** v1 ships as manual-only. Auto-advance is a config flag for v2.
- **Multi-project dashboard layout:** Design during M7 when we have real data to display.
- **`AEOS` project key:** Confirmed as the key for the AEOS dev project itself. Set via `aeos project init --key AEOS`. Two projects with the same key are disambiguated by `{project-id}:{ticket-id}` when referenced cross-project.
