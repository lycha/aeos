# Tooling for the Twelve Principles

One **tooling document per principle** of the [Twelve Principles of AI-Driven Development](../../12_PRINCIPLES.md)
(argued in the [manifesto](../../AI_MANIFESTO.md), grounded in the [laws behind them](../../LAWS_BEHIND.md)).

Each document answers a single question: **what does it take, in real tooling, to enforce this principle
rather than merely assert it?** They are not strict scripts — they are suggested architectures with
reasoning, CI pipeline specifications, and tool comparisons — because a principle is only a control when a
machine enforces it. Where a principle is already executable as code, the five
code-generation scaffolds elsewhere in [`tooling/`](../) are the worked examples (they implement
[Principle IV](PRINCIPLE-04-generators-build-the-scaffold.md)).

Every document follows the same shape:

- **Principle / Law** — the verbatim principle and the engineering law it rests on.
- **What it demands, operationally** — the principle translated into concrete obligations.
- **Reference architecture** — the recommended way to enforce it, with the reasoning for its shape.
- **CI / automation** — the gates and checks that make it enforceable, not aspirational.
- **Tooling options** — current (2024–2026) tools across the TS/Node, Kotlin/JVM, PHP and polyglot ecosystems.
- **Anti-patterns · Signals it's working · Related · Sources.**

## The twelve

| # | Principle | Tooling focus |
|---|---|---|
| [I](PRINCIPLE-01-discipline-is-the-control.md) | Discipline is the control | Machine-enforced conventions: formatters, linters, architecture fitness functions, pre-commit, trunk-based CD |
| [II](PRINCIPLE-02-agents-are-first-day-engineers.md) | Agents are first-day engineers, every day | Context engineering, least-privilege sandboxing, reproducible envs, deterministic guardrails |
| [III](PRINCIPLE-03-humans-write-the-specification.md) | Humans write the specification | Gherkin/EARS, design-first OpenAPI governance, diagrams-as-code, ERDs, decision logs |
| [IV](PRINCIPLE-04-generators-build-the-scaffold.md) | Generators build the scaffold, agents write the logic | Spec/schema → deterministic generator → conformance gate; property testing (the `tooling/` scaffolds) |
| [V](PRINCIPLE-05-every-decision-is-traceable.md) | Every decision is traceable | ADRs, requirement→code→test traceability, commit trailers, build provenance |
| [VI](PRINCIPLE-06-checks-first-review-agents-second.md) | Checks run first, review agents second | SAST / policy-as-code gate before the LLM review panel; rubric-as-code; finding→rule loop |
| [VII](PRINCIPLE-07-humans-hold-three-gates.md) | Humans hold three gates | Path-scoped CODEOWNERS + rulesets, breaking-change diff detection, release approval environments |
| [VIII](PRINCIPLE-08-deploy-continuously-release-deliberately.md) | Deploy continuously, release deliberately | Feature flags, progressive delivery, SLO-based automated rollback, release→metric binding |
| [IX](PRINCIPLE-09-ceremony-scales-with-the-change.md) | Ceremony scales with the change | Risk-tiered pipelines, path-based required checks, merge queues, always-gate contract/schema |
| [X](PRINCIPLE-10-engineer-owns-the-blueprint.md) | The engineer owns the blueprint | Ownership encoded as CODEOWNERS/RACI; Conway-aware org design; RFC/ADR processes |
| [XI](PRINCIPLE-11-junior-engineers-grown-on-purpose.md) | Junior engineers are grown on purpose | AI-off practice modes, test-first scaffolds, progressive autonomy, review-as-teaching |
| [XII](PRINCIPLE-12-system-learns-from-measurement.md) | The system learns from measurement | DORA + custom metrics, OpenTelemetry/cost tracking, LLM evals that tune gates and model choice |

## How to use them

Pick the principle you want to strengthen, read its **Reference architecture** and **CI / automation**
sections, and adopt the tools from its table that fit your stack. The documents cross-link each other where
principles compose (e.g. III feeds IV; VI runs before the human gates of VII; VII and XII close the loop on
earned autonomy), so following those links traces how the controls reinforce one another.

> Each document is a design reference, not a mandate. The manifesto's own stance applies: constrain the
> output, not the reasoning — adopt the controls that earn their keep for your team and measure the rest.
