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

Every entry also names its `source`: the `SRC-n` id of the entry in `meta.sources` it came from.

A source is a triple, `repo`, `commit`, `path`: a bare commit hash means nothing without its
repository. `commit` must be a real SHA, never a placeholder, and is `null` only for a source that is
not in git, with the reason in `version_note`. A spec derived from an unpinned prototype drifts
silently when the designer pushes again. `meta.source_precedence` lists every source id, highest
authority first; it is what `default_resolution` of a conflict is computed from.

## Worked example

```yaml
# yaml-language-server: $schema=../../schemas/feature-inventory.schema.json
schema_version: 1

meta:
  feature: shared-standup-notes        # short slug
  context: standup                     # bounded context
  artefact_tree:                       # where this file lives
    repo: standin-aeos
    branch: main
  sources:                             # more than one source is the normal case
    - id: SRC-1
      kind: prd                        # prd | stories | prototype | codebase | conventions | api-contract
      repo: standin-docs
      commit: 9a8b7c6d5e4f30211203f4e5d6c7b8a9d0e1f2a3   # REQUIRED where the source is in git
      path: prd/standup-notes.md
      version_note: null
    - id: SRC-2
      kind: prototype
      repo: standin-design
      commit: 4f9c1a2b7d3e5f60a1b2c3d4e5f60718293a4b5c
      path: standup-standalone.html
      version_note: Rewrite of the earlier standup set
  source_precedence: [SRC-1, SRC-2]    # highest authority first; every id is in sources
  glossary: contexts/standup/glossary.md   # or null if absent
  harvested_at: 2026-07-29T10:15:00Z

conflicts:                             # listed first, resolved first
  - id: CON-1
    topic: Who may post an update
    kind: permission                   # vocabulary | behaviour | scope | data-shape | state | permission | stale
    severity: high                     # blocking | high | normal
    positions:                         # what each source says, one per source
      - source: SRC-1
        says: Only members of the team may post
      - source: SRC-2
        says: The post button is shown to every signed-in user
    why_it_matters: The API either checks team membership on post or it does not
    evidence: "SRC-1 prd/standup-notes.md:41; SRC-2 button.post"
    default_resolution: Only members of the team may post (SRC-1 outranks SRC-2)
    requires_human: false              # precedence settles it

screens:
  - id: SCR-1                          # stable, referenced everywhere else
    name: Team standup
    purpose: One line, what this view is for
    source: SRC-2                      # which source this came from
    evidence: "#standup-root"

states:
  - id: SCR-1-S1
    screen: SCR-1
    kind: empty                        # default | empty | loading | error | success | partial | disabled
    description: No notes posted yet today
    source: SRC-2
    evidence: ".empty-state"
    confidence: observed
  - id: SCR-1-S2
    screen: SCR-1
    kind: default
    description: Today's notes, newest first
    source: SRC-2
    evidence: ".note-list"
    confidence: observed

interactions:
  - id: INT-1
    screen: SCR-1
    control: button                    # button | link | form | input | drag | menu | other
    label: "Post update"               # visible text, verbatim
    action: Appends the author's note to today's list   # descriptive, not prescriptive
    destination: SCR-1                 # SCR-n | external | unknown
    enabled_when: not-observable
    source: SRC-2
    evidence: "button.post"
    confidence: observed

data:
  - id: DAT-1
    screen: SCR-1
    label: Author                      # as shown in the UI, verbatim
    glossary_term: member              # or UNMAPPED
    kind: display                      # display | input | both
    format: text                       # text | number | date | datetime | currency | count | enum | file | other
    sample_values: [Ada, Grace, Linus]
    source: SRC-2
    evidence: ".note .author"
    confidence: observed

transitions:
  - id: TRN-1
    from: SCR-1-S1
    to: SCR-1-S2
    trigger: INT-1
    source: SRC-2
    evidence: ".empty-state, .note-list"
    confidence: implied                # the prototype shows both states but not the move

filler:
  - id: FIL-1
    description: Three hardcoded member names; placeholder content, do not implement
    evidence: ".note .author"

absences:                              # every category of references/absence-checklist.md appears
  - id: ABS-1
    category: permission
    description: Who may delete another member's note is not shown
    affects: [SCR-1]
    severity: high                     # blocking | high | normal
  - id: ABS-2
    category: offline
    description: none-found            # the literal, with the reason it does not apply
    reason: The PRD states the feature is online-only
  # ... one entry or more for each remaining category

questions:
  - id: Q-1
    question: What does a member see coming back after twelve hours, and what is marked changed?
    context: Returning-user view; neither source shows it
    suspected: absence                 # conflict | absence | fact | unknown
    researchable: false
    blocks: [ABS-1]                    # optional: the findings it holds up
```

The `conflicts`, `absences` and `questions` sections are the point of the exercise. A populated
`screens` list with a thin `absences` list is a failed harvest, not a clean set of sources.
