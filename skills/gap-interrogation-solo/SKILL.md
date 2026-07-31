---
name: gap-interrogation-solo
description: Run a simulated gap-interrogation workshop for a founder working alone. Spins up facilitator and adversary persona agents that interrogate every absence and conflict in a harvested feature inventory, so a single person gets the challenge a second participant would provide. Use when the user has a feature-inventory.yaml and no one to run the session with, or says they are working through gaps solo, need a sounding board, want to be challenged on a spec, or ask to "run the interrogation" alone. Produces decisions.yaml. This skill interrogates and records — the human always decides. Do NOT use it to write acceptance criteria or propose implementations.
allowed-tools: Read, Write, Glob, Grep, Skill, Task, AskUserQuestion
---

# Gap Interrogation — Solo

Phase 2 of prototype-to-spec, for one person.

Example Mapping's value is the third seat — the participant whose only job is asking what breaks. A founder working alone cannot hold advocate and adversary simultaneously; they unconsciously defend their own framing. This skill supplies the missing seat as persona agents.

**Output contract:** `decisions.yaml` with `mode: solo-simulated`, identical in structure to `gap-interrogation-capture`. Downstream spec writing does not care which produced it.

---

## The one rule

**The personas interrogate. The human decides.**

No persona classifies an absence. No persona proposes an implementation. They ask what breaks, and the founder answers.

When the user says "just pick one," state the options and what each costs, then ask again. If they still decline, record `ASSUMED` with `decided_by: agent` and a `revisit_when` trigger — **never** `DECIDED`. A decision made by the system that will implement it is the oracle inside the loop.

---

## Session Configuration

Use AskUserQuestion:

```yaml
# Question 1: Depth
question: "How thorough should this session be?"
header: "Mode"
options:
  - label: "Full (Recommended)"
    description: "All 3 adversaries per absence, blocking + high (~12K tokens)"
  - label: "Quick"
    description: "Facilitator only, blocking absences (~3K tokens)"
  - label: "Focused"
    description: "One adversary on one category — pick next"
  - label: "Questions + Conflicts"
    description: "Rounds 0 and 1 only, skip absence work"

# Question 2: Decision posture
question: "How should unresolved items be recorded?"
header: "Posture"
options:
  - label: "Conservative (Recommended)"
    description: "Non-obvious blocking absences → ASSUMED pending co-founder review"
  - label: "Decisive"
    description: "Record my calls as DECIDED; I own them"
```

**Conservative is the default for a reason.** A blocking absence resolved alone, without the challenge a second person provides, is a guess with good posture. Recording it as an assumption pending review costs nothing and catches the ones that were wrong.

---

## Personas

Three adversaries, each owning specific absence-checklist categories, so coverage is provable rather than felt. Plus a facilitator who runs process and never contributes domain opinion.

| Persona | Owns | Asks |
|---|---|---|
| **The Operator** | error, loading, concurrency, notification, offline | "What does this look like at 3am when it's broken?" |
| **The Gatekeeper** | permission, lifecycle, undo | "Who's allowed, and can we take it back?" |
| **The Edge** | empty state, boundary/scale, time, accessibility | "What happens at zero, at ten thousand, and across a timezone?" |
| **The Facilitator** | process only | "Decided, deferred, assumed, or escalated?" |

Full persona prompts in `references/personas.md`.

Every absence-checklist category maps to exactly one adversary. If a category has no findings and no persona raised it, that is a coverage failure — report it.

---

## Process

### Step 0: Locate the artefact tree

All specification artefacts live in a **separate git tree** from the code. Resolve its root before doing anything else — env `AEOS_ARTEFACT_TREE`, then project config, then a sibling `*-specs` directory, then **ask**. Never fall back to the working directory, and never write specification artefacts into the code repo.

Record artefact-tree `HEAD` now; you will need it to detect concurrent writes before committing. See `references/artefact-tree.md`.

### Step 1: Assumption register

Read `assumption-register.yaml` from the artefact tree. Evaluate each open assumption's `revisit_when` trigger against the codebase and current inventory. **Report any that have fired** before starting. This is the only moment anyone reliably looks at them.

### Step 2: Agenda

Read `<artefact-tree>/features/<feature>/feature-inventory.yaml`:

- Filter conflicts to `requires_human: true` — precedence resolved the rest, do not re-open
- Sort absences by severity within each story
- **Over 15 blocking absences on one story means it is too big** — say so before starting
- Flag `UNMAPPED` glossary terms
- Flag stories blocked by unresolved conflicts

Present the agenda. Do not proceed until the user confirms.

### Step 3: Round 0 — questions

Questions are not product decisions. They are unknowns about the sources, and they come first because answering one frequently **promotes** it into a conflict or an absence that then needs working in the same session. Several also carry `blocks`, so leaving them open stalls later rounds.

**Research before asking.** Unlike absences and conflicts, many questions are factual — "is `wrapIngest` dead code or the live path?" is settled by Grep, not by judgment. For every question marked `researchable: true`, attempt to answer it from the codebase and sources first, then present findings. Finding a fact is not deciding, so this does not violate the one rule.

Per question, present the research finding if any, then:

| Outcome | Meaning |
|---|---|
| **ANSWERED** | Someone knew, or research settled it — record `answered_by` |
| **RECLASSIFIED** | It was a conflict or absence all along — create the item and work it this session |
| **ESCALATED** | Nobody present knows — owner and date |
| **DROPPED** | Based on a misreading — reason required, feeds harvest feedback |

**Timebox: 5 minutes for the whole set, 30 seconds per question.** If a question takes longer than that, it is not a question — it is an absence or a conflict wearing a question's clothes. Reclassify it and move on rather than debating it here.

Every RECLASSIFIED question must produce a new `CON-n` or `ABS-n` that is itself resolved before the session ends. An orphaned reclassification is worse than an open question, because it looks handled.

### Step 4: Round 1 — conflicts

Facilitator only; adversaries are not needed here. Per conflict, present every source's position and the computed `default_resolution`, then ask:

> **"Does precedence get this right?"**

Record `RESOLVED`, `RECONCILED`, `SPLIT`, or `ESCALATED`.

**Every RESOLVED and RECONCILED requires `debt_created`** — the renames, migrations or rewrites implied, each with an owner. Do not close the item without it.

When positions describe things that behave differently, always ask: *"Are these actually two different concepts?"* SPLIT is the highest-value outcome available and it is easy to miss.

### Step 5: Round 2 — absences

Per absence, in `full` mode:

1. **Facilitator** states the absence and asks: *"What happens?"*
2. User answers.
3. **Dispatch the owning adversary** via Task. It returns 2–4 specific failure questions — never generic, never a proposed solution.
4. Present them. User responds.
5. **Facilitator** asks: *"Decided, deferred, assumed, or escalated?"*
6. Record, with the required follow-up for that outcome.

In `quick` mode, skip the adversary dispatch — facilitator questions only, blocking absences only.

**Dispatch adversaries in parallel** where several absences share an owner. One Task call returning questions for five concurrency absences beats five calls.

**Required follow-ups:**

| Outcome | Must capture |
|---|---|
| DECIDED | One-sentence statement |
| DEFERRED | Confirmation it is explicitly out of scope |
| ASSUMED | `rationale`, `revisit_when`, `risk` |
| ESCALATED | `owner`, `due` |

### Step 6: Coverage sweep

Before writing output, verify every absence-checklist category was either raised by its owning adversary or explicitly marked `none-found` in the inventory. Untouched `normal` absences become `ASSUMED` with a one-line note — never silently dropped.

### Step 7: Write and validate

Write `<artefact-tree>/features/<feature>/decisions.yaml` per `<artefact-tree>/schemas/decisions.schema.json`, validating before commit, then append every ASSUMED entry to `<artefact-tree>/assumption-register.yaml`. Commit both in one atomic change:

```
decide(<feature>): 2 conflicts resolved, 14 absences closed (simulated)

Inventory: <artefact-tree sha>
Refs: CON-3, ABS-1, ABS-4
```

If artefact-tree `HEAD` moved since Step 0, re-read and merge. Commit; never push.

- [ ] `meta.mode: solo-simulated`
- [ ] Every question has an outcome
- [ ] Every RECLASSIFIED question's new CON/ABS is present **and resolved**
- [ ] Every ANSWERED question records `answered_by`
- [ ] Every DROPPED question records a reason
- [ ] Every `requires_human` conflict has an outcome
- [ ] Every RESOLVED/RECONCILED has `debt_created` with owners
- [ ] Every blocking and high absence has an outcome
- [ ] Every ASSUMED has an observable `revisit_when`
- [ ] Every ESCALATED has an owner and date
- [ ] Under conservative posture, non-obvious blocking absences are ASSUMED, not DECIDED
- [ ] No entry describes an implementation
- [ ] Every checklist category was covered or explicitly excluded

### Step 8: Report

- Questions answered by research, and which ones reclassified
- Conflicts resolved and the debt each created
- Decisions made, and which are held as assumptions pending review
- Open escalations with owners
- Existing assumptions whose triggers fired
- Stories ready for spec writing, blocked, or shown to be too big
- **Coverage gaps** — categories no adversary raised

---

## Enforcement

Block these actively:

| Pattern | Response |
|---|---|
| User proposes an implementation | "That's how — what should *happen*?" |
| Persona proposes a solution | Discard and re-dispatch. Adversaries ask, never answer. |
| Item passed without classification | Ask again. Do not advance. |
| ASSUMED with no observable trigger | "What would tell us this was wrong? 'If users are unhappy' isn't observable." |
| RESOLVED with no `debt_created` | "What does this oblige someone to change?" |
| Zero assumptions across a whole story | Say so. Solo sessions with no assumptions almost always rubber-stamped guesses. |

---

## What this skill does NOT do

- Decide anything
- Write acceptance criteria
- Propose implementations
- Replace a real session — it supplies challenge, not domain knowledge
- Re-open conflicts that precedence settled

---

## Tips for Best Results

- **Run `stakeholder-simulator` first for unfamiliar domains.** It covers commercial and organisational angles these three personas deliberately skip.
- **The adversaries catch structural gaps, not domain ones.** They will ask about concurrency; they will not know that your users habitually paste 400-line updates. Only a second founder catches that.
- **Conservative posture is not timidity.** An assumption with a revisit trigger is strictly more useful than a decision nobody will re-examine.
- **If a persona's questions feel generic, the absence description is too thin.** Go back to the inventory rather than accepting weak interrogation.
- **This is a rehearsal, not a substitute.** When the co-founder is available, run the real session — and use `gap-interrogation-capture` on its notes.
