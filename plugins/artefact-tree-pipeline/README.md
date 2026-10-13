# artefact-tree-pipeline

A portable Claude Code plugin for the prototype-to-spec half of
[AI-Driven Development](https://github.com/lycha/aeos/wiki/AI-Driven-Development-A-Manifesto):
humans hold the workshop, deterministic schemas hold the shape, and the skills transcribe rather
than decide.

## What's in it

| Skill | Phase | Does |
|---|---|---|
| `artefact-tree-init` | setup | Resolves the artefact-tree root and seeds the canonical schemas into it |
| `prototype-harvest` | 1 | Extracts a design handoff into `feature-inventory.yaml` (screens, states, data, and, crucially, absences) |
| `gap-interrogation-capture` | 2 | Turns a real workshop's transcript/notes into `decisions.yaml` |
| `spec-writer` | 3 | Transcribes resolved decisions into `spec.md` (EARS) + `*.feature` (Gherkin) + invariants |

The canonical schemas live once, here, and travel with the plugin:

```
schemas/
  decisions.schema.json
  feature-inventory.schema.json
  assumption-register.schema.json
  lint_decisions.py          # cross-file invariants a JSON Schema can't see
scripts/
  seed-schemas.mjs           # copies the schemas into a project's artefact tree + stamps them
```

## Why the schemas are seeded, not referenced in place

The schemas must be reachable by consumers that are not agents: `lint_decisions.py` runs from the
tree, CI validates from the tree, and editors validate through a `# yaml-language-server: $schema=`
line that resolves relative to the artefact. So each project keeps a copy in
`<artefact-tree>/schemas/`.

To keep that copy from becoming a hand-maintained fork (the drift that happens when two skills each
carry their own copy of the shape), the plugin owns the one authored copy and `seed-schemas.mjs`
materialises it into the project. The seed writes a `<tree>/schemas/.source` stamp (plugin version +
a sha256 over the schema set), so a project copy that falls behind or diverges is detectable:

```bash
node scripts/seed-schemas.mjs --tree docs/artefact-tree           # seed or update
node scripts/seed-schemas.mjs --tree docs/artefact-tree --check   # CI: non-zero if stale/diverged
node scripts/seed-schemas.mjs --tree docs/artefact-tree --force   # overwrite a diverged copy
```

Destination resolution: `--tree`, then `$AEOS_ARTEFACT_TREE`, then `./docs/artefact-tree`.
When run inside the plugin runtime, `$CLAUDE_PLUGIN_ROOT` points at the schema source.

**Edit the schemas here, never in a project's tree.** The tree copy is generated; re-seed to update.

## Install

Local, for development or a single machine:

```
/plugin marketplace add /path/to/plugins/artefact-tree-pipeline
/plugin install artefact-tree-pipeline@artefact-tree-pipeline
```

Or lift this directory into its own git repository and add that as the marketplace. The plugin is
self-contained: nothing outside this directory is required.

## Use

1. `artefact-tree-init` once per project (seeds schemas, scaffolds `features/`, `contexts/`).
2. `prototype-harvest` on the design handoff → `feature-inventory.yaml`.
3. Hold the gap-interrogation workshop (human), then `gap-interrogation-capture` → `decisions.yaml`.
4. `spec-writer` on the resolved decisions → `spec.md` + `*.feature`.

Traceability runs end to end: `ABS-n → AC-n → INV-n → @AC-n in the .feature → test`.
