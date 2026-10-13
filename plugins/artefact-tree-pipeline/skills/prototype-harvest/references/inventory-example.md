# Feature inventory: worked example and field semantics

The **shape** of `feature-inventory.yaml` is defined by one authority: the JSON Schema at
`<artefact-tree>/schemas/feature-inventory.schema.json` (seeded by `artefact-tree-init`, owned by
this plugin). Validate against it; do not treat this file as the schema. This page is judgment and
illustration, the schema is shape. Keeping the two separate is deliberate: two skills consume this
inventory, and a second hand-maintained copy of the shape would drift from the first.

## Field semantics

Every entry carries two fields that the schema requires but cannot interpret for you:

- `evidence` — where in the source it came from: a CSS selector, a Figma node id, or a `file:line`.
  No entry is admissible without it. "Extract, never infer."
- `confidence` — `observed` (literally in the markup) or `implied` (you reasoned about it). Implied
  entries are review targets, not facts, and the gap-interrogation workshop looks at them first.

`meta.source.commit` must be a real full SHA, never a placeholder. A spec derived from an unpinned
prototype drifts silently when the designer pushes again.

## Worked example

```yaml
# yaml-language-server: $schema=../../schemas/feature-inventory.schema.json
meta:
  feature: shared-standup-notes        # short slug
  context: standup                     # bounded context
  source:
    kind: html                         # html | figma
    repo: standin-design
    commit: 4f9c1a2b7d3e5f60a1b2c3d4e5f60718293a4b5c   # REQUIRED full SHA
    files: [standup-standalone.html]
  glossary: contexts/standup/glossary.md   # or null if absent
  harvested_at: 2026-07-29T10:15:00Z

screens:
  - id: SCR-1                          # stable, referenced everywhere else
    name: Team standup
    purpose: One line, what this view is for
    evidence: "#standup-root"

states:
  - id: SCR-1-S1
    screen: SCR-1
    kind: empty                        # default | empty | loading | error | success | partial | disabled
    description: No notes posted yet today
    evidence: ".empty-state"
    confidence: observed

interactions:
  - id: INT-1
    screen: SCR-1
    control: button                    # button | link | form | input | drag | menu | other
    label: "Post update"               # visible text, verbatim
    action: Appends the author's note to today's list   # descriptive, not prescriptive
    destination: SCR-1                 # SCR-n | external | unknown
    evidence: "button.post"

data:
  - id: DAT-1
    field: author
    screen: SCR-1
    glossary_term: member              # or UNMAPPED
    evidence: ".note .author"
    confidence: observed

transitions:
  - from: SCR-1-S1
    to: SCR-1-S2
    trigger: INT-1
    confidence: implied                # the prototype shows both states but not the move

filler:
  - what: Three hardcoded member names
    where: ".note .author"
    note: Do not implement; placeholder content

absences:
  - id: ABS-1
    category: permissions              # from references/absence-checklist.md
    severity: high                     # low | medium | high | blocking
    description: Who may delete another member's note is not shown
    evidence: No delete control appears for any note

questions:
  - id: Q-1
    about: Returning-user view
    text: What does a member see coming back after twelve hours, and what is marked changed?
    researchable: false
```

The `absences` and `questions` sections are the point of the exercise. A populated `screens` list
with a thin `absences` list is a failed harvest, not a clean prototype.
