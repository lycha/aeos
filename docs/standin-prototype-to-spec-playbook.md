# From Prototype to Agent-Ready Spec — StandIn Playbook

**Input:** an HTML prototype and a handful of user stories written as bare statements.
**Output:** a specification package an agent can implement without inventing anything.
**Cost:** roughly one to one and a half days of front-loaded human work per feature.

---

## The reframe

Two things are true about the prototype at the same time, and the procedure exists to exploit the first and defend against the second.

**It is an under-extracted specification.** It already encodes the screen states, the interaction affordances, the field-level data shape, the transitions, and much of the validation. Most teams throw this away and let the implementer re-derive it from scratch. That is the single largest waste in a design handoff.

**It is a dangerous illusion of completeness.** A prototype shows the happy path for one role at one moment. It does not show conflict, permission denial, partial failure, or staleness — and an agent handed a prototype will confidently invent all of them.

For StandIn specifically the second problem is acute. **A prototype shows a moment; async collaboration is about the gaps between moments.** The hardest questions in your domain — what two people see when they act simultaneously, what someone sees returning after twelve hours across a timezone boundary, what happens to state that was true when it was written and isn't now — are structurally invisible in an HTML mockup. If the procedure has one job, it is dragging those into the open before an agent guesses.

---

## Phase 0 — Domain language (once per bounded context, not per feature)

Before any feature work: a glossary for the context this feature lives in.

If Parker's prototype says *workspace*, your API says *team*, and the schema says *org*, agents will produce all three inconsistently and you will spend the rest of the project translating. Ubiquitous language is not documentation hygiene here — it is the literal input format for every agent prompt.

**Deliverable:** `contexts/<name>/glossary.md` — term, definition, and explicitly the terms it is *not* a synonym for.

---

## Phase 1 — Harvest every source

Mechanical, LLM-assisted, human-verified. This is where the review-surface principle applies to design handoff: **the human reviews the extracted inventory, not the sources.**

The prototype is rarely alone. Expect four or five sources describing the same feature — PRD, story set, prototype, existing codebase, conventions file (`CLAUDE.md`) — and expect them to disagree. That produces a second class of finding alongside absence:

| | Meaning | Failure mode |
|---|---|---|
| **Absence** | Nobody decided | The agent invents it |
| **Conflict** | Somebody decided, twice, incompatibly | Downstream artefacts **fork** |

Vocabulary conflicts are the expensive ones — four names for one entity forks the API contract, table names, event names, UI copy and every ticket. Watch particularly for a prototype using one vocabulary in **copy** and another in **identifiers**; designers rename copy long before anyone renames code.

Declare **source precedence** once per project (typically: conventions → codebase → prototype → stories → PRD). Most conflicts then resolve automatically, and only genuine product questions reach Phase 2.

Extract into a structured file:

| Inventory | What to capture |
|---|---|
| **Screens & states** | Every distinct view state present in the HTML |
| **Interactions** | Every control, what it triggers, what disables it |
| **Data** | Every field displayed or edited → candidate entity attributes |
| **Transitions** | The state machine the prototype implies |
| **Present states** | Which empty / loading / error states were actually designed |
| **Absent states** | Which were not — this list feeds Phase 2 |

**Tooling:** none of the off-the-shelf design-to-code tools do this — they generate components, which is the opposite of what you want here. You need a Claude Code skill you write yourself (suggested name: `prototype-harvest`) that takes the HTML and emits `feature-inventory.yaml`. Point it at every source and **pin each to a commit SHA** — a spec derived from an unpinned source drifts silently when someone pushes again.

**Deliverable:** `feature-inventory.yaml` — conflicts first, then the inventory, then absences.

---

## Phase 2 — Interrogate the gaps

The expensive human phase, and the one that defines the Product Engineering Architect role. Run the inventory against a fixed checklist. Fixed matters — memory is not a procedure.

**Round 0 — answer questions. Round 1 — resolve conflicts. Round 2 — absences, per story.**

Questions come first because they are unknowns about the *sources*, not product decisions — and answering one often promotes it into a conflict or an absence that then needs working in the same session. Pre-research the `researchable: true` ones; most are settled by grep. Anything taking more than 30 seconds is not a question and gets reclassified.

Then conflicts, before absences. This is an ordering constraint, not a preference: an unresolved vocabulary conflict makes half the absence descriptions ambiguous, and you will re-litigate them after renaming. Precedence will have pre-resolved most; work only the `requires_human: true` ones. Conflicts resolve as RESOLVED (one source wins), RECONCILED (neither was right), SPLIT (both right — they were two concepts all along), or ESCALATED.

**Async-specific (StandIn's real risk surface)**
- Two people act on the same object simultaneously — last-write-wins, merge, or conflict surface?
- Someone returns after twelve hours. What is highlighted as changed? What is silently different?
- What is the ordering guarantee, and is it wall-clock or causal?
- What does a user see about state that was true when written and isn't now?
- Timezone: whose day boundary governs? What renders in whose local time?
- Who gets notified, how is it batched, and what is the fatigue ceiling?

**Universal**
- **Permissions** — who can see and do each thing? Prototypes are always drawn as the most privileged role.
- **Failure** — network drops mid-action. What is the recovery, and is the action idempotent?
- **Boundaries** — zero items, one item, ten thousand items, a 4,000-character title.
- **Lifecycle** — what happens to this when its parent is archived or deleted?
- **Concurrency of the mundane** — double-click on submit.

Each unanswered question is either a product decision you make now, or a bug an agent invents later. There is no third outcome.

**Format:** run this as **Example Mapping** — story in the centre, rules above, examples below, open questions on the side. Twenty minutes per story with both founders. Questions that survive the session are escalations, not assumptions.

**Runbook:** `gap-interrogation-runbook.md` — session structure, roles, the four outcome types, timeboxing rules, and the `decisions.yaml` output format.

**Deliverable:** `decisions.yaml` — every absence resolved as DECIDED, DEFERRED, ASSUMED, or ESCALATED.

---

## Phase 3 — Write the specification

Only now. The user stories become real.

- **Acceptance criteria in EARS**, each with a stable ID (`AC-1`, `AC-2`…).
- **Decision tables** for anything with more than three interacting conditions — EARS becomes unreadable there and agents misparse nested conditionals.
- **Gherkin scenarios** for the flows worth exemplifying, each tagged with the AC IDs it covers.
- **Invariants** stated explicitly — the things that must always be true regardless of path. In async collaboration these are usually about ordering and convergence.
- **Non-goals** stated explicitly. Agents fill silence with plausible defaults; the cheapest defence is not leaving silence.
- **Risk tag** per story — drives which verification tier applies.

Your existing `user-story-writer` and `agile-task-writer` skills cover part of this. What they need adding: the AC ID scheme and the requirement that every criterion trace to a prototype element or an answered Phase 2 question.

**Deliverable:** `spec.md` with AC IDs, `features/*.feature`, `decisions/*.dmn` or a markdown decision table.

---

## Phase 4 — Contracts and constraints, before any implementation

Everything structural gets defined and generated deterministically. Nothing here is left to an agent's judgment.

| Artifact | Format | Derived from |
|---|---|---|
| API contract | OpenAPI 3.1 | Interaction + data inventory |
| Domain model | Entities, value objects, invariants | Data inventory + Phase 2 answers |
| DB schema & migration | Prisma / Atlas | Domain model, diff-based, human-gated |
| Event schema | AsyncAPI / CloudEvents | Notification and side-effect answers |
| State machine | XState | Transition inventory |
| Architecture rules | ArchUnit / Konsist tests | Context boundaries |
| Validation | JSON Schema | Domain model |

**Two non-negotiables:**

The **migration plan is human-reviewed**, always. It is the one artifact where a wrong generation is expensive and irreversible.

The **architecture rules ship as failing tests before implementation starts.** An agent that cannot import infrastructure into the domain layer will not, regardless of what it "understood" from the prompt. This is the difference between a constraint and a suggestion.

---

## Phase 5 — The handoff package

What actually reaches the agent:

```
├── glossary.md                 # ubiquitous language, this context only
├── spec.md                     # AC-1..n, EARS, non-goals, risk tags
├── features/*.feature          # Gherkin, tagged with AC IDs
├── contracts/openapi.yaml      # generated, authoritative
├── generated/                  # types, DTOs, stubs, validators — do not edit
├── migrations/                 # reviewed, approved
├── arch-tests/                 # ArchUnit rules, currently failing
└── prototype/                  # HTML @ commit abc123 — REFERENCE ONLY
```

**Mark the prototype non-authoritative for behaviour, explicitly, in the prompt.** Prototypes contain lorem ipsum, arbitrary spacing, placeholder counts, and dead links. An agent cannot distinguish "this is the design" from "this is filler," and will faithfully implement a hardcoded list of three fake users if you let it. The spec is authoritative; the prototype is visual reference for layout and nothing else.

---

## Phase 6 — Close the loop back to the prototype

The prototype stops being a discarded artifact and becomes a test fixture.

- **Visual regression** (Playwright screenshots) against the prototype for the components that should match.
- **DOM structure comparison** for layout-critical views.
- Divergence here is either a bug or a design change — and either way it should be a conversation with Parker, triggered mechanically rather than noticed in a demo six weeks later.

---

## The gate

An agent does not start until every line is true:

- [ ] Glossary exists for this bounded context
- [ ] Every user story has EARS acceptance criteria with stable IDs
- [ ] Every Phase 2 question is answered or explicitly deferred with a named owner
- [ ] Non-goals are written down
- [ ] API contract exists and is generated, not hand-written
- [ ] Domain model and invariants are stated
- [ ] Migration plan is human-reviewed
- [ ] Architecture rules exist as failing tests
- [ ] Prototype is pinned to a commit SHA and marked non-authoritative

Nine checkboxes. If you cannot tick them, the work is not ready — and "we'll figure it out while building" was survivable when a human held the intent in their head throughout. It is not survivable when the builder has no memory and no stake.

---

## On the cost

A day and a half of specification before a line of code feels expensive with a two-person team.

The comparison that matters is not "a day and a half versus zero." It is "a day and a half now versus the same work later, done in review comments, at a worse moment, against code that already exists and has to be argued with." Front-loading is not overhead; it is the same cost paid where it is cheapest.

The honest exception: for genuinely exploratory work where nobody knows the acceptance criteria until something has been built and looked at, skip all of this and build a throwaway. Then spec it properly and rebuild. Do not pretend the throwaway was the feature.

---

## Mapping to AEOS

This procedure is the concrete form of the `PRODUCT_SCOPING` → `TECH_SPEC` columns, and building it manually for StandIn first is the right sequence — it gives you a real corpus for the Q3 evaluation harness and a real test of whether human-authored scoping is workable before you automate it.

Four new Claude Code skills to write, none of which exist today: `prototype-harvest` (Phase 1), `gap-interrogation` (Phase 2), `spec-writer` (Phase 3 — extends your existing `user-story-writer` and `agile-task-writer`), `contract-generator` (Phase 4). Phase 2 is the one to leave human longest — it is where the product decisions actually live.
