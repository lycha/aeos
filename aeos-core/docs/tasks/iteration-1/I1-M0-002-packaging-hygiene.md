# Task: Packaging Hygiene — Licence Field and Package Name

**Milestone:** I1-M0 — Harness
**Plan package:** 0.2
**Agent:** typescript-pro
**Method:** Agentic implementation
**Size:** S
**Human-owned inputs:** the package scope (see Open question)

## Context
`aeos-core/LICENSE` is Apache 2.0 and the root README badge says Apache 2.0, but `aeos-core/package.json` declares `"license": "ISC"`. The unscoped npm name `aeos` is taken. Both must be right before the first tagged build, because a tag is what M1 onwards dogfoods from.

## What needs to be done
1. In `aeos-core/package.json` set `"license": "Apache-2.0"`.
2. Set `"name"` to the scoped name once the scope is confirmed. Keep `"bin": { "aeos": ... }` unchanged so the command stays `aeos`.
3. Fill `"description"`, `"repository"`, `"homepage"`, `"bugs"` and `"author"`. They are empty today.
4. Add a test (`src/index.test.ts` already exists) that reads `package.json` and `LICENSE` and asserts the licence field matches the licence file's first heading.
5. Run `npm pack --dry-run` and confirm the tarball contains `dist`, `templates`, `skills`, `README.md`, `LICENSE` and nothing else.

## Acceptance Criteria
- [ ] Given `package.json`, when read, then `license` is `Apache-2.0`
- [ ] Given `npm pack --dry-run`, when run after a build, then the listed name is the scoped name and the file list matches the `files` field
- [ ] Given the licence test, when `package.json` says `ISC` again, then the test fails

## Out of Scope
- Publishing to npm
- Binary packaging (`M7-001`) and the install wizard (`M7-002`)
- The "AEOS" trademark question. It is tracked in the product design, not here.

## Open question (stop and ask)
Which npm scope? `@lycha/aeos` matches the GitHub owner. Do not guess: ask Kris, then proceed.

## Dependencies
- None

## Definition of Done
- [ ] Common Definition of Done in `README.md`
- [ ] Scope confirmed by a person and recorded in the pull request
