# Principle I — Discipline is the control

> **Principle.** AI makes the engineering discipline of the last forty years more valuable, not
> obsolete. Domain-driven design, explicit contracts, tests, feature flags and continuous delivery
> are the controls that keep agent output correct. The agent writes faster than any human can read;
> the discipline is what stays trustworthy at that speed.
> **Law.** The Broken Windows Theory — visible neglect invites more neglect; an agent copies the
> patterns it finds in the tree, so one bad pattern repeats at machine speed until a check stops it.

AEOS is a pipeline of LLM agents driving tickets through columns (`IMPLEMENTATION → CODE_REVIEW →
QA → DONE`). Every agent reads the repository as its primary context. So "the codebase is the
prompt" is literally true. A stray `any`, a layering violation, a skipped test, a `console.log` left
in — each becomes a few-shot example the next agent imitates. Discipline that lives only in a wiki is
invisible to the agent, so it is not a control. **A control only counts if a machine enforces it and
a build fails without it.**

## What it demands, operationally

- **Every convention is executable.** If a rule matters, it is a lint rule, a fitness function, a
  type, a schema, or a CI gate — never prose alone. Prose in `CLAUDE.md`/`AGENTS.md` is a hint that
  reduces violations; the lint rule is the control that catches the ones that slip through.
- **The build is red on the first broken window.** Format drift, an import that crosses a layer
  boundary, a `TODO` masquerading as done, an unmapped generated type — each fails locally and in CI
  before a human (or a review agent) spends attention on it. This is Principle VI ("checks run first,
  review agents second") pulled all the way left.
- **Boundaries are enforced, not trusted.** AEOS's hexagonal direction (`cli → application → domain
  ← infrastructure`) is declared in `CLAUDE.md`, but the enforcement is a fitness function that fails
  if `domain/` imports a Node builtin or an npm package.
- **Deployment is separated from release.** Code merges to trunk continuously behind flags; exposure
  is a runtime decision. Short-lived branches and dark-launched code keep agent output integrating
  constantly instead of drifting into a big-bang merge.
- **The generated scaffold is off-limits to hand edits.** Contracts and schemas are generated and
  verified (Principle IV); the agent writes logic inside the generated shape, never around it. See
  the `tooling/` scaffolds cross-linked below.
- **New code inherits the standard automatically.** A fresh file is formatted, linted, boundary-checked
  and type-checked by the same config as every other file — there is no "the agent didn't know" path.

## Reference architecture

The goal is a tree where the correct pattern is the only pattern that compiles, so the agent cannot
copy a broken one. Four enforcement layers, innermost first:

1. **Formatter + linter — zero config drift, auto-fixed on save and on commit.** The formatter kills
   diff noise so review attention goes to logic. It also removes a whole class of surface patterns the
   agent would otherwise imitate. The linter encodes the "do not write it this way" rules as
   machine-checkable facts an agent reads through its failures.
   - TS/Node: [Biome v2](https://biomejs.dev/blog/biome-v2/) (one Rust binary for format + lint,
     type-aware rules without `tsc`, shipped mid-2025), or the classic [Prettier](https://prettier.io/)
     + [ESLint flat config](https://eslint.org/docs/latest/use/configure/configuration-files) pairing.
   - Kotlin/JVM: [ktlint](https://pinterest.github.io/ktlint/) (format) + [detekt](https://detekt.dev/)
     (smells, complexity, forbidden APIs).
   - PHP: [PHP-CS-Fixer](https://cs.symfony.com/) (format) + [PHPStan](https://phpstan.org/) at a high
     `level` (static analysis).

2. **Architecture fitness functions.** A unit-testable assertion over the dependency graph that fails
   the build on an illegal edge. _Reasoning:_ DDD module boundaries only hold if something measures
   them; an agent will happily import `infrastructure` into `domain` if one existing file already did.
   - TS/Node: [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) (declarative
     `forbidden` rules over the import graph — the natural fit for AEOS's hexagonal direction),
     [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) (layer rules
     as lint errors inline in the editor), or [ts-arch](https://github.com/ts-arch/ts-arch) (ArchUnit-style
     assertions inside the test suite).
   - Kotlin/JVM: [ArchUnit](https://www.archunit.org/) (layered-architecture and
     naming assertions as JUnit tests) and, for a module-per-aggregate DDD layout,
     [Spring Modulith](https://spring.io/projects/spring-modulith) verification.
   - PHP: [Deptrac](https://github.com/qossmic/deptrac) (layer-to-layer ruleset, CI-failing) and
     PHPStan rules.
   - Python (polyglot services): [import-linter](https://github.com/seddonym/import-linter) (layered
     and independence contracts).

3. **Contracts and schemas as the generated scaffold.** The API surface and DB schema are generated
   from a spec a human owns and verified so no hand edit or silent no-op slips through — this is the
   boundary Principle IV defends. In AEOS this already exists as the `tooling/` scaffolds (OpenAPI →
   TS/Kotlin/PHP, SQL migrations → TS/Kotlin). A generated type that an agent cannot hand-edit is the
   strongest possible broken-windows control: there is no window to break.

4. **Pre-commit hooks + CODEOWNERS + trunk-based CD.** This layer makes feedback fast and routes
   control changes to a human.
   - [lefthook](https://github.com/evilmartians/lefthook) (single Go binary, `{staged_files}` filtering,
     replaces Husky + lint-staged) or the Python [pre-commit](https://pre-commit.com/) framework runs
     layers 1–2 on staged files. First feedback is sub-second and local.
   - [CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
     routes the generated scaffold and the fitness-function config to the blueprint owner (Principle X).
     An agent's PR touching those files always pulls a required human reviewer.
   - [Trunk-based development](https://trunkbaseddevelopment.com/) plus feature flags keeps integration
     continuous and separates deploy from release (Principle VIII).

**Encoding conventions where agents read them.** `CLAUDE.md` / [AGENTS.md](https://agents.md/) are the
agent-facing layer. State the boundary, the naming rule, the "don't reintroduce X" invariant there.
But treat them as reinforcement, not enforcement. Leave anything a linter can check to the linter;
reserve the markdown for what the agent cannot infer from the code. AEOS's own `CLAUDE.md` is a model
of this. It names the invariants (lazy DB singletons, `.js` import extensions, verdict-trailer
parsing), and the repo backs the mechanical ones with ESLint (`no-explicit-any` as error),
`tsc --strict`, and the `template-source.test.ts` guard.

## CI / automation

Match the local pipeline to CI exactly so "works on my machine" is impossible. AEOS CI already runs
`typecheck → lint → build → test` on Node 22; the discipline gates generalize to:

```yaml
# .github/workflows/discipline.yml  (shape, not a drop-in)
on: [pull_request, merge_group]      # merge_group = merge-queue, keeps trunk green
jobs:
  guardrails:
    steps:
      - run: <format> --check          # biome ci / prettier --check / ktlint / php-cs-fixer --dry-run
      - run: <lint>                     # biome lint / eslint / detekt / phpstan analyse
      - run: <typecheck>                # tsc --noEmit  (strict)
      - run: <arch-fitness>             # depcruise --config / archunit test / deptrac analyse / lint-imports
      - run: <generate-and-verify>      # the tooling/ scaffolds: regenerate, fail on drift / unmapped type
      - run: <test>                     # unit + contract tests
      - run: <flag-debt-check>          # fail if a release flag is older than its max age (optional)
```

Rules that make the gate real:

1. **Pre-commit runs the fast subset** (format, lint, typecheck on staged files) via lefthook/pre-commit
   so the agent's loop gets feedback before CI.
2. **Every gate is `--check` / fail-mode, never auto-fix in CI.** Auto-fixing in CI hides the broken
   window instead of surfacing it; fix locally, commit the fix.
3. **Required status checks + a merge queue** keep trunk continuously green; a short-lived branch
   cannot merge past a red fitness function.
4. **The generate-and-verify step is non-negotiable** — it is the Principle IV gate, and it must run
   in CI even where it needs Docker (see `sqlmigrations-typescript`).
5. **CODEOWNERS on config files** — `biome.json`, `.dependency-cruiser.cjs`, `deptrac.yaml`, the
   `*-policy.*` files in `tooling/` — so loosening a control requires the blueprint owner's review.

## Tooling options

| Tool | What it does | When to pick it |
|---|---|---|
| [Biome v2](https://biomejs.dev/blog/biome-v2/) | Rust format + lint for TS/JS, type-aware rules without `tsc` | TS/Node greenfield or when ESLint+Prettier startup cost hurts the agent loop |
| [ESLint flat config](https://eslint.org/docs/latest/use/configure/configuration-files) + [Prettier](https://prettier.io/) | Mature lint + format, huge plugin ecosystem | TS/Node where custom/legacy rules (incl. AEOS's `no-explicit-any`) are needed |
| [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) | Declarative forbidden-dependency rules over the import graph | TS/Node hexagonal/DDD boundary enforcement (AEOS's `cli→application→domain←infra`) |
| [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) | Layer/element boundaries as inline ESLint errors | TS/Node when you want the boundary violation in the editor, not just CI |
| [ts-arch](https://github.com/ts-arch/ts-arch) | ArchUnit-style architecture assertions in the test suite | TS/Node teams that prefer boundaries as tests |
| [ktlint](https://pinterest.github.io/ktlint/) | Kotlin formatter + basic lint | Kotlin/JVM formatting baseline |
| [detekt](https://detekt.dev/) | Kotlin static analysis: smells, complexity, forbidden APIs | Kotlin/JVM deeper quality gate |
| [ArchUnit](https://www.archunit.org/) | JVM architecture rules as JUnit tests | Kotlin/Java layered-architecture + naming enforcement |
| [Spring Modulith](https://spring.io/projects/spring-modulith) | Verifies module/aggregate boundaries at test time | Kotlin/Java modular-monolith DDD layouts |
| [PHP-CS-Fixer](https://cs.symfony.com/) | PHP formatter / style fixer | PHP formatting baseline |
| [PHPStan](https://phpstan.org/) | PHP static analysis at tunable levels | PHP correctness + forbidden-pattern gate |
| [Deptrac](https://github.com/qossmic/deptrac) | PHP layer-to-layer dependency ruleset | PHP hexagonal/DDD boundary enforcement |
| [import-linter](https://github.com/seddonym/import-linter) | Layered/independence contracts for Python | Python services in a polyglot repo |
| [lefthook](https://github.com/evilmartians/lefthook) | Single-binary Git hook manager, staged-file filtering | Polyglot pre-commit; replaces Husky + lint-staged |
| [pre-commit](https://pre-commit.com/) | Multi-language hook framework with a plugin registry | Polyglot pre-commit where Python tooling dominates |
| [CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners) | Routes required reviewers by path | Any repo; gate the generated scaffold + fitness-function config |
| [OpenFeature](https://openfeature.dev/) | CNCF vendor-neutral flag-evaluation API + SDKs | Any stack; abstract over the flag vendor so app code isn't locked in |
| [Unleash](https://www.getunleash.io/) | Self-hostable flag platform behind OpenFeature | Teams wanting OSS, self-hosted flag control (separate deploy from release) |
| [trunk-based development](https://trunkbaseddevelopment.com/) | Short-lived branches, continuous integration to trunk | The branching discipline that keeps agent output from drifting |

## Anti-patterns

- **Conventions that live only in docs.** A style guide no linter enforces is decoration; the next
  agent reads the code, not the guide, and copies whatever is actually there.
- **Warnings instead of errors.** A warning is a window left broken. `no-explicit-any` as a warning
  (AEOS makes it an error) means `any` spreads at machine speed.
- **Auto-fixing in CI to keep it green.** Hides the broken window; the agent never learns the pattern
  was wrong and the drift accumulates in the config, not the code.
- **Hand-editing generated files.** Defeats Principle IV and teaches the next agent the scaffold is
  negotiable. Fix the spec/policy, regenerate.
- **Long-lived feature branches.** Agent output drifts from trunk into a conflict-prone big-bang merge
  that is hard to review — the opposite of "integrate continuously, flag the unfinished path off."
- **`@ts-ignore` / `// eslint-disable` / `@phpstan-ignore` without a cited reason.** Each is a sanctioned
  broken window; require an issue link and a CODEOWNERS-gated review to add one.
- **Permanent feature flags.** A release flag that never gets removed is dead conditional logic agents
  must reason around forever; flags are temporary (weeks/months) — track and retire them.

## Signals it's working

- A new agent-authored file is indistinguishable in style/structure from a hand-written one, with no
  reviewer comments about formatting or layering.
- The first failure an agent hits on a bad change is a local hook or a CI gate, not a human reviewer.
- Zero net-new `any` / `disable` / `ignore` directives land without a cited justification.
- Fitness-function violations trend to zero and stay there; the import graph stays acyclic and layered.
- Trunk is green continuously; deploys are routine and decoupled from releases; flags are retired on a
  schedule rather than accumulating.
- The `tooling/` generate-and-verify steps catch spec/schema drift before review (Principle VI).

## Related

- Repo scaffolds (Principle IV, the generated-scaffold controls this principle relies on):
  [`tooling/openapi-typescript`](../openapi-typescript),
  [`tooling/openapi-kotlin-spring`](../openapi-kotlin-spring),
  [`tooling/openapi-php-laravel`](../openapi-php-laravel),
  [`tooling/sqlmigrations-typescript`](../sqlmigrations-typescript),
  [`tooling/sqlmigrations-kotlin-spring`](../sqlmigrations-kotlin-spring).
- Sibling principles: **II Agents are first-day engineers** (they inherit, so the controls must teach),
  **III Humans write the specification** (the spec the generators consume), **IV Generators build the
  scaffold** (the off-limits generated shape), **V Every decision is traceable**, **VI Checks run first,
  review agents second** (the gates here run before any review agent), **VIII Deploy continuously,
  release deliberately** (trunk-based CD + flags), **X Engineer owns the blueprint** (CODEOWNERS on
  config).

## Sources

- [Biome v2 — type-aware linting without tsc (biomejs.dev)](https://biomejs.dev/blog/biome-v2/)
- [ESLint flat config (eslint.org)](https://eslint.org/docs/latest/use/configure/configuration-files)
- [Prettier](https://prettier.io/) · [PHP-CS-Fixer](https://cs.symfony.com/) · [PHPStan](https://phpstan.org/)
- [ktlint](https://pinterest.github.io/ktlint/) · [detekt](https://detekt.dev/)
- [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) · [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) · [ts-arch](https://github.com/ts-arch/ts-arch)
- [ArchUnit](https://www.archunit.org/) · [Spring Modulith](https://spring.io/projects/spring-modulith) · [Deptrac](https://github.com/qossmic/deptrac) · [import-linter](https://github.com/seddonym/import-linter)
- [lefthook (evilmartians)](https://github.com/evilmartians/lefthook) · [pre-commit](https://pre-commit.com/)
- [GitHub CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
- [Trunk-based development](https://trunkbaseddevelopment.com/)
- [Unleash — trunk-based development with feature flags](https://docs.getunleash.io/guides/trunk-based-development)
- [OpenFeature (CNCF)](https://openfeature.dev/) · [OpenFeature becomes a CNCF incubating project (SD Times)](https://sdtimes.com/feature-flags/openfeature-feature-flagging-api-becomes-a-cncf-incubating-project/)
- [LaunchDarkly](https://launchdarkly.com/)
- [AGENTS.md open convention (agents.md)](https://agents.md/) · [AGENTS.md adoption (InfoQ)](https://www.infoq.com/news/2025/08/agents-md/)
</content>
</invoke>
