# Twelve Principles of AI‐Driven Development

The short version of the [AI-Driven Development Manifesto](https://github.com/lycha/aeos/wiki/Manifesto), where each principle is argued in full.

> Humans write the specification and own the contracts and the release; generators build everything deterministic; agents fill the rest inside guardrails; and work is done when it is rolled out, observed and measured.

---

### I. Discipline is the control

AI makes the engineering discipline of the last forty years more valuable. Domain-driven design, explicit contracts, tests, feature flags and continuous delivery are the controls that keep agent output correct.

### II. Agents are first-day engineers, every day

An agent gets real trust and autonomy inside explicit guardrails. It remembers nothing from yesterday and sees only what has been written down, so the team writes down everything it needs.

### III. Humans write the specification

Gherkin scenarios, EARS requirements, actors, UML and ERD diagrams, the OpenAPI contract and the domain invariants are the most important engineering artefacts. A human drafts them and an agent reviews the draft, and an agent drafts only from decisions already in the decision log.

### IV. Generators build the scaffold, agents write the logic

Everything derivable from the specification is generated deterministically: types and interfaces from the OpenAPI contract, repository code from a human-owned schema, and the end-to-end suite from Gherkin scenarios. Invariants are enforced by constraints and property tests, and agents fill in the business logic.

### V. Every decision is traceable

Decision logs, specifications and the agents' own reasoning are committed next to the code, and every artefact links to the decision behind it. A gap found late amends the decision log or the spec first, and a missing decision stops the work.

### VI. Checks run first, review agents second

Every reviewer on the panel (engineering, product, invariants, architecture and security) runs deterministic checks before a review agent covers what rules cannot express. When an agent keeps catching the same problem, that finding becomes a rule.

### VII. Humans hold three gates

The specification, any change to the API contract or database schema, and the release always have a human. Above that floor, engineering leadership decides where humans sign off, and a gate earns autonomy from evaluation data and loses it with an escaped defect.

### VIII. Deploy continuously, release deliberately

Deployment runs automatically behind feature flags, automated rollback and detailed monitoring. Release is a human decision, and work is done when it is released, observed and measured against its success metric.

### IX. Ceremony scales with the change

The full pipeline is for changes people would otherwise argue about later, while a wording fix, a behaviour tweak or a bug starts further down. Every track still goes through a pull request with green checks, and contract and schema changes always get an engineer review.

### X. The engineer owns the blueprint

The Product Engineering Architect is an engineer accountable for the specification, the contracts, the invariants and the data model, and agents build to them. The Product Manager owns the strategy, the problem and the priority, and the two meet at the specification.

### XI. Junior engineers are grown on purpose

Juniors write part of their code by hand, start with small specifications and failing tests, and review agent output alongside a senior. Teaching is part of a senior's job, because this model depends on a steady supply of seniors.

### XII. The system learns from measurement

Delivery is judged on the DORA metrics, with lead time measured to deployment and to release, alongside spec amendments, time waiting at human gates, the panel's override rate and model spend per released change. Agents do not learn between runs, so the evaluations tune the system: which gates need a human, and the smallest model good enough for each task.