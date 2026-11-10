# Task: The Artefact Tree Inside `.aeos/`, and One Skill Set

**Milestone:** I1-M3 — Specify
**Plan package:** 3.1
**Agent:** typescript-pro
**Method:** Agentic implementation, test-first
**Size:** M
**Human-owned inputs:** none (decisions D1, D2)

## Context
The spec skills (`prototype-harvest`, `gap-interrogation-*`, `spec-writer`) write to an "artefact tree" with its own schemas and linter. The engine writes to `.aeos/tickets/`. Nothing under `aeos-core/src/` reads the artefact tree: the two halves of AEOS have never met.

**D1:** the tree lives inside `.aeos/`. `aeos project init` already runs `git init` there (`project-init.use-case.ts`) and `aeos install` adds `.aeos/` to the global gitignore, so the spec keeps a history separate from the code.

**D2:** `plugins/artefact-tree-pipeline/` is canonical. Today there are three copies of the schemas (`plugins/…/schemas/`, `aeos-core/src/artefact-tree/schemas/`, and whatever a project seeded) and two diverged copies of the skills (root `skills/` and the plugin).

## What needs to be done
**A. One layout.** After this task a project's `.aeos/` looks like:
```
.aeos/
├── project.json  pipelines.yaml  CONSTRAINTS.md
├── column-specs/  agents/  rubrics/  skills/
├── schemas/                      # seeded from the plugin, with a .source stamp
├── assumption-register.yaml  source-precedence.yaml
├── contexts/<context>/           # glossary.md, CONSTRAINTS.md, decisions/
├── features/<feature>/           # feature-inventory.yaml, decisions.yaml, spec.md, features/*.feature, gates.yaml, conformance.yaml
└── tickets/<id>/                 # artefacts, runs/
```
`.aeos/CONSTRAINTS.md` stays the project-wide file the engine already injects. A `contexts/<context>/CONSTRAINTS.md` is additive (I1-M3-002b loads it).

**B. Engine.**
1. Add `artefactTree?: string` to `ProjectExecutorConfig`, a path relative to the project root, default `.aeos`.
2. `artefact-tree.port.ts` + filesystem adapter: `root(projectPath)`, `featureDir(projectPath, feature)`, `exists`, `listFeatures`.
3. `aeos project init` scaffolds `features/`, `contexts/` and seeds `schemas/`. Port the logic of `plugins/artefact-tree-pipeline/scripts/seed-schemas.mjs` (copy, write the `.source` stamp with a sha256 over the set, refuse on divergence) into the engine, or invoke it; either way `--check` semantics must be preserved.
4. Ship the schemas with the package. Add a build step that copies `plugins/artefact-tree-pipeline/schemas/` into `aeos-core/templates/schemas/`, and a CI check that fails when the copy is stale. Delete `aeos-core/src/artefact-tree/schemas/`.
5. `aeos project sync` reports stale or diverged schemas like any other template.

**C. Skills.**
1. Move `skills/gap-interrogation-solo/` into the plugin.
2. Reconcile each skill that exists in both places (`prototype-harvest`, `gap-interrogation-capture`, `spec-writer`): diff them, keep the union of real content (root has `conflict-checklist.md`, `inventory-schema.yaml`, `personas.md`), and list every judgement call in the pull request.
3. Delete root `skills/`. Do **not** touch `aeos-core/skills/aeos/`: that is the CLI-driving skill, a different thing.
4. Change the tree resolution order in `artefact-tree-init/SKILL.md` and every `references/artefact-tree.md` to:
   1. `$AEOS_ARTEFACT_TREE`
   2. `artefactTree` in `.aeos/project.json`
   3. `<project>/.aeos` when it exists
   4. a sibling `*-specs` directory
   5. an existing in-repo `docs/artefact-tree/`
   6. ask
5. Reword "Never write specification artefacts into the code repo" so it stays true: `.aeos/` is its own repository, ignored by the code repository.
6. Update `plugins/artefact-tree-pipeline/README.md` and the root `README.md` links.

## Acceptance Criteria
- [ ] Given `aeos project init` in an empty directory, when it finishes, then `.aeos/schemas/` holds the plugin's schemas with a valid stamp, and `features/` and `contexts/` exist
- [ ] Given a project whose seeded schemas were hand-edited, when `aeos project sync` runs, then they are reported as diverged and not overwritten without `--force`
- [ ] Given the repository, when searched, then there is exactly one authored copy of each schema and each skill
- [ ] Given CI, when `templates/schemas/` differs from the plugin's schemas, then the build fails
- [ ] Given a project with `.aeos/` and no environment variable, when a skill resolves the tree, then it resolves to `<project>/.aeos`
- [ ] Given `artefactTree` set to another path, when resolved by the engine, then that path is used

## Out of Scope
- Reading specs into the pipeline (I1-M3-002a/b)
- Moving ticket state out of SQLite
- Giving `.aeos/` a remote

## Open question (stop and ask)
`decisions.schema.json` has `$id: https://standin.co/schemas/decisions/1`. The schemas are AEOS's now. Changing an `$id` is a contract change: ask Kris before touching it.

## Technical Notes / Hints
- The skill reconciliation is judgement work on prose a person wrote. When two versions disagree on substance, keep both passages and flag it; do not pick.
- `lint_decisions.py` needs Python 3. It stays Python in this iteration.

## Layer Mapping
```
Model:       src/domain/model/project-executor-config.ts
Port:        src/domain/ports/driven/artefact-tree.port.ts
Adapter:     src/infrastructure/filesystem/fs-artefact-tree.adapter.ts
Application: src/application/project-init.use-case.ts, project-sync.use-case.ts
Templates:   aeos-core/templates/schemas/ (generated copy)
Skills:      plugins/artefact-tree-pipeline/skills/**, plugins/artefact-tree-pipeline/README.md
Removed:     skills/ (root), aeos-core/src/artefact-tree/schemas/
```

## Dependencies
- I1-M0-001

## Definition of Done
- [ ] Common Definition of Done in `README.md`
- [ ] Skill reconciliation notes in the pull request, each divergence listed
