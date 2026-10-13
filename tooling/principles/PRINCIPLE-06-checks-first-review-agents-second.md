# Principle VI — Checks run first, review agents second

> **Principle.** Every reviewer on the panel (engineering, product, invariants, architecture and
> security) runs deterministic checks before a review agent covers what rules cannot express. When
> an agent keeps catching the same problem, that finding becomes a rule.
>
> **Law.**
> - **Goodhart's Law** — a measure that becomes a target stops measuring; so tests and rubrics live outside the agent's writable workspace and it cannot tune the scoreboard it is scored against.
> - **Kerckhoffs's principle** — the agent may *read* every rubric and every check it is judged by; the protection is that it cannot *change* them.
> - **Linus's Law** — given enough specialized eyeballs all bugs are shallow; the panel works because each reviewer hunts a different class of defect.

This is the AEOS repo's reference for turning Principle VI into concrete 2024–2026 tooling. It is a
map of options and an ordering discipline, not a script. The one rule that never bends: **a
deterministic gate runs to green before any LLM reviewer is spawned**, per panel seat and per column.

## What it demands, operationally

1. **Two phases, in order, never merged.** Phase 1 is a deterministic gate: compilers, linters,
   type checkers, unit/property tests, SAST, policy-as-code, secret and dependency scanners. Phase 2
   is the LLM review panel. Phase 2 does not start until Phase 1 is green — a red check is a hard
   stop, not an input the reviewer "weighs". In AEOS terms this is already load-bearing:
   `output-validation.ts` (word count, `requiresRepoDiff` for agentic `IMPLEMENTATION`) and the
   preflight pass gate the run *before* the reviewer agent is invoked inside `runAttempt`
   (`src/application/ticket-run.use-case.ts`).
2. **Five seats, five lenses.** engineering (does it work / is it maintainable), product (does it
   match the scenario and contract), invariants (does it violate a stated domain rule), architecture
   (does it respect the layering and dependency direction), security (does it leak, inject, or pull a
   bad dependency). Each seat gets its *own* deterministic checks first; the reviewer agent only sees
   what rules cannot yet express.
3. **The verdict is parsed, not read.** A reviewer's prose is advisory; the machine-actionable
   decision is a structured trailer. AEOS reads an `AEOS-VERDICT` HTML comment via
   `domain/services/verdict-parser.ts`; a missing or unparseable trailer **escalates**, it is never
   coerced to pass or reject. Substring-matching review prose misfires on the reviewer's own
   output-format template — do not do it.
4. **Rubrics are code, kept outside the writable scope.** Rubrics live as data under `.aeos/rubrics/`
   and column/agent specs under `.aeos/column-specs/` and `.aeos/agents/`, loaded and Zod-validated by
   `infrastructure/spec-loader/`. The agent under review reads them; it cannot edit them in the same
   run that it is judged by them (Kerckhoffs). The check definitions sit in CI config and in
   `tooling/` verifiers the agent does not own (Goodhart).
5. **Findings graduate into rules.** When a review agent flags the same defect across runs, promote
   it: write a Semgrep rule, a lint rule, an OPA policy, or a property test. The deterministic gate
   grows; the panel is freed to look for genuinely novel problems. This is the only sanctioned way the
   system "learns between runs" (agents do not — Principle XII).

## Reference architecture

```
                          ┌─────────────────────────────────────────┐
  worker produces  ──────▶│  PHASE 1 — DETERMINISTIC GATE (must pass) │
  artifact / diff         │                                           │
                          │  shared:  compile · typecheck · unit/prop │
                          │           tests · format                  │
                          │  per seat:                                │
                          │   engineering → lint, coverage, complexity│
                          │   product     → contract/Gherkin conform  │
                          │   invariants  → property tests, Conftest  │
                          │   architecture→ dep-cruiser / ArchUnit    │
                          │   security    → Semgrep, CodeQL, Trivy,   │
                          │                 gitleaks, OSV-Scanner      │
                          └───────────────────┬───────────────────────┘
                                              │ all green (SARIF → Security tab)
                                              ▼
                          ┌─────────────────────────────────────────┐
                          │  PHASE 2 — REVIEW PANEL (LLM, after gate) │
                          │  5 agents, each with a read-only rubric,  │
                          │  each emits an AEOS-VERDICT trailer        │
                          └───────────────────┬───────────────────────┘
                                              │ parsed verdicts
                                              ▼
                   verdict-parser → review-loop-policy → advance / retry / ESCALATE
                                              │
              recurring finding ─────────────┘  promote → new Semgrep/lint/OPA rule
```

The gate is where Principle VI meets **Principle IV** (*generators build the scaffold*). The
conformance verifiers under `tooling/` — `tooling/openapi-typescript`, `tooling/openapi-php-laravel`
(`scripts/verify-contract.php`), `tooling/openapi-kotlin-spring`, and the `sqlmigrations-*` DB-codegen
scaffolds — are **themselves deterministic checks that run inside Phase 1**: they refuse the build
when the contract drifts from the generated code, before any review agent is spawned. A contract
violation is caught by a verifier, not debated by a reviewer.

## CI / automation

Model the two phases as dependent CI jobs so the ordering is enforced by the pipeline, not by
convention. In GitHub Actions, a `needs:` edge makes the panel job literally unreachable until the
gate is green:

```yaml
jobs:
  gate:                      # PHASE 1 — deterministic, fans out per seat
    strategy:
      matrix:
        seat: [engineering, product, invariants, architecture, security]
    steps:
      - run: ./ci/gate.sh ${{ matrix.seat }}     # exits non-zero on any finding
      - uses: github/codeql-action/upload-sarif@v3  # findings → Security tab
        with: { sarif_file: ${{ matrix.seat }}.sarif }

  review-panel:              # PHASE 2 — LLM reviewers
    needs: [gate]            # ← cannot start until every gate seat passes
    steps:
      - run: aeos ticket run $TICKET   # reviewer agents emit AEOS-VERDICT trailers
```

Notes that keep the ordering honest:

- **One normalized output format: SARIF.** Semgrep, CodeQL, Trivy, Checkov, and most scanners emit
  SARIF; GitHub's `upload-sarif` aggregates them into the Security tab and PR annotations, so the
  gate speaks one dialect regardless of seat.
- **Fail closed.** Every Phase-1 step exits non-zero on a finding above threshold. A warn-only
  scanner is not a gate. Mirror the AEOS CI order locally — `typecheck → lint → build → test`
  (`npm run typecheck && npm run lint && npm run build && npm test`) before pushing.
- **Shift left with the same rules.** Run the fast gate members in `pre-commit`
  (https://pre-commit.com/) so the agent hits the same rule locally that CI enforces — identical
  config, no drift.
- **Keep the gate current automatically.** Pin scanner actions and rule packs, and let Renovate or
  Dependabot bump them; a stale ruleset silently stops catching new classes of defect.
- **Supply-chain gate.** `OSV-Scanner` on lockfiles and `Trivy fs`/`trivy config` on the tree run in
  the security seat; Dependabot/Renovate open the fix PRs. A vulnerable transitive dependency is a
  gate failure, not a reviewer's judgment call.

## Tooling options

| Tool | What it does | When to pick it |
| --- | --- | --- |
| [Semgrep](https://semgrep.dev/) | Fast pattern/dataflow SAST, write-your-own rules in YAML; SARIF out | Default per-PR gate for every language; **the promotion target** when a review finding becomes a rule |
| [CodeQL](https://codeql.github.com/) | Semantic query engine, deep taint tracking; native GitHub code scanning | Scheduled deep security pass; free for public repos. Pair with Semgrep on PRs |
| [SonarQube / SonarCloud](https://www.sonarsource.com/products/sonarqube/) | Quality gate: bugs, code smells, coverage, duplication, complexity | Engineering seat when you want a single pass/fail quality gate with trend history |
| [Open Policy Agent](https://www.openpolicyagent.org/) + [Conftest](https://www.conftest.dev/) | Policy-as-code in Rego over structured config (YAML/JSON/Terraform) | Invariants & architecture seats — assert rules over specs, manifests, `.aeos/*.yaml`, IaC |
| [Checkov](https://www.checkov.io/) | IaC/config misconfiguration scanning (Terraform, k8s, Dockerfile, GH Actions) | Security/architecture seat for infrastructure and pipeline hardening |
| [Trivy](https://trivy.dev/) | Vulns + misconfig + secrets across filesystem, images, IaC; SARIF | One scanner covering several security concerns in the security seat |
| [OSV-Scanner](https://google.github.io/osv-scanner/) | Lockfile deps vs the OSV vulnerability database | Dedicated dependency-vuln gate; cross-ecosystem, Google-maintained |
| [gitleaks](https://github.com/gitleaks/gitleaks) · [TruffleHog](https://github.com/trufflesecurity/trufflehog) | Committed-secret detection; TruffleHog verifies credentials against live services | Security seat + `pre-commit` so a secret never reaches CI in the first place |
| [Dependabot](https://docs.github.com/en/code-security/dependabot) · [Renovate](https://docs.renovatebot.com/) | Automated dependency and action update PRs | Keep deps and the scanners/rule packs themselves current; feeds the OSV gate |
| [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) · [ArchUnit](https://www.archunit.org/) | Assert allowed module/layer dependencies (JS/TS; JVM) | Architecture seat — enforce AEOS's `cli → application → domain ← infrastructure` and the `.js`-extension / no-imports-in-`domain` rules as a check |
| [ESLint](https://eslint.org/) · [Ruff](https://docs.astral.sh/ruff/) | Lint + autofix with custom rules | Engineering seat baseline; also a promotion target (AEOS already makes `no-explicit-any` an error) |
| [Danger JS](https://danger.systems/js/) | Code for PR conventions (changelog present, test touched, size) | Cheap deterministic checks on *process* a scanner won't express |
| [CodeRabbit](https://www.coderabbit.ai/) | LLM PR reviewer, inline comments + summaries | **Phase 2** general engineering/product review after the gate |
| [Qodo Merge / PR-Agent](https://github.com/qodo-ai/pr-agent) | Open-source diff-review agent, self-hostable with your own keys | **Phase 2** when you need to run the reviewer on your own infra/model |
| [Greptile](https://www.greptile.com/) | Repo-indexed review with whole-codebase context | **Phase 2** architecture/invariants seat needing cross-file context |
| [GitHub Copilot code review](https://docs.github.com/en/copilot/using-github-copilot/code-review/using-copilot-code-review) | Zero-setup LLM review in GitHub (GA April 2025) | **Phase 2** for GitHub-native shops; note Actions-minute billing on private repos from 2026-06-01 |

No single AI reviewer is sufficient: on Martian's independent Code Review Bench no tool found more
than ~63% of known issues in its first published run, and no benchmark measures false-positive rate on
*your* code — which is exactly why the deterministic gate carries the load it can, and why the panel is
plural (Linus's Law).

## Anti-patterns

- **Review-first.** Spawning the LLM panel before the gate is green. The reviewer wastes a turn
  re-reporting a type error the compiler already had, or worse, approves around it.
- **One omniscient reviewer.** A single "review everything" agent collapses five lenses into mush and
  surfaces Linus's-Law's weakness instead of its strength. Keep the seats distinct.
- **Verdict by prose.** Grepping the review text for "LGTM" / "reject". Use the parsed
  `AEOS-VERDICT` trailer; treat a missing/garbled trailer as an escalation.
- **Writable rubrics.** Letting the agent edit the rubric, lint config, or `tooling/` verifier in the
  same change it is judged by. That is Goodhart's trapdoor — the agent optimizes the scoreboard.
- **Warn-only "gates".** Scanners that log findings but exit 0. A gate that cannot fail is
  documentation.
- **Findings that never graduate.** The panel catches the same defect every week and nobody writes
  the Semgrep rule. The gate stagnates and reviewer cost compounds.
- **Suppression sprawl.** `# nosemgrep` / `// codeql[...]` / baseline files applied by the agent to
  silence a real finding. Suppressions belong to humans and should be reviewed like any rule change.

## Signals it's working

- The panel almost never reports something a check could have caught — those findings have graduated
  into rules. Reviewer comments trend toward design, product fit, and genuinely novel risk.
- Gate time is boringly stable and fails fast; the expensive LLM phase runs only on already-clean
  changes, so model spend per released change (a Principle XII metric) drops.
- The Semgrep/lint/OPA rule count rises over time, each rule traceable to a review finding it retired.
- `ESCALATED` means a human is genuinely needed (unparseable verdict, non-convergence, a blocker no
  rule yet covers), not "a check was red." Escalation and `FAILED` stay distinct.
- Panel override rate (how often a human overturns a verdict) is low and falling — the rubrics match
  what humans actually want.

## Related

- [`../../12_PRINCIPLES.md`](../../12_PRINCIPLES.md) — Principle VI in context of the other eleven.
- [`../../LAWS_BEHIND.md`](../../LAWS_BEHIND.md) — Goodhart, Kerckhoffs, and Linus stated in full.
- **Principle IV tooling (the gate's conformance checks):**
  [`../openapi-typescript`](../openapi-typescript),
  [`../openapi-php-laravel`](../openapi-php-laravel),
  [`../openapi-kotlin-spring`](../openapi-kotlin-spring),
  and the `sqlmigrations-*` scaffolds — their verifiers run *inside Phase 1*, before any reviewer.
- **In-repo mechanism:** `src/domain/services/verdict-parser.ts` (trailer parsing),
  `src/domain/services/review-loop-policy.ts` (what to do with the verdicts),
  `src/domain/services/output-validation.ts` (pre-review deterministic validation), and
  `src/application/ticket-run.use-case.ts` (`runAttempt`: worker → validate → commit → reviewer).
- **Rubrics & specs as read-only data:** `.aeos/rubrics/`, `.aeos/column-specs/`, `.aeos/agents/`,
  loaded by `src/infrastructure/spec-loader/`.

## Sources

- Semgrep — https://semgrep.dev/
- CodeQL / GitHub code scanning — https://codeql.github.com/
- Semgrep vs CodeQL (patterns vs semantic analysis, PR + scheduled split) — https://aicodereview.cc/blog/semgrep-vs-codeql
- SonarQube — https://www.sonarsource.com/products/sonarqube/
- Open Policy Agent — https://www.openpolicyagent.org/
- Conftest (Rego over structured config) — https://www.conftest.dev/
- Checkov — https://www.checkov.io/
- Trivy — https://trivy.dev/
- OSV-Scanner (lockfiles vs OSV database) — https://google.github.io/osv-scanner/
- gitleaks — https://github.com/gitleaks/gitleaks
- TruffleHog — https://github.com/trufflesecurity/trufflehog
- Dependabot — https://docs.github.com/en/code-security/dependabot
- Renovate — https://docs.renovatebot.com/
- SARIF support for GitHub code scanning — https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning-and-ides/about-sarif-support-for-code-scanning
- pre-commit — https://pre-commit.com/
- dependency-cruiser — https://github.com/sverweij/dependency-cruiser
- ArchUnit — https://www.archunit.org/
- ESLint — https://eslint.org/
- Ruff — https://docs.astral.sh/ruff/
- Danger JS — https://danger.systems/js/
- CodeRabbit — https://www.coderabbit.ai/
- Qodo Merge / PR-Agent (open-source, self-hostable) — https://github.com/qodo-ai/pr-agent
- Greptile (repo-indexed review) — https://www.greptile.com/
- GitHub Copilot code review (GA April 2025; Actions-minute billing from 2026-06-01) — https://docs.github.com/en/copilot/using-github-copilot/code-review/using-copilot-code-review
- AI code-review tool landscape & Code Review Bench (~63% first-run detection ceiling) — https://www.morphllm.com/github-ai-code-review
