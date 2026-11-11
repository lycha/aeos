# Checklist: Proving Runs on AEOS and the Write-Up

**Milestone:** I1-M5 — Run on AEOS
**Plan package:** 5
**Who:** Kris. This is not an agent task. Agents implement inside the runs; a person drives them and holds every gate.
**Human-owned inputs:** the spec for the proving feature

## Purpose
Iteration 1 is done when one feature and one bug in this repository travel from intake to a merged pull request through AEOS and leave a conformance report and real cost numbers behind. This checklist is that run.

## Before starting
- [ ] Every task I1-M0 to I1-M4 merged; stub end-to-end test green; a tag cut from that commit
- [ ] AEOS installed **from the tag**, not the working tree
- [ ] This repository's `.aeos/project.json` has `checks`, `protectedPaths`, `generators`, `contracts` and `criteria`
- [ ] `aeos project sync` reports nothing missing or drifted

## The feature run
Suggested feature: **`aeos dashboard`**. It is a one-line stub with a task file (`docs/tasks/M7-003-aeos-dashboard.md`), and adding it changes the CLI contract, so it exercises the contract gate and the generator. Three to eight acceptance criteria is the right size.

1. [ ] Run `prototype-harvest`, a gap interrogation and `spec-writer` under `.aeos/features/dashboard/`. You draft and decide. **Log your hours.**
2. [ ] Check the `dashboard` entry in `cli-contract.yaml` says what you want (it is your contract). Edit it yourself if not.
3. [ ] `aeos ticket create "aeos dashboard" --spec dashboard` — it must refuse until the decisions lint is clean.
4. [ ] Run `SPEC_REVIEW`. Read the gaps. Amend the spec where they are real. Approve: this is the spec gate.
5. [ ] `aeos orchestrator run <epic> --budget <usd>` through tech spec, breakdown and the tasks.
6. [ ] When a task stops on the contract change, read the diff and approve with `--contract`.
7. [ ] Read the integration review. Approve. A pull request opens.
8. [ ] At the final gate, read the conformance report. Approve with `dod-approve`.
9. [ ] Review and merge the pull request yourself.

## The bug run
Use the first real defect the earlier milestones turned up.

1. [ ] `aeos ticket create "<title>" --bug --body-file <path>`
2. [ ] Run it. Confirm `repro.md` shows the test red before the fix and green after.
3. [ ] Review and merge its pull request.

## The write-up
One page, committed as `docs/iteration-1-report.md`.

| Number | Where it comes from |
|---|---|
| Model spend per run and per column | `aeos costs --epic <id>` |
| Your hours on spec work and at each gate | your own log; the engine cannot see it |
| Rework attempts per column, and escalations | run records |
| Checks failed before review; protected-path violations | run records |
| Spec amendments after implementation started | gate records (`amendment`, `repin`) |
| Criteria passed, failed, unverified, by instrument | `conformance.yaml` |
| Defects found in AEOS itself | a list, each with the task it reopens |

And answer three questions plainly:

1. Was the spec work worth its hours for a feature of this size?
2. Which gate cost you the most attention, and did it catch anything?
3. What would stop you recommending AEOS to another solo developer today?

## Exit checklist for the iteration
- [ ] A feature started from a human-drafted spec. No agent drafted requirements.
- [ ] Lint, typecheck and tests ran before any review agent.
- [ ] An agent that edits a rubric, spec, contract or generated file fails its run.
- [ ] The epic and the bug each ended in a pull request. The engine committed nothing to main.
- [ ] Every gate decision is a structured record in git. Every override carries a reason.
- [ ] Every run has a record with tokens and cost. The budget ceiling can stop a run.
- [ ] The feature closed on a conformance report with a verdict and instrument per criterion.
- [ ] The bug run shows its reproducing test red, then green.
- [ ] Column names and column order come from configuration.
- [ ] The stub end-to-end test passes in CI.
