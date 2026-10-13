---
name: artefact-tree-init
description: Initialise a project's artefact tree and seed the canonical schemas into it. Use once per project before running prototype-harvest, gap-interrogation-capture, or spec-writer, or whenever those skills report that `<artefact-tree>/schemas/` is missing or out of date. Trigger on "set up the artefact tree", "seed the schemas", "schemas are missing", or a new project adopting the pipeline. This skill only scaffolds structure and copies schemas; it never authors specification content.
allowed-tools: Read, Write, Bash, Glob, Grep, AskUserQuestion
---

# Artefact Tree Init

The other three skills in this plugin (`prototype-harvest`, `gap-interrogation-capture`,
`spec-writer`) read and write specification artefacts that are validated against JSON Schemas and
a cross-file linter. Those schemas are **owned by this plugin**, not by any one skill, so they
travel with it. This skill puts a **seeded copy** into the project so the non-agent consumers can
reach it: `lint_decisions.py` (run from the tree), CI, and editor `$schema` validation.

Run it once per project, and again after upgrading the plugin.

---

## The one rule

**Seed structure and schemas. Never author content.** This skill creates directories, copies the
schemas, and writes an empty assumption register if one is missing. It writes no `feature-inventory.yaml`,
no `decisions.yaml`, and no `spec.md`. Those are the other skills' jobs, and they require human input.

---

## Process

### Step 1: Resolve the artefact-tree root

Specification artefacts live in a tree that may be a separate git repository from the code, or an
in-repo directory. Resolve the root in this order and never guess:

1. `$AEOS_ARTEFACT_TREE`
2. Project config that names it
3. A sibling `*-specs` directory
4. An existing in-repo `docs/artefact-tree/`
5. **Ask.** Offer `docs/artefact-tree` as the in-repo default.

See `../spec-writer/references/artefact-tree.md` for the resolution rationale shared across the
pipeline.

### Step 2: Seed the schemas

Run the seed script, passing the resolved root:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/seed-schemas.mjs" --tree <artefact-tree-root>
```

It copies `decisions.schema.json`, `feature-inventory.schema.json`,
`assumption-register.schema.json`, and `lint_decisions.py` into `<root>/schemas/`, and writes a
`<root>/schemas/.source` stamp (plugin version + a sha256 over the schema set). It is idempotent:

- stamp matches the shipped schemas → prints "up to date" and exits 0,
- no stamp → seeds,
- stamp present but diverged → refuses and reports, unless you pass `--force` (use only when the
  plugin copy is authoritative; the project must never hand-edit the seeded schemas).

### Step 3: Scaffold the directories

Create, if absent, under the resolved root:

- `features/` — one subdirectory per feature (`feature-inventory.yaml`, `decisions.yaml`, `spec.md`, `features/*.feature`)
- `contexts/` — one subdirectory per bounded context (`glossary.md`, `CONSTRAINTS.md`)
- `assumption-register.yaml` — if missing, write an empty register that validates against
  `schemas/assumption-register.schema.json` (meta + an empty list), with a header comment noting it
  is empty by design.

### Step 4: Wire editor validation (optional, recommended)

Tell the user they can get free in-editor validation by making the first line of each artefact:

```yaml
# yaml-language-server: $schema=../../schemas/decisions.schema.json
```

(path adjusted per artefact type and depth).

### Step 5: Report

State the resolved root, whether schemas were seeded or already current (with the short hash and
version), which directories were created, and the single next step: run `prototype-harvest` on the
design handoff.

---

## Keeping schemas current (for CI)

Add a check that fails when a project's seeded schemas fall behind the plugin:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/seed-schemas.mjs" --tree <root> --check
```

Exit 0 when current, non-zero when unseeded or diverged.

---

## What this skill does NOT do

- Author any specification content (inventories, decisions, specs)
- Edit the schemas in the tree (they are a seeded copy; edit them in the plugin and re-seed)
- Push commits
