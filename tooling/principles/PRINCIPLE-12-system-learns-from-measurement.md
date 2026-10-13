# Principle XII — The system learns from measurement

> **Principle.** Delivery is judged on the DORA metrics — with lead time measured both **to deployment**
> and **to release** — alongside spec amendments, time waiting at human gates, the panel's override rate,
> and model spend per released change. Agents do not learn between runs, so the **evaluations tune the
> system**, not the agents: which gates still need a human, and the smallest model good enough for each
> task.
>
> **Law.** _Twyman's Law_ — any figure that looks surprising or too good is probably a measurement
> error; chase the pipeline bug before the celebration. _Jevons' Paradox_ — cheaper code means more code
> and therefore more review, so model spend and review capacity are instrumented from day one, not
> bolted on once the bill arrives.

AEOS is the system under measurement. A ticket is an epic or task moving through a fixed column
sequence (`domain/services/state-machine.ts`); every column has a worker, a reviewer with rubrics, and
a human approval gate. This principle is about the data exhaust of that machine and the offline loop
that retunes it — because the agents themselves are stateless between runs, the only thing that
actually learns is the configuration: column specs, which gates stay manual, and the model assigned to
each agent.

## What it demands, operationally

- **Two lead-time clocks, not one.** `IN_REVIEW → SIGNED_OFF` is not the finish line. Measure lead time
  to **deployment** (merged/shipped behind a flag — Principle VIII) and separately to **release**
  (reaching users). A ticket that is `DONE` in SQLite but sitting undeployed is lead-time debt the
  single-clock view hides.
- **The four DORA keys, computed from the transition log, not vibes.** Deployment frequency, change lead
  time, change-fail percentage, failed-deployment recovery time
  ([dora.dev](https://dora.dev/guides/dora-metrics-four-keys)). The authoritative event source is the
  `transitions` table plus deploy/release events joined in from CI and the deploy target.
- **Four AEOS-native metrics** that DORA does not cover:
  1. **Spec-amendment rate** — how often `PRODUCT_SCOPING`/`TECH_SPEC` artifacts are edited *after* a
     downstream column started. High rate = scoping is cheap talk; the spec is being written in
     implementation. Sourced from artifact git history under `<project>/.aeos/tickets/<id>/`.
  2. **Human-gate wait time** — wall-clock a ticket spends in `SIGNED_OFF` awaiting `ticket approve`.
     This is the queue that AI throughput exposes; it is usually the real lead-time bottleneck.
  3. **Panel override rate** — how often a human reverses the reviewer panel's verdict at the gate
     (Principle VI). The single most important input to Principle VII: a gate whose humans rarely
     override has earned a shot at autonomy.
  4. **Model spend per released change** — total executor cost (worker + reviewer + retries) divided by
     changes that actually reached release. Retries and escalations are the numerator's silent inflator.
- **Evals decide, dashboards describe.** The offline evaluation suite is what grants a gate autonomy or
  demotes a model — not a human eyeballing a Grafana panel. Dashboards exist to surface Twyman
  anomalies and Jevons cost creep, nothing more.
- **Every number is falsifiable from the trace.** If "why did lead time drop 40%?" cannot be answered
  from stored spans and transitions, the metric is decoration.

## Reference architecture

The stack is three layers: **instrument** (emit), **aggregate** (compute metrics), **evaluate** (decide
config changes). AEOS already has the authoritative substrate — SQLite `transitions`, per-run costs, and
the `TicketRunObserver` event stream — so instrumentation is mostly *exporting* what exists, not
inventing new bookkeeping.

**1. Instrument — OpenTelemetry traces over the pipeline.**
Wrap one `TicketRunUseCase.execute()` as a root span, with child spans for each loop phase the observer
already emits (`ticket-run.working`, `…validate`, `…commit`, `…review`, `…verdict`). Executor calls
become `gen_ai.*` spans carrying `gen_ai.request.model`, token counts, and cost — follow the
OpenTelemetry **GenAI semantic conventions** so the data is portable across backends (the conventions
have moved to their own repo and are still evolving, so pin a convention version:
[opentelemetry.io/docs/specs/semconv/gen-ai](https://opentelemetry.io/docs/specs/semconv/gen-ai/)). The
cleanest AEOS seam is a decorator on the `createExecutor(agentSpec)` factory in `container.ts`, so worker
and reviewer executors are both traced without touching domain code. A span's attributes should let you
reconstruct: which agent, which column, which model, how many revision-loop iterations, and whether the
exit was `SIGNED_OFF`, `ESCALATED`, or `FAILED` (the escalation-is-not-failure invariant must survive
into the trace).

**2. Aggregate — DORA + LLM observability backends.**
- **DORA:** feed deploy/release events (from CI and the deploy target) plus AEOS transition events into a
  DORA computer. **Apache DevLake** ([devlake.apache.org](https://devlake.apache.org/)) is the open
  self-hostable choice with prebuilt DORA dashboards; **Google Four Keys**
  ([github.com/dora-team/fourkeys](https://github.com/dora-team/fourkeys)) is the original reference
  pipeline but the repo is archived/unmaintained as of 2024, so treat it as a pattern, not a dependency.
  **Faros AI** ([faros.ai](https://faros.ai/)) is the managed option that attributes metrics per
  team/app in a monorepo.
- **LLM cost + traces:** route executor calls through an LLM gateway so spend is captured at the edge,
  independent of the agent code. **Langfuse** ([langfuse.com](https://langfuse.com/)) for deep,
  workflow-topology tracing and eval storage; **Helicone** ([helicone.ai](https://www.helicone.ai/)) for
  near-zero-code proxy-based cost tracking, caching, and rate limiting; **LiteLLM**
  ([litellm.ai](https://www.litellm.ai/)) as a unified proxy/router across providers with per-key
  budgets — the natural place to implement model routing (below); **OpenMeter**
  ([openmeter.io](https://openmeter.io/)) when spend must become metered/chargeback data per project.
  AEOS already shells out to `claude`, `auggie`, `opencode` CLIs, so the gateway sits behind those via
  `base_url`/env, not in the hot path of `domain/`.

**3. Evaluate — offline eval suite that tunes the config.**
This is where "the system learns." Build a versioned eval set of real tickets (inputs + the artifacts a
human eventually signed off). Then run two kinds of offline eval:
- **Gate-autonomy evals** (feeds Principle VII): for a candidate gate, replay historical runs and compare
  the reviewer panel's verdict to the human's final decision. Low override rate + high agreement on the
  eval set = the gate can drop to advisory/auto. **Promptfoo**
  ([promptfoo.dev](https://www.promptfoo.dev/)) for declarative YAML eval configs in CI; **Braintrust**
  ([braintrust.dev](https://www.braintrust.dev/)) or **Langfuse** for stored eval runs with regression
  tracking; **OpenAI Evals** ([github.com/openai/evals](https://github.com/openai/evals)) and **DeepEval**
  ([github.com/confident-ai/deepeval](https://github.com/confident-ai/deepeval), pytest-style) for custom
  scoring; **Ragas** ([docs.ragas.io](https://docs.ragas.io/)) only where a column does retrieval.
- **Model-right-sizing evals** (the "smallest model good enough" test): run each column's task against a
  ladder of models (e.g. Haiku → Sonnet → Opus) on the eval set, score quality, and pick the cheapest
  model whose quality clears the column's bar. The winner becomes the agent's `defaultExecutor`/model in
  `.aeos/agents/*.yaml`; LiteLLM then enforces the choice as a **cascade/router** (cheap model first,
  escalate on low confidence). Because agents are stateless, this re-tuning *is* the learning loop, and
  it re-runs whenever models, prompts, or rubrics change.

Beware **LLM-as-a-judge bias** (position, verbosity): the reviewer panel and the eval scorer are both
LLMs, so a model-right-sizing result that says "the cheapest model is also the best reviewer" is a prime
Twyman candidate — verify against human labels before acting.

## CI / automation

- **Eval gate in CI.** The offline eval suite runs in GitHub Actions alongside the existing
  typecheck → lint → build → test chain. A prompt, rubric, or model change that regresses the gate-autonomy
  or right-sizing eval fails the PR. Promptfoo and DeepEval both have first-class CI runners; store
  baselines so regressions are diffable.
- **Nightly metric refresh.** A scheduled job recomputes DORA + the four AEOS metrics from SQLite and
  deploy events, writes to the aggregation backend, and posts a digest. Lead-time-to-release and
  human-gate wait time are the two to watch for silent drift.
- **Cost budget as a hard CI/orchestrator signal.** The orchestrator already carries a budget ceiling
  (`orchestrator_state`, `domain/services/orchestrator-policy.ts`); export spend-per-released-change to
  the dashboard and alert when it climbs even as throughput rises — the Jevons signature. A per-key
  LiteLLM budget is the backstop that kills a runaway retry loop.
- **Anomaly alerts (Twyman).** Alert on metrics that move *too far too fast* (a lead time that halves
  overnight, a change-fail rate that drops to zero) — route these to "investigate the pipeline," not to
  a win announcement. A zeroed metric almost always means a broken exporter.
- **Trace sampling.** Trace 100% of runs (volume is low and each run is expensive and auditable); never
  head-sample away the escalations, which are the most information-rich events.

## Tooling options

| Tool | What it does | When to pick it |
| --- | --- | --- |
| **Apache DevLake** ([link](https://devlake.apache.org/)) | DORA | Self-hosted, open; prebuilt DORA dashboards; want to own the data |
| **Google Four Keys** ([link](https://github.com/dora-team/fourkeys)) | DORA | Reference pattern only — repo archived (2024); fork or borrow the model |
| **Faros AI** ([link](https://faros.ai/)) | DORA | Managed; per-team/app attribution in a monorepo; adds rework rate |
| **Sleuth** ([link](https://www.sleuth.io/)) / **LinearB** ([link](https://linearb.io/)) | DORA | Managed deploy-tracking + DORA with workflow automation |
| **DX** ([link](https://getdx.com/)) / **Haystack** ([link](https://www.usehaystack.io/)) | DORA + dev-experience | Want DORA alongside developer-experience and bottleneck analytics |
| **OpenTelemetry GenAI semconv** ([link](https://opentelemetry.io/docs/specs/semconv/gen-ai/)) | Observability | Vendor-neutral span schema for the pipeline; pin a version (still evolving) |
| **Langfuse** ([link](https://langfuse.com/)) | Observability + LLM-eval + cost | Deep workflow-topology traces, stored evals, and cost in one OSS tool |
| **Helicone** ([link](https://www.helicone.ai/)) | Observability + cost | Proxy-based, near-zero-code cost tracking, caching, rate limits |
| **LiteLLM** ([link](https://www.litellm.ai/)) | Gateway + cost + routing | Unify providers, per-key budgets, implement model cascades/right-sizing |
| **OpenMeter** ([link](https://openmeter.io/)) | Cost metering | Turn spend into per-project metered/chargeback data |
| **Promptfoo** ([link](https://www.promptfoo.dev/)) | LLM-eval | Declarative YAML evals in CI; fast multi-model comparison; red-teaming |
| **Braintrust** ([link](https://www.braintrust.dev/)) | LLM-eval | Managed eval + observability with strong CI/CD regression tracking |
| **OpenAI Evals** ([link](https://github.com/openai/evals)) | LLM-eval | Model-agnostic custom eval sets (structured/code/SQL output) |
| **DeepEval** ([link](https://github.com/confident-ai/deepeval)) | LLM-eval | Pytest-style, 50+ metrics; fits colocated-test convention — mind cost (LLM-judged) |
| **Ragas** ([link](https://docs.ragas.io/)) | LLM-eval | Only where a column retrieves context; faithfulness/relevancy metrics |

## Anti-patterns

- **Single lead-time clock.** Stopping at `SIGNED_OFF` or at merge hides the deploy→release gap that
  Principle VIII owns. Measure both ends.
- **Vanity throughput.** Celebrating "tickets per day" while spec-amendment rate and human-gate wait time
  climb — the machine is fast because humans are absorbing the rework and the queue.
- **Letting the model grade its own homework.** Using the same model as both reviewer panel and eval
  scorer, with no human-labeled anchor, launders LLM-as-a-judge bias into the autonomy decision.
- **Spend tracked after the fact.** Adding cost tracking once the bill spikes. Jevons says demand grows
  *with* cheapness; instrument spend-per-released-change from the first run.
- **Metrics with no trace.** A dashboard number that can't be drilled to the spans/transitions that
  produced it is unfalsifiable — and unfixable when it's wrong.
- **Trusting the surprise.** Acting on a too-good metric (change-fail rate → 0, lead time halved) before
  ruling out a broken exporter. That is exactly the Twyman failure.
- **Auto-granting autonomy from dashboards.** A gate goes advisory because the *eval suite* says so
  (Principle VII), on held-out historical runs — never because a weekly panel looked green.
- **Tuning agents instead of the system.** Expecting agents to "get better over time." They are stateless
  between runs; only the config (gate manual/auto, model per task, rubrics) carries learning forward.

## Signals it's working

- Both lead-time clocks (to deployment, to release) are tracked and trending, and the gap between them is
  a known, shrinking number.
- Spend-per-released-change is a first-class dashboard tile and stays flat-or-down even as deployment
  frequency rises (Jevons held in check).
- At least one human gate has been moved to advisory/auto on the strength of eval data — low panel
  override rate, confirmed on held-out runs — and nothing regressed (Principle VII earning its keep).
- At least one column runs a smaller/cheaper model than it started with, chosen by right-sizing evals,
  with quality unchanged.
- Human-gate wait time is measured and actively managed, not an invisible queue.
- A surprising metric last quarter was caught as a pipeline bug, not shipped as a win (Twyman working).
- Every headline number drills down to the OTel spans and SQLite transitions behind it.

## Related

- **Principle VI — the panel.** Panel override rate is defined and sourced here; it is the primary input
  to gate-autonomy evals.
- **Principle VII — gates earn autonomy.** The offline eval suite in this stack is the mechanism by which
  a gate earns the right to go advisory/automatic; this principle produces the evidence, VII acts on it.
- **Principle VIII — deploy and release.** The two lead-time clocks and the deployment-frequency /
  change-fail / recovery metrics depend on VIII's deploy and release events as their ground truth.

## Sources

- DORA four keys (official): <https://dora.dev/guides/dora-metrics-four-keys>
- Apache DevLake: <https://devlake.apache.org/>
- Google Four Keys (archived): <https://github.com/dora-team/fourkeys>
- Faros AI: <https://faros.ai/>
- Sleuth: <https://www.sleuth.io/> · LinearB: <https://linearb.io/>
- DX: <https://getdx.com/> · Haystack: <https://www.usehaystack.io/>
- OpenTelemetry GenAI semantic conventions: <https://opentelemetry.io/docs/specs/semconv/gen-ai/>
- Langfuse: <https://langfuse.com/>
- Helicone: <https://www.helicone.ai/>
- LiteLLM: <https://www.litellm.ai/> · docs <https://docs.litellm.ai/>
- OpenMeter: <https://openmeter.io/>
- Promptfoo: <https://www.promptfoo.dev/>
- Braintrust: <https://www.braintrust.dev/>
- OpenAI Evals: <https://github.com/openai/evals>
- DeepEval: <https://github.com/confident-ai/deepeval>
- Ragas: <https://docs.ragas.io/>
