# Gap Interrogation — Session Runbook

**Phase 2 of the prototype-to-spec playbook.** The session where absences become decisions.

**Timebox:** 5 min questions, 15 min conflicts, then 20 minutes per story. **People:** two minimum. **Output:** `decisions.yaml`.

---

## What this session is and isn't

The harvester has already enumerated two things: where the sources **disagree** (conflicts) and what none of them **say** (absences). You are not discovering these — you are **triaging and deciding** them. That makes this much faster than a blank-page Example Mapping session, and it means the failure mode is different: the risk is not missing things, it's rushing the decisions.

Questions come first, then conflicts, then story work. Questions are unknowns about the *sources* rather than product decisions — and answering one often promotes it into a conflict or an absence that then needs working in the same session, so leaving them for later reopens rounds you thought were closed.

Conflicts are resolved before any story work. This is an ordering constraint rather than a preference — an unresolved vocabulary conflict makes half the absence descriptions ambiguous, and you will re-litigate every one of them after the rename.

**This session decides *what*, never *how*.** The moment someone says "we could store that in a separate table," stop. Implementation is downstream and it is not your problem right now.

---

## Before the session (15 minutes, solo)

**Facilitator prep:**

1. Read `feature-inventory.yaml` — `questions` first, then `conflicts`, then `absences`.
   Pre-research every question marked `researchable: true` before the session; most will already have answers.
2. Filter conflicts to `requires_human: true`. Precedence has already resolved the rest; do not re-open them.
3. Sort absences by severity: `blocking` first, then `high`, then `normal`.
4. Count them. **Over 15 blocking absences means the story is too big** — split it before the session rather than discovering it 20 minutes in.
5. Flag any absence you can decide unilaterally (there are usually two or three that are obvious). Pre-decide them and mark for confirmation, not discussion.
6. Check `data[].glossary_term` for `UNMAPPED` entries. Vocabulary drift is a five-minute conversation now and a three-week refactor later.

**Everyone reads the inventory beforehand.** Reading it in the room burns half the timebox.

---

## Roles

With two founders you're missing the third seat. Example Mapping assumes three perspectives — the one who wants it built, the one who builds it, and **the one whose job is to break it**. That third voice is the entire value of the format, and with two people it disappears unless you make it explicit.

| Role | Who | Job |
|---|---|---|
| **Facilitator** | Whoever prepped | Keeps time, forces classification, blocks solutioning |
| **Advocate** | Usually the designer | Explains intent, what the user is trying to do |
| **Adversary** | **Rotates every story** | Only asks what breaks. Never defends anything. |

The adversary role is non-optional and it must rotate. If the same person always plays it, it becomes their personality rather than a function, and the other person stops engaging with it.

**If you're alone:** run `stakeholder-simulator` against the absence list before deciding. It won't replace the conversation, but it catches the categories a single perspective skips.

---

## The session

### Round 0 — questions, 5 minutes total

Fast. Most are settled by someone who knows the codebase, or by a quick grep.

| Outcome | Meaning |
|---|---|
| **ANSWERED** | Someone knew, or research settled it |
| **RECLASSIFIED** | It was a conflict or absence all along — create it, work it this session |
| **ESCALATED** | Nobody present knows |
| **DROPPED** | Based on a misreading — record the reason |

**30 seconds per question.** Anything slower is not a question; it is an absence or conflict in disguise. Reclassify and move on rather than debating it here — that debate belongs in the round built for it.

Every RECLASSIFIED question must produce a new item that is itself resolved before the session ends. An orphaned reclassification looks handled and isn't.

### Round 1 — conflicts, 15 minutes total

Not per story. Once, at the top, for the whole feature.

Work only the conflicts marked `requires_human: true`, blocking first. For each, the facilitator reads the positions aloud and the `default_resolution` that precedence computed, then asks:

> **"Does precedence get this right?"**

Most of the time it does, and the answer takes ten seconds. Where it doesn't, classify:

| Outcome | Meaning | Consequence |
|---|---|---|
| **RESOLVED** | One source wins | Retire the losing vocabulary or behaviour everywhere |
| **RECONCILED** | Neither was right | New answer, written down as the canonical one |
| **SPLIT** | Both are right | They were two concepts wearing one name — name both |
| **ESCALATED** | Needs someone not here | Named owner, dated |

**SPLIT is the outcome worth slowing down for.** An apparent vocabulary clash sometimes reveals that you have been conflating two genuinely distinct concepts, and discovering that at spec time is worth more than the rest of the session combined.

**Every resolution creates work.** Retiring a vocabulary means renaming modules, routes and tables; superseding a PRD means rewriting it before it can be used as a spec source. Record it as `debt_created` with an owner, or it silently doesn't happen and the conflict returns next feature.

**Hard stop at 15 minutes.** Unresolved conflicts become ESCALATED, and any story they block does not proceed to Round 2. Building on an unresolved blocking conflict guarantees rework.

### Round 2 — per story, 20 minutes

**Minutes 0–2 — Frame**
Read the story aloud. State the non-goals you already know. Confirm the pre-decided absences in one pass — no discussion unless someone objects.

**Minutes 2–15 — Work the absences, blocking first**

For each absence, the facilitator asks exactly two questions:

> **"What happens?"** — the advocate answers.
> **"What if it doesn't?"** — the adversary answers.

Then classify. Every absence resolves to exactly one of four outcomes, and it must be spoken aloud before moving on:

| Outcome | Meaning | Becomes |
|---|---|---|
| **DECIDED** | We know the behaviour | An acceptance criterion |
| **DEFERRED** | Explicitly out of scope | A written non-goal |
| **ASSUMED** | We're guessing, and we know it | An entry in the assumption register |
| **ESCALATED** | Needs someone or something not here | A blocker with a named owner and a date |

**ASSUMED is a legitimate answer and you should expect several.** The point is not to decide everything — it is to make every guess visible. An unrecorded assumption is the same defect as an unnoticed gap, just harder to find later.

**Minutes 15–18 — Sweep**
Any `normal` severity absences still untouched become ASSUMED by default, with a one-line note. Do not skip this — silent absences are what agents hallucinate into.

**Minutes 18–20 — Record**
Facilitator reads back every ESCALATED item with its owner. If an escalation has no name attached, it isn't an escalation, it's a wish.

---

## Hard stops

**The timebox is not advisory.** When 20 minutes elapse:

- **Story resolved** → move to the next one.
- **Story not resolved, but converging** → one 10-minute extension, once. Never twice.
- **Story not resolved and not converging** → **split the story.** Inability to resolve gaps within the box is the clearest available signal that the story is too large. This is a feature of the format, not a failure of the session.

**Disagreement on a rule:** do not resolve it in the room. Record both positions in `decisions.yaml`, mark ESCALATED, and move on. Two founders arguing a product rule for fifteen minutes is how a two-hour session becomes a four-hour one and nothing else gets covered.

---

## Output

`specs/<feature>/decisions.yaml`:

```yaml
feature: shared-standup-notes
session: 2026-07-29
participants: [kris, parker]
inventory: feature-inventory.yaml@abc123

conflict_resolutions:
  - conflict: CON-9
    outcome: RESOLVED
    resolution: >
      "brief" is canonical for the entity, in copy and in new code.
      CLAUDE.md precedence stands; PRD vocabulary is retired.
    debt_created:
      - task: Rename lib/wraps/, app/api/wraps/, app/app/wraps/ to briefs
        owner: kris
      - task: Rewrite PRD in current vocabulary before reuse as a spec source
        owner: parker
    affects_downstream: [api-contract, table-names, event-names, ui-copy]

decisions:
  - absence: ABS-4
    outcome: DECIDED
    resolution: >
      Relative timestamps render in viewer local time. Flip to absolute
      after 7 days. Team-canonical timezone governs day boundaries for
      digest grouping only.
    becomes: AC-12

  - absence: ABS-5
    outcome: ASSUMED
    resolution: >
      Concurrent edit by author while viewer has digest open: last-write-wins,
      no conflict surface.
    rationale: No evidence users co-edit entries; cost of merge UI unjustified
    revisit_when: Any support ticket mentions lost edits, or >5 concurrent
                  editors observed on one digest
    risk: medium

  - absence: ABS-9
    outcome: DEFERRED
    resolution: Offline queueing out of scope for v1
    becomes: NON-GOAL-3

  - absence: ABS-11
    outcome: ESCALATED
    question: Does the digest need to respect per-workspace retention policy?
    owner: kris
    due: 2026-08-05
    blocks: [AC-15]

conflicts_resolved: [CON-9]
conflicts_escalated: []
assumptions_registered: [ABS-5]
escalations_open: [ABS-11]
debt_created: 2
```

**The assumption register persists across features.** Every ASSUMED entry carries a `revisit_when` trigger. Review the register at the start of each planning cycle — assumptions have a shelf life, and the ones nobody revisits are the ones that eventually cost you a weekend.

---

## Anti-patterns

- **Re-opening precedence.** If `default_resolution` looks wrong for a whole class of conflict, fix `source_precedence` at the project level afterwards — do not relitigate it conflict by conflict in the room.
- **Resolving a conflict without assigning the rename.** The decision is free; the refactor is not. An unowned `debt_created` entry means the conflict comes back next feature.
- **Solutioning.** "We could use a CRDT for that" is not an answer to "what happens when two people edit?" Facilitator kills it immediately.
- **Defending the prototype.** The designer will want to explain why the gap isn't really a gap. Sometimes true, usually not — and either way it's the adversary's call, not the author's.
- **Resolving everything.** A session with zero ASSUMED entries means you either had a genuinely complete spec or you rubber-stamped guesses as decisions. It's almost always the second.
- **Skipping the boring categories.** Accessibility and lifecycle feel like they can wait. They cannot — they're cheap now and structural later.
- **Running it async.** This is the one part of the process that needs synchronous conversation. The value is in the speed of "what if" → "oh, then—" → "no wait." Comment threads flatten that into nothing. Slightly awkward for a company building async collaboration tooling, but true.

---

## Definition of done

- [ ] Every question has an outcome
- [ ] Every RECLASSIFIED question's new item is present and resolved
- [ ] Every `requires_human` conflict has an outcome
- [ ] Every conflict resolution records `debt_created` with owners
- [ ] No story proceeded past a conflict blocking it
- [ ] Every `blocking` absence has an outcome
- [ ] Every `high` absence has an outcome
- [ ] Remaining absences are explicitly ASSUMED with a note
- [ ] Every ASSUMED entry has a `revisit_when` trigger
- [ ] Every ESCALATED entry has a named owner and a date
- [ ] Every `UNMAPPED` glossary term is resolved or escalated
- [ ] No entry in `decisions.yaml` describes an implementation

When this is done, the story is ready for spec writing. Not before.
