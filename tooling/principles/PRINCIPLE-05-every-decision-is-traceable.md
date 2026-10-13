# Principle V — Every decision is traceable

> **Principle.** Decision logs, specifications and the agents' own reasoning are committed next to the code, and every artefact links to the decision behind it. A gap found late amends the decision log or the spec first, and a missing decision stops the work.
>
> **Law.** Chesterton's Fence — do not remove a fence until you know why it was put up; an agent can only know *why* a rule exists if someone wrote the reason down, so the reason must live in the repo, not in a vanished chat.

AEOS already lives one half of this principle: every run writes its artefacts and the agent's reasoning to `<project>/.aeos/tickets/<ticketId>/` and commits them next to the code, and the reviewer verdict is a parsed `AEOS-VERDICT` trailer rather than prose. This document is the other half — turning "the reasoning is in the repo" into "the decision is *findable, linked, and enforced*" with current (2024–2026) tooling, so that an agent (or a human six months later) can trace any line of code back to the decision that caused it and refuses to touch code whose decision is missing.

## What it demands, operationally

1. **A decision log that is part of the repo, not a wiki.** Decisions (architecture, scope, contract shape, "why we rejected X") are versioned Markdown files reviewed in the same PR as the code they justify. They get an immutable id (`ADR-0007`), a status, and the context/consequences that let someone later apply Chesterton's Fence.
2. **Bidirectional links.** Code → decision (a commit trailer or code tag naming the ADR/requirement id) *and* decision → code (the ADR lists the PRs/commits that implemented it). A one-way link rots: you can find the ADR from the PR but not the code from the ADR.
3. **Requirement-to-code-to-test traceability.** A requirement has a stable id; the code that satisfies it tags that id; the test that proves it tags it too. A coverage report shows orphans (requirement with no code, code with no test) and fails CI on a gap.
4. **Agent reasoning committed beside code.** The transcript / plan / reviewer rationale is an artefact, not a disposable chat. AEOS does this already; the discipline is to *link* each artefact to its decision id and keep it in git history.
5. **A missing decision stops the work.** Mechanically: a PR that changes a spec or contract without referencing a decision id fails a required status check. This is the enforcement teeth — "stops the work" is a red build, not a code-review nicety.
6. **Provenance for the generated and the agent-authored.** Where Principle IV's generators and the agents produce artefacts, record *what produced this and from what input* as signed, verifiable metadata, so a reviewer can trust the chain without re-deriving it.

## Reference architecture

```
repo/
  docs/decisions/            # ADRs — MADR 4.0 Markdown, one file per decision, immutable ids
    0001-record-architecture-decisions.md
    0007-contract-first-openapi.md
  docs/requirements/         # requirements-as-code: ids under Markdown headings (OpenFastTrace / Sphinx-Needs)
  .aeos/tickets/<id>/        # AEOS artefacts + agent reasoning (already committed)
  src/...                    # code tags a requirement/ADR id in a comment: [impl->req~auth-token~1]
  tests/...                  # tests tag the same id: [utest->req~auth-token~1]
  .github/workflows/
    traceability.yml         # OFT trace + "decision referenced?" gate + attestation
```

- **Decisions** are the stable spine. An ADR id never changes; its *status* does (`proposed → accepted → superseded by ADR-0012`). Superseding, not deleting, is how Chesterton's Fence survives — the old reasoning stays readable.
- **The decision log is in-repo by default.** It is reviewed, diffed and branched with the code, and it is present offline for the agent. An external tracker (GitHub Issues / Linear / Jira) carries *conversation and scheduling*; the ADR carries the *durable decision*. Link the two; do not let the tracker be the only record, because an agent cannot read a Jira ticket from inside a checkout and a closed SaaS account takes the reasoning with it.
- **Links are trailers, not prose.** A commit ends with git trailers (`Refs: ADR-0007`, `Closes: #142`); the review verdict, like AEOS's own, is a parsed trailer. Machine-readable links are greppable and gate-able; sentences in a commit body are not.

## CI / automation

The gate has three independent checks, each a required status so a red one blocks merge:

1. **Decision-reference gate ("a missing decision stops the work").** A job inspects the PR diff: if it touches a spec/contract path (`openapi.yaml`, `docs/requirements/**`, `.aeos/column-specs/**`) *and* no commit in the PR carries a `Refs:`/`Decision:` trailer pointing at an existing `docs/decisions/*.md` id, the job fails with "contract changed without a linked decision — add or amend an ADR first." Commit trailers are read with [`git interpret-trailers`](https://git-scm.com/docs/git-interpret-trailers); the id must resolve to a real, non-`rejected` ADR file.
2. **Requirement traceability.** [OpenFastTrace](https://github.com/itsallcode/openfasttrace) runs `oft trace` over the Markdown specs and tagged source/tests and exits non-zero on any uncovered requirement or broken link — the exact workflow [JabRef uses via a Gradle task](https://devdocs.jabref.org/code-howtos/openrewrite.html). The report (coverage %, orphans) is uploaded as a build artefact and the RTM is regenerated, not hand-maintained.
3. **Provenance / attestation.** On release, the build emits a signed [SLSA v1 provenance](https://slsa.dev/provenance/v1) predicate (an [in-toto](https://in-toto.io/) statement) recording source commit, builder and inputs, via [GitHub artifact attestations](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations) logged to a transparency log. The analogy flows back to decisions: provenance answers "what built this and from what," the ADR link answers "who decided this and why" — same shape, both verifiable, neither trusting memory.

Keep these as *separate* required checks so a failure names its own cause. Do not fold them into one opaque "lint" step — the whole point of the principle is that *why a thing is blocked* is answerable from the log.

## Tooling options

| Tool | What it does | When to pick it |
|---|---|---|
| [MADR 4.0](https://adr.github.io/madr/) ([templates](https://github.com/adr/madr)) | Markdown ADR template (full / bare / minimal variants); the de-facto decision-log format | Default. Format-agnostic, no runtime, reviews in the same PR as code. Start here. |
| [adr-tools](https://github.com/npryce/adr-tools) | Shell CLI to scaffold/number/supersede ADRs | Lightweight numbering if you want a CLI; note the original repo is **archived** — vendor it or use a fork. |
| [Log4brains](https://github.com/thomvaill/log4brains) | ADR CLI + static-site generator publishing the log as a browsable site | When non-developers need to read the log; uses a patched MADR 2.1.2 format. |
| [dotnet-adr (`adr`)](https://www.nuget.org/packages/adr) ([endjin/dotnet-adr](https://github.com/endjin/dotnet-adr)) | Cross-platform .NET global tool: `adr new <title>`, template bundle | .NET shops; `dotnet tool install -g adr`. |
| [OpenFastTrace](https://github.com/itsallcode/openfasttrace) | Requirement→code→test tracing from Markdown specs + source tags; exits non-zero on gaps | Default traceability engine. Language-agnostic, CI-native, plain-text reports. |
| [Sphinx-Needs](https://www.sphinx-needs.com/) | Requirements/arch/test items as text with ids + typed relations, validated and reported in CI | Heavier lifecycle (V-model, `REQ→ARCH→CODE→TEST→RESULT`); when you want a rendered requirements site. |
| [RTMX](https://pypi.org/project/rtmx/) | Requirements in a version-controlled CSV linked to tests | Minimal RTM without adopting a doc toolchain. |
| [Conventional Commits 1.0](https://www.conventionalcommits.org/en/v1.0.0/) | Structured commit messages with git-trailer-style footers (`Refs: #123`, `BREAKING CHANGE:`) | Always. Makes the code→decision/issue link machine-parseable and greppable. |
| [`git interpret-trailers`](https://git-scm.com/docs/git-interpret-trailers) | Parse/add/normalise commit trailers | The CI decision-reference gate reads links with this, not regex over prose. |
| [`git notes`](https://git-scm.com/docs/git-notes) | Attach metadata to a commit *without* rewriting it | Store review verdicts / provenance / agent rationale against a commit after the fact. |
| [git-appraise](https://github.com/google/git-appraise) | Distributed code review stored entirely in `git notes` (refs/notes/devtools/*) | When review history must live in the repo and survive the forge, not on a SaaS. |
| [GitHub issue/PR linking](https://docs.github.com/en/issues/tracking-your-work-with-issues/linking-a-pull-request-to-an-issue) | `Closes/Fixes/Resolves #n` keywords auto-link and auto-close | Tie the external conversation to the merge; mirror the id into an in-repo trailer too. |
| [SLSA provenance](https://slsa.dev/spec/v1.0/) + [in-toto](https://in-toto.io/) | Signed build attestation (source, builder, inputs); the provenance analogy for decisions | Release pipelines; pair with a transparency log for non-repudiable "how it was built." |
| [GitHub artifact attestations](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations) | One-step SLSA provenance generation + verification in Actions | Easiest path to shippable provenance if you're already on GitHub Actions. |

## Anti-patterns

- **The decision lives only in the chat.** The agent explains *why* in a transcript that is never committed, or in a Slack/PR thread that is later archived. The fence has no sign; the next agent removes it. AEOS avoids this by committing reasoning — do not regress it by moving rationale to ephemeral channels.
- **One-way links.** Commits reference ADRs but no ADR lists its implementing commits, so you can audit forward but never answer "is this code still justified?" Keep the back-link (OFT/Sphinx-Needs or a PR list in the ADR).
- **Deleting instead of superseding.** Removing or editing an accepted ADR erases the context a later reader needs. Mark it `superseded by ADR-NNNN` and leave the file.
- **Substring-matching links in prose.** Grepping the commit body for "ADR" misfires on the template and on quoted text — the same trap AEOS's verdict parser avoids. Parse trailers.
- **The gate warns instead of blocking.** A non-required check that prints "no decision referenced" and still merges is not "stops the work." Make it a required status.
- **Retro-fitting the decision after the code.** Writing the ADR in the same PR purely to satisfy the gate, after the code is final, inverts the principle ("amend the decision log or the spec *first*"). The decision-reference gate catches the missing link; only review catches the backwards order — state the expectation in the reviewer rubric.
- **The RTM is a hand-maintained spreadsheet.** It is stale within a sprint. Generate it from tagged source every build.
- **Trailer theatre.** `Refs: ADR-0007` where ADR-0007 does not exist or is still `proposed`. The gate must resolve the id to a real, accepted file.

## Signals it's working

- Pick any merged line of code → `git log`/`git blame` → a trailer → an ADR id → the context and the rejected alternatives. No step requires asking a human or reading a closed ticket.
- `oft trace` is green and the orphan count is zero; the RTM in the last build artefact matches the code.
- A PR that edits `openapi.yaml` or a column spec with no linked decision is *red*, and the author's fix is to open/amend an ADR, not to delete the check.
- ADRs accrete `superseded-by` chains rather than vanishing; "why is this fence here?" is answered by reading, not archaeology.
- A released artefact can be verified (`gh attestation verify` / SLSA provenance) back to its source commit, and that commit carries its decision trailer — build provenance and decision provenance meet at the same SHA.
- When an agent hits a gap mid-run, the transcript shows it stopping to amend the spec/ADR before coding — the AEOS escalation path (`ESCALATED`, not `FAILED`) fires on "missing decision," and a human writes the reason down.

## Related

- **Principle IV — Generators build the scaffold, agents write the logic.** The `tooling/` codegen scaffolds enforce IV; their generated output and policy files are themselves artefacts that should carry a decision link (why this contract shape). V makes IV's choices traceable.
- **AEOS internals.** `domain/services/verdict-parser.ts` (parsed trailer, never prose) is the same discipline this principle asks of commit/decision links. `syncTicketDocument` and the `.aeos/tickets/<id>/` artefacts are the in-repo reasoning store. `.aeos/CONSTRAINTS.md` is a form of committed decision rationale injected into agent context.
- **README.md** — state-machine table and executor matrix; the transition log is AEOS's own decision trail for *why a ticket advanced*.

## Sources

- [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) — footer/trailer rules, `BREAKING CHANGE`, issue refs.
- [git interpret-trailers](https://git-scm.com/docs/git-interpret-trailers) and [git notes](https://git-scm.com/docs/git-notes) — official Git docs.
- [MADR](https://adr.github.io/madr/) · [adr/madr templates (4.0)](https://github.com/adr/madr) · [adr-tools (archived)](https://github.com/npryce/adr-tools) · [Log4brains](https://github.com/thomvaill/log4brains) · [dotnet-adr `adr` tool](https://www.nuget.org/packages/adr) / [endjin/dotnet-adr](https://github.com/endjin/dotnet-adr).
- [OpenFastTrace](https://github.com/itsallcode/openfasttrace) · [OFT user guide](https://github.com/itsallcode/openfasttrace/blob/main/doc/user_guide.md) · [JabRef requirements workflow](https://devdocs.jabref.org/) · [Sphinx-Needs](https://www.sphinx-needs.com/) ([repo](https://github.com/useblocks/sphinx-needs)) · [RTMX](https://pypi.org/project/rtmx/).
- [git-appraise](https://github.com/google/git-appraise) — distributed code review in git notes.
- [GitHub: linking a PR to an issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/linking-a-pull-request-to-an-issue) · [GitHub artifact attestations](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations).
- [SLSA v1.0 spec](https://slsa.dev/spec/v1.0/) · [SLSA provenance v1 predicate](https://slsa.dev/provenance/v1) · [in-toto](https://in-toto.io/) · [SLSA + in-toto](https://slsa.dev/blog/2023/05/in-toto-and-slsa).
