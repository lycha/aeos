# Principle XI — Junior engineers are grown on purpose

> **Principle.** Juniors write part of their code by hand, start with small specifications and failing
> tests, and review agent output alongside a senior. Teaching is part of a senior's job, because this
> model depends on a steady supply of seniors.
>
> **Law.** The Law of Leaky Abstractions — every non-trivial abstraction leaks, and generated scaffolds
> and agents are abstractions too, so an engineer who has never built the thing by hand cannot see where
> it leaks or repair it when it does.

This is the one principle that is mostly *not* a CI gate. It is a learning-and-mentoring system with a
thin ring of automation around it. AEOS is the acute case of the problem: the pipeline
(`BACKLOG → IMPLEMENTATION → CODE_REVIEW → QA → DONE`) is built so that an agent writes the code and a
human approves at each gate. Left alone, that produces operators who can click *approve* and nothing
else — and the pipeline's reviewer rubrics, the convergence guards in `review-loop-policy.ts`, the
budget ceilings in the orchestrator all assume a human on the gate who can tell a correct diff from a
plausible one. That human has to be grown. The empirical backdrop is not reassuring: METR's randomized
trial found even *experienced* developers were ~19% slower with AI yet believed they were faster
([METR](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/), arXiv 2507.09089),
and the Microsoft/CMU study of 319 knowledge workers found higher trust in AI correlated with *less*
critical engagement with its output
([The Register summary](https://www.theregister.com/2025/02/11/microsoft_study_ai_critical_thinking/)).
Juniors who never built by hand are the population most exposed to both effects.

## What it demands, operationally

- Every junior has a **non-negotiable quota of hand-written code** — work produced with agents off —
  and it is visible and tracked, not aspirational.
- Juniors **start from a small spec and a failing test**, not from a prompt. The first thing they do on
  a task is make a red test green by hand, before any agent touches it.
- **Agent output is reviewed with a senior present**, at least until the junior has earned autonomy.
  The CODE_REVIEW gate is a teaching surface, not a rubber stamp.
- **Autonomy is granted in rungs** that mirror how AEOS itself grants autonomy to executors: review
  only → drive one column → drive a budgeted orchestrator run. No junior starts with
  `aeos orchestrator run`.
- **Seniors are measured on teaching**, and juniors are measured on a *balance* of hand-written vs.
  reviewed-agent work — so nobody is quietly reduced to an agent babysitter.
- **Decisions and constraints are captured as teaching material** (ADRs, `CONSTRAINTS.md`, annotated
  artifacts), because the leaks you want juniors to recognize are the ones a senior already paid for.

## Reference architecture

The system has five parts. None of them is a model in the control path — same discipline as the
orchestrator's pure scheduler.

**1. The practice ladder (reference-practice, deliberate).** Juniors run a standing cadence of katas on
an external platform plus an internal track. Use [Exercism](https://exercism.org) (free, ~75 language
tracks, human mentoring on submissions) for fundamentals and [cyber-dojo](https://cyber-dojo.org) for
timed, test-first group sessions; draw exercises from the
[codingdojo.org kata catalogue](https://codingdojo.org/practices/KataCatalogue/) and Dave Thomas's
[CodeKata](http://codekata.com). The *reason* katas matter in an agent shop is specific: a kata is
small enough that a leak in an abstraction (an off-by-one in a Roman-numerals boundary, a float
comparison in Bowling scoring) shows up in minutes and cannot be delegated away. Repetition builds the
reflex that lets a reviewer *smell* a wrong diff later. Internal katas should be carved out of real
AEOS leaks — a past production bug reduced to a failing test — so practice compounds into domain
knowledge rather than staying abstract.

**2. AI-off mode and when to enforce it.** There must be a first-class, enforceable "agents off" state,
not an honor system. Concretely:
- A **practice repo / practice branch** convention where IDE assistants (Copilot, Cursor, the `claude`
  CLI) are expected off, declared in `CONTRIBUTING.md` and signalled by a branch prefix
  (`practice/*`) so the balance dashboard can classify the work.
- A **practice task kind in AEOS**: a `TASK` ticket flagged so its IMPLEMENTATION column resolves to a
  no-agent executor. AEOS already has the mechanism — `AEOS_EXECUTOR=stub` runs the whole pipeline
  without real LLM calls — so a practice run exercises spec → failing test → hand-written code →
  CODE_REVIEW with a human, and the *agent* step is a deliberate no-op. The junior is the worker.
- **When to enforce it:** always for the first N weeks of onboarding; thereafter whenever the junior
  meets a *new* layer they will later supervise (a new language track, a new framework, the git
  internals under `simple-git`, the SQLite migration discipline). The rule of thumb is the Law itself —
  turn agents off for exactly the abstractions whose leaks the junior will be expected to diagnose on
  the gate. You do not need to hand-write everything forever; you need to have hand-written each layer
  once.

**3. Test-first scaffolds (start from a failing test).** A junior's task does not begin as prose. The
senior (or the TECH_SPEC/architect artifact) delivers a **small spec plus a committed failing test**,
and the junior's definition of done for the hand-written portion is "make it green without an agent."
This mirrors AEOS's own `requiresRepoDiff` guarantee on IMPLEMENTATION: a run that claims to implement
must leave a real diff. For juniors the inverted form is "a run that claims to *learn* must leave a
real, human-authored diff against a test you did not write." Tooling: `vitest --watch` (the repo's
runner) left running during the session; cyber-dojo for group test-first; cookiecutter kata templates
(e.g. the [zhendrikse/tdd](https://github.com/zhendrikse/tdd) collection) to stamp out a red suite in
seconds.

**4. Pairing and the review-as-teaching gate.** The CODE_REVIEW column's human approval gate is where a
senior and junior review an **agent-produced diff together**. The reviewer rubric under
`.aeos/rubrics/` is the teaching checklist: walk each rubric line against the diff out loud, and make
the junior produce the `AEOS-VERDICT` reasoning before the senior does. This is deliberate — the
Microsoft/CMU finding is that people verify less as they trust more, so the junior must practice
*active* verification (reproduce the claim, find the leak) rather than *passive* acceptance. Format:
- **Pairing** (driver/navigator) with the junior driving the review for narrow changes; a remote pair
  tool with a shared editor, not screen-share, when distributed.
- **Mobbing** for the first review of any genuinely new area, so the whole team's "smell" transfers at
  once (see [mob programming](https://academy.threedots.tech/knowledge/mob-programming/)).
- Senior co-signs the gate; the junior's verdict and the senior's are both recorded, and divergences
  become the next kata.

**5. Progressive autonomy, mirroring agent autonomy.** Juniors earn authority on a ladder that is the
human analogue of AEOS's executor-resolution and orchestrator budget controls. Map it onto GitHub
[repository roles](https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/repository-roles-for-an-organization)
so the permission *is* the autonomy:

| Rung | GitHub role | AEOS authority | Gate |
| --- | --- | --- | --- |
| Observer | Read / Triage | review artifacts, label tickets, co-review at gates with a senior | senior approves everything |
| Contributor | Write | hand-write tasks; run a **single column** (`aeos ticket run`) under supervision | senior co-signs CODE_REVIEW |
| Operator | Write | drive an agent on one task end-to-end; own the verdict | senior spot-checks |
| Pilot | Maintain | run `aeos orchestrator run <epic>` with a **budget ceiling** and paused escalations | senior reviews escalations |

The point of the ceiling is the same as the orchestrator's `orchestrator_state` budget: autonomy is
bounded until trust is earned, and every escalation (`SubState.ESCALATED`) a junior's run produces is a
teaching event, not a failure.

**6. Knowledge capture as curriculum.** Every architecturally significant decision becomes an
[ADR](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) in
[MADR](https://adr.github.io/madr/) format, scaffolded with
[adr-tools](https://github.com/npryce/adr-tools), stored in-repo next to the code it governs. AEOS's
own `CONSTRAINTS.md` and the invariants in `CLAUDE.md` (verdict comes from a parsed trailer; escalation
is not failure; keep DB deps lazy) are the canonical example: they are the *leaks a senior already
paid for*, written down so a junior inherits them instead of rediscovering them in production. The
`.aeos/tickets/<id>/` artifacts — tech specs, reviews, breakdowns — are a standing corpus of worked
examples; onboarding points juniors at real DONE epics and asks them to reconstruct the reasoning.

## CI / automation

Lighter here by design — the work is human. Automation exists only to keep the system honest.

- **Authorship classification.** A scheduled job parses git trailers: commits carrying an agent
  `Co-Authored-By` (e.g. `Claude`) are agent-assisted; `practice/*` branches and trailerless commits
  are hand-written. This feeds the balance dashboard (below). It does not block anything.
- **Practice-mode guard.** A CI check on `practice/*` branches fails if an agent `Co-Authored-By`
  trailer is present — the one place AI-off is actually enforced in the pipe.
- **ADR presence.** A `CODEOWNERS` + PR-template check nudges (warns, does not block) when a diff
  touches `src/domain/` or a migration without a linked ADR, since those are the leak-prone layers.
- **Rubric lint.** The existing `template-source.test.ts` discipline extends here: every column's
  reviewer rubric must parse and resolve, so the teaching checklist can never silently rot.
- **Onboarding completeness.** A small report asserts each junior has an active Exercism track and a
  non-zero hand-written quota this cycle; a zero is a management signal, surfaced not gated.

## Tooling options

| Tool / practice | What it does | When to use it |
| --- | --- | --- |
| [Exercism](https://exercism.org) | ~75 language tracks with free human mentoring on submissions | Fundamentals, new-language onboarding, async practice between tasks |
| [cyber-dojo](https://cyber-dojo.org) | Browser TDD environment with a running test harness; good for groups | Timed test-first katas and mob sessions; no local setup |
| [codingdojo.org catalogue](https://codingdojo.org/practices/KataCatalogue/) / [CodeKata](http://codekata.com) | Curated kata lists (FizzBuzz, Roman Numerals, Bowling, Game of Life…) | Picking the right difficulty for a given leak to practice |
| [zhendrikse/tdd](https://github.com/zhendrikse/tdd) | Kata collection + cookiecutter templates that stamp a failing suite | Generating test-first scaffolds quickly in the repo's languages |
| `AEOS_EXECUTOR=stub` (in-repo) | Runs the full pipeline with the agent step as a no-op | Practice tasks: spec → failing test → hand-written code → human CODE_REVIEW |
| `vitest --watch` (in-repo) | Red/green feedback loop during a session | Every hand-written practice session |
| Mob/pair sessions ([mob programming](https://academy.threedots.tech/knowledge/mob-programming/)) | Whole-team or driver/navigator review of agent diffs | First review of any new area; transferring "smell" |
| `.aeos/rubrics/` as review checklist | Turns the reviewer rubric into a teaching script at the gate | Every supervised CODE_REVIEW with a junior |
| [MADR](https://adr.github.io/madr/) + [adr-tools](https://github.com/npryce/adr-tools) | Short, versioned decision records in-repo | Capturing a leak/decision as reusable curriculum |
| GitHub [repository roles](https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/repository-roles-for-an-organization) | Read→Triage→Write→Maintain permission rungs | Encoding the autonomy ladder as actual access |
| Balance dashboard (git trailers + AEOS transition log) | Hand-written vs. reviewed-agent ratio per junior over time | Detecting babysitter drift; reviewing growth in 1:1s |

## Anti-patterns

- **Approve-only onboarding.** A junior who starts at the CODE_REVIEW gate and never writes by hand
  learns to pattern-match plausibility, which is exactly the skill the Microsoft/CMU study shows
  degrades verification. They cannot see leaks because they have never seen the floor.
- **Agent babysitting as the whole job.** If a junior's cycle is 100% reviewing agent diffs, the
  balance dashboard should read red. Reviewing is a skill, but it is downstream of building.
- **AI-off by honor system.** "We expect you not to use Copilot for katas" with no classification and
  no practice-branch guard decays within a sprint. Make the mode enforceable and visible.
- **Katas as busywork.** Generic FizzBuzz forever teaches nothing new. Katas must ladder in difficulty
  and, past the basics, be carved from real AEOS leaks.
- **Teaching as unpaid overhead.** If mentoring is invisible in a senior's goals, it is the first thing
  cut under deadline, and the senior supply collapses — the exact dependency this principle protects.
- **Autonomy by tenure, not demonstration.** Granting `orchestrator run` because someone has been here
  six months, rather than because their verdicts match seniors' and their escalations are sound.
- **Uncaptured decisions.** Every leak a senior diagnoses and does not write into an ADR or
  `CONSTRAINTS.md` is a tuition payment the next junior has to make again.

## Signals it's working

- Juniors' review verdicts (`AEOS-VERDICT` reasoning) increasingly **match seniors'** before the senior
  speaks, and they catch leaks the agent's own reviewer missed.
- The hand-written vs. reviewed-agent **ratio is deliberate per rung**, not drifting toward 100%
  babysitting.
- Juniors **advance the autonomy ladder on demonstrated judgment**, and escalations from their
  orchestrator runs are well-founded (real blockers, not noise).
- New hires onboard against a **growing corpus of ADRs and annotated artifacts**, so the same leak is
  explained once, not re-paid each time.
- Seniors are being **produced**, net — the population of people who can staff a CODE_REVIEW gate grows
  at least as fast as the pipeline's demand for it.
- A junior can **turn the agent off and still ship** the layer they supervise, which is the operational
  definition of seeing where the abstraction leaks.

## Related

- **Principle IV — Generators build the scaffold, agents write the logic** (`tooling/openapi-*`,
  `tooling/sqlmigrations-*`): scaffolds are abstractions too; juniors who hand-build once understand
  what the generator hides.
- **AEOS reviewer rubrics and the human approval gate** (`.aeos/rubrics/`, CODE_REVIEW column): the
  teaching surface this principle leans on.
- **AEOS verdict/escalation invariants** (`CLAUDE.md`: parsed-trailer verdict, escalation-is-not-failure;
  `domain/services/verdict-parser.ts`, `review-loop-policy.ts`): worked examples of paid-for leaks.
- **Orchestrator budget and autonomy** (`orchestrator.use-case.ts`, `orchestrator_state`): the model
  the human autonomy ladder mirrors.

## Sources

- Joel Spolsky, *The Law of Leaky Abstractions* (2002) — https://www.joelonsoftware.com/2002/11/11/the-law-of-leaky-abstractions/
- METR, *Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity* (2025), arXiv 2507.09089 — https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/ ; Simon Willison's analysis — https://simonwillison.net/2025/Jul/12/ai-open-source-productivity/
- Lee et al. (Microsoft Research / Carnegie Mellon), *The Impact of Generative AI on Critical Thinking* (CHI 2025), via The Register — https://www.theregister.com/2025/02/11/microsoft_study_ai_critical_thinking/
- Exercism — https://exercism.org
- cyber-dojo — https://cyber-dojo.org
- Coding Dojo kata catalogue — https://codingdojo.org/practices/KataCatalogue/
- Dave Thomas, CodeKata — http://codekata.com
- zhendrikse/tdd kata collection — https://github.com/zhendrikse/tdd
- Mob programming (Three Dots Labs academy) — https://academy.threedots.tech/knowledge/mob-programming/
- Michael Nygard, *Documenting Architecture Decisions* (2011) — https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
- MADR (Markdown Architectural Decision Records) — https://adr.github.io/madr/
- adr-tools — https://github.com/npryce/adr-tools
- GitHub, *Repository roles for an organization* — https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/repository-roles-for-an-organization
