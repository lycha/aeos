# Principle II — Agents are first-day engineers, every day

> **Principle.** An agent gets real trust and autonomy inside explicit guardrails. It remembers
> nothing from yesterday and sees only what has been written down, so the team writes down
> everything it needs.
>
> **Law.** The Stochastic Parrot — a model emits statistically likely text, so fluent output is no
> evidence of correctness; you rely on guardrails, not on trust in the prose.

Treat every agent run as a competent engineer's **first hour on the job**: capable, fast, and
completely without institutional memory. It knows nothing you did not hand it in the prompt, it
cannot be "told once and trusted," and it will produce confident, well-formatted output whether or
not that output is right. The engineering answer is not better trust — it is **context engineering**
(make the written-down world complete), **least-privilege execution** (make the blast radius small),
and **deterministic guardrails** (check the work mechanically, never believe it because it reads
well). This is the operational twin of Principle I (Discipline is the control) and the enabling
condition for Principle VI (Checks first, review agents second).

## What it demands, operationally

- **The repo is the agent's entire world.** Anything not committed — a decision made in Slack, a
  convention "everyone knows," yesterday's run — does not exist. Conventions live in `AGENTS.md` /
  `CLAUDE.md` at the root (and nearest-wins copies in subtrees), specs and decisions in versioned
  files, and task context is assembled, not assumed.
- **No cross-run memory is a feature, not a gap.** Runs are stateless and reproducible. Every input
  an agent needs is a committed artefact; every output it produces becomes one. "It worked last time"
  is never an explanation, because there is no "last time" the agent can see.
- **Context is assembled by code, before the model runs.** A deterministic pre-flight stage gathers
  spec + constraints + rubric + ticket history into the prompt. The model never goes fishing for
  context it might miss; the harness decides what it sees.
- **Tools are allow-listed, not trusted.** The agent gets the narrowest set of tools and paths that
  the task needs — read here, write there, run these commands, reach these domains — enforced by the
  harness and the OS, not by asking the model nicely.
- **Execution is sandboxed and ephemeral.** Agents run in containerized / microVM / reproducible
  environments that are destroyed after the run. A bad command, a prompt injection, or a hallucinated
  `rm -rf` is contained to a disposable box, not the developer's laptop or prod credentials.
- **Correctness is proven mechanically.** Fluent prose, a green-looking diff, and a confident "done"
  earn zero trust. Types, tests, linters, schema/contract conformance, and a parsed verdict trailer
  decide whether the work advances — see Principle VI.

## Reference architecture

How AEOS already embodies this, and the general pattern to copy:

- **Context assembly as a gate.** `aeos-core/src/application/services/context-assembler.ts` and
  `prompt-builder.ts` build the agent's world from committed sources: the ticket's spec/artifacts,
  `.aeos/CONSTRAINTS.md` (project architecture/style/security rules), the column's rubric, and prior
  transition history. The agent sees exactly this and nothing more — the written-down world is the
  world.
- **Pre-flight before `WORKING`.** `preflight.ts` runs first and can return `ESCALATED` with blockers
  rather than letting a confident but under-specified agent proceed. This is "don't start the shift
  until the brief is complete," in code.
- **Specs/agents/rubrics are data, not prompts in code.** `.aeos/column-specs/*.yaml`,
  `.aeos/agents/*.yaml`, `.aeos/rubrics/`, validated by Zod in `infrastructure/spec-loader/`. The
  agent's instructions are reviewable, diffable artefacts — the onboarding packet is in git.
- **Executors are swappable, capability-scoped adapters.** `infrastructure/executor/` wraps external
  agent CLIs (`claude-cli-executor.adapter.ts`, `auggie-cli-…`, `opencode-cli-…`, `ollama-cli-…`,
  `stub-…`) behind a two-method `Executor` port (`run`, `interrupt`). Resolution is
  override → `.aeos/project.json` → agent spec → built-in default (`executor-config-resolver.ts`).
  `ollama-cli` is artifact-only and **rejected** for agentic `IMPLEMENTATION` — a capability
  guardrail, not a preference.
- **Statelessness enforced by storage design.** SQLite at `~/.aeos/state.db` is the source of truth;
  artefacts live under `<project>/.aeos/tickets/<id>/` and are the only thing git carries. There is
  no hidden agent scratch memory between runs — if it matters, it is a row or a committed file.
- **The `stub` executor is the no-trust test harness.** `AEOS_EXECUTOR=stub` exercises the full
  pipeline deterministically (role-aware: `NO_BLOCKERS` for preflight, an `AEOS-VERDICT` trailer for
  reviews). The whole machine runs with zero fluency and still has to pass the guardrails.
- **Skill reinforcement, prompt as the portable carrier.** `skills/aeos/SKILL.md` is symlinked into
  each backend's skills dir, but the load-bearing instruction (e.g. the `TASK_BREAKDOWN` architect's
  `taskInstruction`) lives in the prompt so every executor gets it regardless of skill support — you
  write it down where the agent cannot fail to see it.

The portable shape, for any stack:

```
spec + decisions (git)  ─┐
AGENTS.md / CLAUDE.md    ─┤→ context assembler → prompt → agent (sandbox, allow-listed tools)
rubric + constraints     ─┘                                   │
                                                              ▼
                              deterministic checks (types/tests/lint/contract) → parsed verdict
                                                              │
                                      pass → advance    │    fail → retry / escalate (human gate)
```

## CI / automation

- **A committed `AGENTS.md` / `CLAUDE.md` is a required file, checked in CI.** Lint that the root
  instruction file exists and that per-package subtrees that agents touch carry their own
  nearest-wins copy. If an agent needs to know it, a human wrote it down and CI proves it is there.
- **Agents run in ephemeral CI sandboxes with egress policy, never on a trusted runner with broad
  creds.** Use GitHub Actions with a scoped `GITHUB_TOKEN` (`permissions:` block set to least
  privilege), network egress filtering (e.g. StepSecurity Harden-Runner), and short-lived OIDC for
  cloud access instead of long-lived secrets.
- **Context assembly is reproducible and logged.** Persist the exact assembled prompt/context per run
  as an artefact so "why did it do that?" is answerable from inputs, not vibes (ties to Principle V,
  traceability).
- **Guardrails are the merge gate, not the review agent's opinion.** typecheck → lint → build → test
  (AEOS runs exactly this order on Node 22) plus schema/contract conformance from the `tooling/`
  generators (Principle IV). A review agent's verdict is parsed from a structured trailer
  (`AEOS-VERDICT` HTML comment via `domain/services/verdict-parser.ts`), never substring-matched out
  of prose — a missing/unparseable verdict **escalates**, it is never coerced to a pass.
- **Pin the agent runtime.** Pin model/version, executor CLI version, and the devcontainer/Nix lock
  in the repo so a run is reproducible and an upgrade is a reviewed diff, not a silent drift.
- **Permission config is code-reviewed.** `.claude/settings.json` `permissions.allow/ask/deny`, MCP
  `tool_filter` allow-lists, and devcontainer definitions live in the repo and change only through
  PR. `deny` precedence and `disableBypassPermissionsMode` are set in managed/enterprise settings so
  an agent cannot self-escalate.

## Tooling options

| Tool | What it does | When to pick it |
| --- | --- | --- |
| [AGENTS.md](https://agents.md) | Open, Linux-Foundation-stewarded plain-Markdown convention for repo-level agent instructions; read by Codex, Cursor, Jules, Copilot, Aider, goose, Gemini CLI, Zed, Amp, Augment and more | Default "written-down world" file for any repo; one format most agents already read |
| [Claude Code memory — CLAUDE.md](https://docs.claude.com/en/docs/claude-code/memory) | Hierarchical `CLAUDE.md` (enterprise → project → user), `@`-imports, nearest-wins in subtrees | You use Claude Code and want layered, importable conventions; keep `AGENTS.md` as the portable root |
| [Claude Code settings & permissions](https://docs.claude.com/en/docs/claude-code/settings) | `permissions.allow/ask/deny` rules (`Bash(git:*)`, `Read(src/*)`), deny-wins precedence, managed-only mode, `disableBypassPermissionsMode` | Least-privilege tool/path/command scoping you can commit and enforce per project |
| [Claude Code sandboxing](https://docs.claude.com/en/docs/claude-code/sandboxing) | OS-level isolation of the bash tool: bubblewrap (Linux/WSL2) + socat proxy, `sandbox-exec` (macOS); writes confined to workdir, first-use prompt on each new network domain, `failIfUnavailable` | Containing untrusted command execution without a prompt on every call |
| [Dev Containers spec (containers.dev)](https://containers.dev/) | `devcontainer.json` reproducible, declarative dev environment; one image for human + agent | Baseline reproducible env; agents and CI run the same pinned toolchain |
| [Nix flakes](https://nixos.wiki/wiki/Flakes) + [direnv / nix-direnv](https://github.com/nix-community/nix-direnv) | Fully pinned, hash-locked environments (`flake.lock`) auto-activated on `cd` | Strongest reproducibility; "no cross-run memory" extends to a byte-identical toolchain |
| [E2B](https://e2b.dev/) | Firecracker-microVM sandboxes with a per-sandbox kernel, sub-second boot, ephemeral by default | Running agent-authored/untrusted code with strong kernel isolation and low latency |
| [Daytona](https://www.daytona.io/) | Open-source, self-hostable ephemeral dev-environment platform (selectable isolation: Docker/seccomp, Kata, Sysbox) | Self-hosted standardized agent dev environments you control |
| [Firecracker](https://firecracker-microvm.github.io/) / [gVisor](https://gvisor.dev/) / [Kata Containers](https://katacontainers.io/) | The isolation primitives themselves — microVMs and user-space-kernel sandboxes | You build your own sandbox tier and need to choose the isolation/latency tradeoff |
| [StepSecurity Harden-Runner](https://github.com/step-security/harden-runner) | Network egress filtering + runtime monitoring for GitHub Actions runners | Default-deny network egress for agent/CI runs; catch exfiltration and surprise domains |
| [OpenAI Agents SDK tool filters](https://openai.github.io/openai-agents-python/mcp/) | `create_static_tool_filter(allowed_tool_names=…, blocked_tool_names=…)` + dynamic filters on MCP servers; hosted-tool `require_approval` | OpenAI-stack agents: restrict which MCP tools a given agent can even see |
| [Anthropic MCP](https://modelcontextprotocol.io/) | Standard protocol for exposing tools/data to agents with explicit, enumerable tool surfaces | Giving agents capabilities as an auditable, allow-listable set rather than ad-hoc shell access |
| [Anthropic: Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | Reference practice: curate the token budget — write, select, compress, isolate; sub-agents with isolated context | The "why" behind assembly-before-run and keeping the main agent's context clean |

## Anti-patterns

- **Trusting fluency.** Advancing a ticket because the agent "sounds sure" or the prose reads clean.
  The Stochastic Parrot: readability is uncorrelated with correctness. Parse a structured verdict and
  run the checks.
- **Oral tradition.** Conventions that live only in a teammate's head, a chat thread, or a past run.
  The agent cannot read any of them. If it is not committed, it does not exist.
- **Context by fishing.** Letting the agent decide what to go read mid-task instead of assembling the
  needed spec/constraints/rubric deterministically up front. It will miss things, confidently.
- **God-mode agents.** `--dangerously-skip-permissions`, broad `Bash(*)`, write access to the whole
  filesystem, long-lived cloud creds on the runner. One hallucination or injected instruction then
  has unbounded blast radius.
- **Open network egress.** An agent that can reach any domain can exfiltrate secrets or pull in
  poisoned content. Default-deny egress; allow-list the few domains a task needs.
- **Persistent agent state.** A long-lived "memory" the agent mutates and reuses across runs that is
  not a reviewed, committed artefact. It becomes unreproducible, untraceable drift.
- **Coercing a missing verdict.** Treating an absent/unparseable reviewer trailer as a pass (or a
  substring-matched pass). It must escalate — see `verdict-parser.ts`.
- **Prompt-only guardrails.** "Please don't touch prod" in the system prompt is not a control. The
  permission layer and the sandbox are the control.

## Signals it's working

- A run is reproducible from committed inputs alone: wipe all local state, re-run, same context
  assembled, same checks applied.
- A new agent backend (`stub` → `claude-cli` → `auggie`/`opencode`) drops in with no change to what
  the agent is trusted with, because trust lives in the harness, not the model.
- Every agent action maps to an explicit allow-listed tool/path/domain; the deny list and sandbox
  config are short, reviewed, and rarely need exceptions.
- "Why did it do that?" is always answerable from the persisted prompt/context + transition log — no
  appeal to hidden memory.
- Prompt-injection and hallucinated-command incidents are non-events: contained to an ephemeral
  sandbox, blocked by egress policy, caught by checks before merge.
- Onboarding a human and onboarding an agent use the same artefacts (`AGENTS.md`, specs,
  `CONSTRAINTS.md`, devcontainer) — because both are first-day engineers reading the same written-down
  world.

## Related

- **Principle I — Discipline is the control.** Guardrails only work if they are mandatory; this
  principle is where that discipline becomes per-run isolation and permission policy.
- **Principle IV — Generators build the scaffold.** The `tooling/` codegen scaffolds are the
  contract-conformance guardrails the agent's output is checked against.
- **Principle V — Every decision is traceable.** Statelessness + persisted assembled context is what
  makes a run auditable.
- **Principle VI — Checks first, review agents second.** The deterministic-checks-over-trust half of
  this principle, stated as a rule for the review pipeline.
- **Principle VII — Humans hold three gates.** Least-privilege autonomy still terminates at a human
  approval gate; `ESCALATED` is how the agent hands back control.

## Sources

- AGENTS.md open convention and compatible tools — <https://agents.md>
- Claude Code settings & permissions (`allow`/`ask`/`deny`, deny-precedence, managed mode) — <https://docs.claude.com/en/docs/claude-code/settings>
- Claude Code native sandboxing (bubblewrap, socat proxy, `sandbox-exec`, per-domain network prompts) — <https://docs.claude.com/en/docs/claude-code/sandboxing>
- Claude Code memory / `CLAUDE.md` hierarchy & imports — <https://docs.claude.com/en/docs/claude-code/memory>
- Anthropic, "Effective context engineering for AI agents" — <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>
- Dev Container specification — <https://containers.dev/>
- Nix Flakes — <https://nixos.wiki/wiki/Flakes> · nix-direnv — <https://github.com/nix-community/nix-direnv>
- E2B (Firecracker-microVM sandboxes) — <https://e2b.dev/>
- Daytona (open-source ephemeral dev environments) — <https://www.daytona.io/>
- Firecracker — <https://firecracker-microvm.github.io/> · gVisor — <https://gvisor.dev/> · Kata Containers — <https://katacontainers.io/>
- StepSecurity Harden-Runner (CI egress filtering) — <https://github.com/step-security/harden-runner>
- OpenAI Agents SDK, MCP tool filtering (`create_static_tool_filter`, `require_approval`) — <https://openai.github.io/openai-agents-python/mcp/>
- Model Context Protocol — <https://modelcontextprotocol.io/>
- The Stochastic Parrot (Hacker Laws) — <https://github.com/dwmkerr/hacker-laws#the-stochastic-parrot>
