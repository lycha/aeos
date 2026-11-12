# Manifesto feature pipeline → aeos SDLC

Maps the 14-stage [feature pipeline](https://github.com/lycha/aeos/wiki/AI-Driven-Development-A-Manifesto#the-feature-pipeline)
onto aeos, and proposes a selectable **manifesto** pipeline alongside the
**standard** one. Design doc, not an implementation.

## The headline finding

The manifesto splits into two phases, and aeos already has both:

- **Stages 1–5 (raw material → spec) are pre-board** and are **already
  implemented** by the `plugins/artefact-tree-pipeline/` plugin — a set of
  schema-backed, human-in-the-loop skills that author the feature's artefacts
  *before* an epic exists. They are not, and under the current spec-pin model
  **cannot be**, epic board columns: `ticket create --spec` refuses an epic
  until `features/<f>/spec.md` + `decisions.yaml` are authored and committed, so
  the stages that produce them run before the ticket that would own the board.
- **Stages 5(gate)–14 are the board**: the EPIC + TASK column pipeline that
  reviews and consumes those artefacts and drives implementation.

So "the full 14-stage board" is realised as **plugin phase (1–5) + board phase
(5-gate–14)**, not 14 epic columns. This is also what the inline review
comments point to (reuse the solo skill, reuse the decisions schema, merge
domain-model into tech-spec, keep generation as the generators mechanism). The
one genuine tension with the earlier "full board" choice is called out under
*Decisions* below.

Everything in aeos is **pipeline-as-data** (`.aeos/pipelines.yaml` +
`.aeos/column-specs/*.yaml`), so a **manifesto** preset is a bundle of template
files plus a way to pick it — no engine change.

## Phase A — artefact authoring (stages 1–5), the `artefact-tree-pipeline` plugin

Human-in-the-loop skills, each with a JSON Schema and the `lint_decisions.py`
cross-file linter. Output lands in `features/<feature>/` and is pinned by
`ticket create --spec`.

| # | Manifesto stage | Skill | Artefact + schema | Human provides / UI |
|---|-----------------|-------|-------------------|---------------------|
| — | (bootstrap) | `artefact-tree-init` | seeds `<tree>/schemas/`, empty assumption register | runs once per project |
| 1 | Raw material (pinned PRD, design, stories) | `prototype-harvest` (ingest) | `feature-inventory.yaml` `meta.sources[]` = `{id, kind, repo, path}` + `source_precedence` | **points to where each source lives** (repo + path); `kind ∈ prd/stories/prototype/codebase/conventions/api-contract`. Sources are read at a commit and kept unchanged. |
| 2 | Feature inventory (screens/states/data/transitions, flag gaps) | `prototype-harvest` | `feature-inventory.yaml` (`feature-inventory.schema.json`: conflicts, screens, states, interactions, data, transitions, **absences**, questions, filler) | reviews/confirms the harvested inventory |
| 3 | Gap-interrogation workshop | `gap-interrogation-solo` (single dev) / `gap-interrogation-capture` (workshop) | → `decisions.yaml` | **UI = `AskUserQuestion`**; persona agents (facilitator + adversary) interrogate every absence/conflict; **the human decides**. Solo supplies the "third seat" for a lone founder. |
| 4 | Decision log (decided/deferred/assumed) | *(same skills — the log is their output)* | `decisions.yaml` (`decisions.schema.json`) | one file, append-only; see *Decision & answer logging* below |
| 5 | **Spec** (EARS + Gherkin + non-goals; traces to decisions) | `spec-writer` | `spec.md` + `features/<f>/*.feature` | reviews; **this is the spec the board's `SPEC_REVIEW` gate approves** |

`decisions.yaml` (`mode ∈ solo-simulated / workshop-captured / paired-live`)
holds **both** the answers and the decisions in one schema, which is how stages
3 and 4 share an artefact:

- `question_resolutions[]` — answers to open questions (`outcome ∈ ANSWERED /
  RECLASSIFIED / ESCALATED / DROPPED`; `answered_by ∈ research / human`).
- `conflict_resolutions[]` — `RESOLVED / RECONCILED / SPLIT / ESCALATED`, with
  `debt_created` and `affects_downstream`.
- `decisions[]` — absences resolved as `DECIDED / DEFERRED / ASSUMED /
  ESCALATED`, each `becomes AC-n / NON-GOAL-n`, carrying `decided_by ∈ human /
  agent`. **Schema invariant: an agent-originated call is never `DECIDED` — only
  `ASSUMED` with a `revisit_when` trigger.** The implementer never gets to
  decide for the human.
- `summary` — ready/blocked stories, open escalations, debt count.

## Phase B — the board (stages 5-gate–14)

Role vocabulary: `standard`, `spec-review`, `decomposition`, `integration`,
`final-gate`. `diffContext`: `none`/`task`/`epic`. `executorMode`:
`artifact` (writes a document) / `agentic` (edits the repo).

| # | Manifesto stage | aeos column | kind | role | mode | artefact / gate |
|---|-----------------|-------------|------|------|------|-----------------|
| 1–5 | *(authored in Phase A)* | `BACKLOG` pins `features/<f>/` | EPIC | — | — | spec pin |
| 5 | **Spec sign-off** | `SPEC_REVIEW` | EPIC | **spec-review** | artifact | reviews pinned spec; **spec gate** |
| 6 | Domain model (entities, invariants, persistence) | `TECH_SPEC` | EPIC | standard | artifact | **domain modelling is part of the tech-spec exercise** — not its own column |
| 7 | **API contract** (human-owned OpenAPI) | `API_CONTRACT` | EPIC | standard | artifact (human-owned) | OpenAPI; **contract gate** |
| 8 | **Schema** (human-owned ERD/SQL; parallel to 7) | `SCHEMA` | EPIC | standard | artifact (human-owned) | ERD/SQL; **contract gate** |
| 9 | Generated scaffold (DTOs, interfaces, repos, e2e suite) | `SCAFFOLD` | EPIC | standard | generated | the existing **`generators`** mechanism (stamped, protected outputs) |
| 10 | Epic and tickets (sequence, deps, DoD) | `TASK_BREAKDOWN` | EPIC | **decomposition** | agentic | child tasks |
| 11 | Implementation (gap → amend decision log) | `IMPLEMENTATION` | TASK | standard | agentic | code diff |
| 12 | Code review panel | `CODE_REVIEW` | TASK | standard | artifact | `*-code-review.md` (panel = multiple rubrics) |
| 13 | QA (generated e2e first, then wider testing) | `QA` | TASK | standard | artifact | `*-qa.md` + `ConformanceService` test report |
| 14 | Conformance report (verdict per AC + instrument) | `INTEGRATION_REVIEW` → `DOD_GATE` | EPIC | integration, then **final-gate** | artifact | conformance report; **release gate** (`ticket dod-approve`) |

```yaml
# .aeos/pipelines.yaml  (manifesto preset)
pipelines:
  EPIC:
    - BACKLOG            # 1-5 authored by the artefact-tree plugin, pinned here
    - SPEC_REVIEW        #  5  role: spec-review   (spec gate)
    - TECH_SPEC          #  6  incl. domain model
    - API_CONTRACT       #  7  human-owned         (contract gate)
    - SCHEMA             #  8  human-owned         (contract gate)
    - SCAFFOLD           #  9  generators mechanism
    - TASK_BREAKDOWN     # 10  role: decomposition
    - INTEGRATION_REVIEW # 14a role: integration
    - DOD_GATE           # 14b role: final-gate    (release gate)
    - DONE
  TASK:
    - BACKLOG
    - IMPLEMENTATION     # 11
    - CODE_REVIEW        # 12
    - QA                 # 13
    - DONE
```

TASK pipeline is identical to standard. All board novelty is three new EPIC
columns: `API_CONTRACT`, `SCHEMA`, `SCAFFOLD`.

## The three always-human gates

Already modelled, one-to-one:

- **Spec** → approval out of `SPEC_REVIEW` (the single `spec-review` column).
- **API contract + schema** → the `--contract` approval gate
  (`TicketApproveUseCase`, `contracts` globs in `project.json`). The manifesto's
  7-∥-8 parallelism survives as *two human-owned columns cleared by the one
  contract gate*, not a fork in column order.
- **Release** → `ticket dod-approve` on the conformance report (`final-gate`).

## Decision & answer logging (resolving the two-writers risk)

One file is the source of truth: `features/<feature>/decisions.yaml`, one schema,
append-only, lint-guarded. It has **two producers but one writer path**:

1. **Phase A** — the gap-interrogation skills write the initial log (human
   answers + decisions) during spec authoring.
2. **Phase B** — when IMPLEMENTATION surfaces a gap, `TicketAnswerUseCase` →
   `SpecAmendmentService` **appends** through the `DecisionsFile` port
   (`YamlDecisionsFile` inserts at the end of the `decisions:` list, next
   `NEW-n`/`AC-n`, comments preserved), lints, commits
   `decide(<feature>): amendment from <ticket>`, records an `amendment` gate, and
   the ticket re-pins via `ticket repin`.

Rules that keep it single-writer and fully logged:

- Nothing else writes `decisions.yaml` — no separate `DECISION_LOG` board column.
  The "decision log" stage is this artefact, produced in Phase A and only ever
  **appended** (never rewritten) in Phase B through the one port.
- Every entry carries provenance: `decided_by`, `answered_by`,
  `capture_confidence`, `evidence`, and (for amendments) the originating ticket.
  So every answer and every decision — human or assumed — is attributable.
- `decided_by: agent` ⇒ `outcome: ASSUMED` (schema-enforced): the system can log
  an assumption but can never record a human decision it did not make.

## How a user picks standard vs manifesto

```bash
aeos project init --pipeline standard|manifesto   # default: standard
```

The option is on the `projectInit` command in `cli-contract.yaml` and flows
handler → `ProjectInitUseCase` → `ProjectRepository.scaffoldDefaults(path,
pipeline)`. For `manifesto`, `templateSet()` overlays the preset on the standard
templates — its `pipelines.yaml` replaces the standard order and its three column
specs, worker agents and rubrics are added — then the normal skip-if-exists
scaffolding writes them, so it both installs the preset and never clobbers a
user's later edits. The loaders, roles, gates and `PipelineGuard` (the "all
tickets in BACKLOG/DONE" switch rule) consume whatever is scaffolded.

The preset ships at `templates/presets/manifesto/` but is **not** part of the
default scaffold: `readTemplates()` skips the `presets/` subtree (so standard
`project init` and the exact-match `template-source.test.ts` are unaffected), and
`readPreset('manifesto')` reads it only when asked. `manifesto-preset.test.ts`
holds the scaffolded result to the same loader bar as the standard scaffold.

An already-initialised project can also switch by copying the bundle into
`.aeos/` (see the preset README); the engine is pipeline-as-data either way.

The manifesto preset also implies the project adopts the `artefact-tree-pipeline`
plugin for Phase A (it already ships in-repo); `artefact-tree-init` seeds its
schemas.

## New board columns (built in the preset)

Each manifesto-only column has a column spec, a dedicated worker agent, and a
structure rubric; all three **reuse the standard `reviewer-agent`** as grader, so
no new reviewer prompts were authored. `SPEC_REVIEW`, `TECH_SPEC`,
`TASK_BREAKDOWN`, `INTEGRATION_REVIEW`, `DOD_GATE`, `IMPLEMENTATION`,
`CODE_REVIEW`, `QA` are reused unchanged from the standard preset.

| New EPIC column | Worker (new) | diff | Notes |
|-----------------|--------------|------|-------|
| `API_CONTRACT` | `api-contract-agent` — reviews the human's OpenAPI, drafts nothing | none | cleared by the contract gate |
| `SCHEMA` | `schema-agent` — reviews the human's ERD/SQL against the domain model | none | same shape; contract gate |
| `SCAFFOLD` | `scaffold-agent` — reviews the generators' deterministic output | epic | generation stays the `generators` mechanism; the column only reviews it |

## Decisions (from review) and the one open tension

Resolved:

- **API contract / schema** → **separate columns** (faithful to the manifesto).
- **Gap workshop** → a real stage, backed by `gap-interrogation-solo` for single
  developers; UI `AskUserQuestion`; answers logged to `decisions.yaml` per schema.
- **Scaffold** → keep the existing **generators** mechanism (valid as-is).
- **Decision log** → single file, single writer path; no separate column (above).
- **Domain model** → **part of `TECH_SPEC`**; no `DOMAIN_MODEL` column, so no
  migration of in-flight epics.
- **Raw material** → the human **points to each source's directory/path** via the
  inventory's `meta.sources[]` (repo + path) + `source_precedence`.

Open tension to confirm:

- The earlier call was a **"full 14-stage board."** This design instead keeps
  stages 1–5 in the pre-board **plugin phase**, because the spec-pin model refuses
  an epic before its spec exists — making stages 1–5 epic columns would require
  inverting epic creation (create first, author spec in-board, pin later), a much
  larger change that fights `spec-pin.ts`. **Confirm**: plugin-phase for 1–5
  (recommended, ~3 new board columns), or genuinely invert epic creation to put
  all 14 on the board (large; redesigns spec pinning)?
