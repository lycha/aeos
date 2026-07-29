# Artefact Schemas

Normative contracts for everything in the artefact tree. Lives at `<artefact-tree>/schemas/`.

**These are the single source of truth for structure.** Skills do not carry their own copies — they carry *semantics* guides explaining what the values mean, and validate against these.

```
<artefact-tree>/schemas/
├── feature-inventory.schema.json
├── decisions.schema.json
└── assumption-register.schema.json
```

---

## Why here and not in the skills

| Concern | Where | Why |
|---|---|---|
| **Structure** — fields, enums, required-ness | Artefact tree | Evolves with the artefacts it describes; needs the same version history; must be identical for every producer |
| **Semantics** — what ASSUMED means, what makes a good `revisit_when` | Skill `references/` | Facilitation guidance, not data |

Two skills produce `decisions.yaml`. A copy of the contract in each guarantees drift — the shape changed three times while it was being designed. One copy in the tree, versioned alongside the files it governs, cannot drift.

---

## Validation

YAML is a JSON superset, so JSON Schema validates it directly.

```bash
check-jsonschema --schemafile schemas/decisions.schema.json \
  features/*/decisions.yaml
```

Alternatives: `ajv-cli`, `yajsv`.

**Editor validation, free.** First line of every artefact:

```yaml
# yaml-language-server: $schema=../../schemas/decisions.schema.json
```

VS Code then shows errors as you type, with completion on enums.

**Pre-commit hook** in the artefact tree validates every changed artefact. A malformed `decisions.yaml` never lands, which converts several checklist items into mechanical checks — deterministic tooling deciding what it can decide, rather than an LLM reviewer being asked to notice a missing field.

---

## Constraints the schema enforces

Things previously left to a checklist, now unfalsifiable:

- `ASSUMED` requires `rationale`, `revisit_when`, `risk`, `decided_by`
- `revisit_when` has a minimum length — "TBD" fails
- `RESOLVED` / `RECONCILED` conflicts require at least one `debt_created` entry, each with an owner
- `SPLIT` requires at least two `split_into` concepts
- `ESCALATED` requires `owner` and `due`
- `RECLASSIFIED` questions require `reclassified_as` and `becomes`
- `DROPPED` questions require a `reason`
- **`decided_by: agent` forces `outcome: ASSUMED`** — the one rule, enforced by the schema rather than by the skill remembering it
- All references are `{repo, commit, path}` triples
- `workshop-captured` requires `source_artefact`; `solo-simulated` requires `posture`

What the schema *cannot* enforce, and stays a skill responsibility:

- Every `RECLASSIFIED` question's `becomes` ID actually resolves somewhere in the file
- Every `blocking` absence in the inventory appears here
- No `resolution` describes an implementation

Those need a linter walking both files together. Worth writing once the shape settles.

---

## Versioning

Every artefact carries `schema_version`.

- **Additive** (new optional field) — no bump
- **Breaking** (new required field, renamed field, narrowed enum) — bump `schema_version`, keep the old schema file, write a migration

Expect churn early. The shape moved three times during design and will move again once real sessions run against it — so make migration cheap rather than trying to get it right first.
