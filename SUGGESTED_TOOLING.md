# Tooling for the Twelve Principles

One **tooling document per principle** of the [Twelve Principles of AI-Driven Development](12_PRINCIPLES.md)
(argued in the [manifesto](AI_MANIFESTO.md), grounded in the [laws behind them](LAWS_BEHIND.md)).

Each document answers a single question: **what does it take, in real tooling, to enforce this principle
rather than merely assert it?** They are suggested architectures with reasoning, CI pipeline specifications,
and tool comparisons — a principle is only a control when a machine enforces it. Where a principle is
already executable as code, the five code-generation scaffolds under [`tooling/`](tooling/) are the worked
examples (they implement [Principle IV](tooling/principles/PRINCIPLE-04-generators-build-the-scaffold.md)).

The documents live in [`tooling/principles/`](tooling/principles/); this page is the index.

## The twelve

| # | Principle | Tooling focus |
|---|---|---|
| [I](tooling/principles/PRINCIPLE-01-discipline-is-the-control.md) | Discipline is the control | Machine-enforced conventions: formatters, linters, architecture fitness functions, pre-commit, trunk-based CD |
| [II](tooling/principles/PRINCIPLE-02-agents-are-first-day-engineers.md) | Agents are first-day engineers, every day | Context engineering, least-privilege sandboxing, reproducible envs, deterministic guardrails |
| [III](tooling/principles/PRINCIPLE-03-humans-write-the-specification.md) | Humans write the specification | Gherkin/EARS, design-first OpenAPI governance, diagrams-as-code, ERDs, decision logs |
| [IV](tooling/principles/PRINCIPLE-04-generators-build-the-scaffold.md) | Generators build the scaffold, agents write the logic | Spec/schema → deterministic generator → conformance gate; property testing (the `tooling/` scaffolds) |
| [V](tooling/principles/PRINCIPLE-05-every-decision-is-traceable.md) | Every decision is traceable | ADRs, requirement→code→test traceability, commit trailers, build provenance |
| [VI](tooling/principles/PRINCIPLE-06-checks-first-review-agents-second.md) | Checks run first, review agents second | SAST / policy-as-code gate before the LLM review panel; rubric-as-code; finding→rule loop |
| [VII](tooling/principles/PRINCIPLE-07-humans-hold-three-gates.md) | Humans hold three gates | Path-scoped CODEOWNERS + rulesets, breaking-change diff detection, release approval environments |
| [VIII](tooling/principles/PRINCIPLE-08-deploy-continuously-release-deliberately.md) | Deploy continuously, release deliberately | Feature flags, progressive delivery, SLO-based automated rollback, release→metric binding |
| [IX](tooling/principles/PRINCIPLE-09-ceremony-scales-with-the-change.md) | Ceremony scales with the change | Risk-tiered pipelines, path-based required checks, merge queues, always-gate contract/schema |
| [X](tooling/principles/PRINCIPLE-10-engineer-owns-the-blueprint.md) | The engineer owns the blueprint | Ownership encoded as CODEOWNERS/RACI; Conway-aware org design; RFC/ADR processes |
| [XI](tooling/principles/PRINCIPLE-11-junior-engineers-grown-on-purpose.md) | Junior engineers are grown on purpose | AI-off practice modes, test-first scaffolds, progressive autonomy, review-as-teaching |
| [XII](tooling/principles/PRINCIPLE-12-system-learns-from-measurement.md) | The system learns from measurement | DORA + custom metrics, OpenTelemetry/cost tracking, LLM evals that tune gates and model choice |

## How to use them

Pick the principle you want to strengthen, read its **Reference architecture** and **CI / automation**
sections, and adopt the tools from its table that fit your stack. The documents cross-link each other where
principles compose (e.g. III feeds IV; VI runs before the human gates of VII; VII and XII close the loop on
earned autonomy), so following those links traces how the controls reinforce one another.

> Each document is a design reference, not a mandate. The manifesto's own stance applies: constrain the
> output, not the reasoning — adopt the controls that earn their keep for your team and measure the rest.
