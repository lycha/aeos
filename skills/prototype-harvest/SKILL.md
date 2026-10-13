---
name: prototype-harvest
description: Extract a structured specification inventory from a design handoff and every other source that describes the same feature — PRD, user stories, HTML/Figma prototype, existing codebase, conventions files. Produces screens, states, interactions, data fields, transitions, and critically what the sources CONFLICT about and what they all leave MISSING. Use this skill whenever the user hands over a prototype, mockup, design handoff, PRD, or story set and wants to turn it into specs, requirements, acceptance criteria, or tickets. Trigger on phrasing like "here's the prototype", "designs are ready", "Parker sent the handoff", "break this design down", "what do we need to build this", or when a design artifact appears alongside user stories or a PRD. Do NOT use this skill to generate components or code from designs — this skill produces a specification inventory, never implementation.
---

# Prototype Harvest

Turn a feature's source material into a machine-readable specification inventory that a human can review in ten minutes, and that feeds requirements writing, contract definition, and agent handoff.

A prototype is two things at once: **an under-extracted specification** (it already encodes screens, states, data shape and transitions that teams routinely throw away and re-derive) and **a dangerous illusion of completeness** (it shows the happy path for one role at one moment, and says nothing about conflict, permissions, failure or staleness).

And a prototype is rarely alone. A PRD, a story set, the existing codebase, and a conventions file usually describe the same feature — **differently**. That produces a second class of finding entirely.

**Two kinds of finding, and they fail differently:**

| | Meaning | Failure mode |
|---|---|---|
| **Absence** | Nobody decided | The agent invents it |
| **Conflict** | Somebody decided, twice, incompatibly | Downstream artefacts **fork** |

Conflicts come first in the output and first in resolution, because an unresolved vocabulary conflict makes half the absence descriptions ambiguous.

---

## Guiding Principles

- **Extract, never infer** — Every entry traces to something observable in a source. Anything you worked out goes in `questions`, not the inventory.
- **Absence and conflict are both first-class** — What nobody said, and what two sources said differently, are the two things an agent cannot resolve alone.
- **Precedence resolves most conflicts without a human** — Declare source authority once; compute the default resolution; escalate only what precedence cannot settle.
- **Filler is flagged, not implemented** — Lorem ipsum, three hardcoded users, placeholder counts.
- **Vocabulary drift surfaces immediately** — Every label maps to a glossary term or is marked `UNMAPPED`. Every cross-source naming disagreement is a blocking conflict.
- **The inventory is the review surface** — A human reviews this file, not the sources. Optimise for reading.
- **This skill produces no code** — Not components, not JSX, not CSS. Output is YAML.

---

## Process

### Step 0: Locate the artefact tree

All specification artefacts live in a **separate git tree** from the code. Resolve its root before doing anything else — env `AEOS_ARTEFACT_TREE`, then project config, then a sibling `*-specs` directory, then **ask**. Never fall back to the working directory, and never write specification artefacts into the code repo.

Record artefact-tree `HEAD` now; you will need it to detect concurrent writes before committing. See `references/artefact-tree.md`.

### Step 1: Locate and pin every source

Find everything that describes this feature. Expect four or five, not one:

| Kind | Typical location |
|---|---|
| `prd` | product docs |
| `stories` | CSV, tracker export, backlog |
| `prototype` | HTML export or Figma file |
| `codebase` | existing modules for adjacent features |
| `conventions` | `CLAUDE.md`, coding standards, glossary |

Sources routinely live in three or four different trees — design, code, artefacts. **A bare commit hash is meaningless without its repository**, so every source is recorded as a triple: `repo`, `commit`, `path`.

```bash
git -C <repo> rev-parse HEAD
```

A spec derived from an unpinned source drifts silently when someone pushes again. If a source is not in git, record a file hash instead and say so.

Note `version_note` where a source announces its own lineage ("rewrite of the earlier wrap set"). That single field resolves a surprising number of conflicts later.

If the prototype comes from Figma, prefer the node tree to rendered markup — component names, variants and auto-layout carry semantics that divs do not.

### Step 2: Declare source precedence

Read `meta.source_precedence` from project config. If none exists, propose one and **ask the user to confirm before proceeding** — this ordering determines how every conflict resolves, and guessing it silently is worse than pausing.

Typical ordering, highest authority first: conventions → codebase → prototype → stories → PRD.

### Step 3: Check for a glossary

Look for `glossary.md` in the bounded context. If none exists, proceed but flag it: every `data.glossary_term` returns `UNMAPPED`, and vocabulary drift is among the most expensive defects to fix late.

### Step 4: Reconcile across sources

Work through `reference/conflict-checklist.md` in full — vocabulary, behaviour, scope, data shape, state model, permissions, staleness.

For each conflict found:
- Record **every** source's position, not just the two that clash
- State `why_it_matters` in terms of what forks downstream
- Compute `default_resolution` from precedence
- Set `requires_human: true` when precedence is silent, the winning source looks stale, resolution creates work someone must own, or resolution changes behaviour rather than naming

**Vocabulary conflicts are `blocking` by default.** Check the prototype's identifiers separately from its copy — designers rename copy long before anyone renames code, and the gap between `onWrapDropZone` and "Add to brief →" is exactly the kind of thing that forks an API contract.

### Step 5: Extract the inventory

Populate each section of `reference/inventory-schema.yaml`. Tag every entry with the `source` it came from.

| Section | What to capture |
|---|---|
| `screens` | Every distinct view |
| `states` | Every distinct state present in a source |
| `interactions` | Every control, its label, apparent action, destination |
| `data` | Every field displayed or edited — candidate entity attributes |
| `transitions` | The state machine the sources imply |
| `filler` | Placeholder content that must not be implemented |

Mark every entry `confidence: observed` or `confidence: implied`. Observed means it is literally in the source. Implied means you reasoned about it — implied entries are review targets, not facts.

### Step 6: Run the absence checklist

Work through `reference/absence-checklist.md` in full. Do not skip categories because they seem irrelevant — the ones that seem irrelevant produce production incidents.

Every gap becomes an `absences` entry with a category and severity. Every gap you cannot even frame becomes a `questions` entry.

**This step is not optional and not abbreviated.** An inventory with a thin `absences` section is a failed harvest, not a clean set of sources.

### Step 7: Validate

- [ ] Every source in `meta.sources` has a commit SHA or a stated reason it has none
- [ ] `meta.source_precedence` is set and confirmed, not guessed
- [ ] Every `conflicts` entry lists a position for every source that has one
- [ ] Every `conflicts` entry has `default_resolution` and `requires_human`
- [ ] Every `screens` entry has at least one `states` entry
- [ ] Every entry has a `source` and an `evidence` field
- [ ] Every `data` entry has a `glossary_term` or explicit `UNMAPPED`
- [ ] Every absence-checklist category is populated or marked `none-found` with a reason
- [ ] No entry contains invented business rules — if it reads like a rule, it belongs in `questions`
- [ ] `filler` is populated (zero placeholder content is suspicious — look again)

### Step 8: Report

Write `feature-inventory.yaml`, then summarise in chat, **in this order**:

1. **Blocking conflicts**, stated plainly — what forks if they stay unresolved
2. Which conflicts precedence resolves automatically, and which need a human
3. **The three highest-severity absences**
4. Any `UNMAPPED` vocabulary
5. Counts per section
6. What the gap-interrogation session needs a human to decide

Lead with conflicts, then absences. The extracted inventory is the cheap half; the disagreements and the gaps are what the human is being asked to look at.

---

## Output

A single file, `feature-inventory.yaml`, conforming to `reference/inventory-schema.yaml`.

Written to the **artefact tree** at `features/<feature>/feature-inventory.yaml`, then committed:

```
harvest(<feature>): inventory from 4 sources, 9 conflicts, 23 absences

Sources: standin-design@abc123, standin@def456
Refs: CON-1..CON-9
```

If artefact-tree `HEAD` moved since Step 0, re-read and merge before committing. Commit; never push.

---

## What this skill does NOT do

- Generate components, markup or styles
- Write acceptance criteria (downstream, in spec writing)
- **Resolve conflicts that need a human** — it computes what precedence implies and flags the rest
- Answer the questions it raises
- Judge the design
- Guess at business rules no source states

If asked to do any of these, produce the inventory first and say what is unresolved before proceeding.

---

## Tips for Best Results

- **Check identifiers separately from copy.** A prototype routinely carries two vocabularies — the one users see and the one the code uses. The gap between them is a blocking conflict hiding in plain sight.
- **A PRD is usually the oldest source in the room.** Treat its vocabulary as suspect until confirmed against the conventions file.
- **`version_note` earns its keep.** "Rewrite of the earlier X set" converts an apparent conflict into a straightforward staleness finding.
- **Empty states are the richest source of absence** — a populated list and nothing else hides the zero case, the one-item case and the ten-thousand-item case.
- **Every disabled control is a rule you do not have** — the condition that greys it is a business rule no source states.
- **Every count, badge and timestamp is a data question** — "3 unread" implies a read model; "2 hours ago" implies a timezone decision.
- **Roles are almost never drawn.** Prototypes are made for the most privileged user. Assume permissions are entirely unspecified until proven otherwise.
- **For async or collaborative products, add the returning-user question by default** — what does someone see coming back after twelve hours, and what is marked as changed? Prototypes show a moment; async products live in the gaps between moments.
