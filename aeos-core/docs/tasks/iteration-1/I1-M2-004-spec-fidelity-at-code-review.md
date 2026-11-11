# Task: Add the Spec-Fidelity Rubric to Code Review

**Milestone:** I1-M2 — Guard
**Plan package:** 2.4
**Agent:** typescript-pro
**Method:** Agentic implementation
**Size:** S
**Human-owned inputs:** none

## Context
The manifesto's review panel has five reviewers. This iteration keeps one reviewer agent and adds the deterministic layer (I1-M2-001). The cheapest step toward a product reviewer is already in the repo: `templates/rubrics/drift/spec-fidelity.md` exists and is used only by `integration-review.yaml`. Code review of a single task (`code-review.yaml`) checks structure and intent drift, not fidelity to the spec.

## What needs to be done
1. Add `rubrics/drift/spec-fidelity.md` to `reviewerRubrics` in `templates/column-specs/code-review.yaml`.
2. Read the rubric. It was written for the whole-epic diff. If any instruction only makes sense at epic scope, add a short "when reviewing a single task" section rather than forking the file.
3. `template-source.test.ts` must still pass: every rubric a column spec names must resolve.
4. Document in `aeos-core/README.md` that existing projects pick this up with `aeos project sync --apply`.

## Acceptance Criteria
- [ ] Given a freshly initialised project, when `CODE_REVIEW` runs, then the reviewer's context includes the spec-fidelity rubric
- [ ] Given `aeos project sync` on a project created before this change, when run, then `code-review.yaml` is reported as drifted
- [ ] Given the template test, when run, then it passes

## Out of Scope
- A separate product reviewer agent, or any other panel member
- Changing the rubric's criteria

## Dependencies
- None. Can run at any time.

## Definition of Done
- [ ] Common Definition of Done in `README.md`
