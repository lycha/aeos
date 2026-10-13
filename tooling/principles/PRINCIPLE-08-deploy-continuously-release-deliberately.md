# Principle VIII — Deploy continuously, release deliberately

> **Principle.** Deployment runs automatically behind feature flags, automated rollback and detailed monitoring. Release is a human decision, and work is done when it is released, observed and measured against its success metric.
> **Law.** Murphy's Law — anything that can go wrong will; deployment runs without a human only because automated rollback and detailed monitoring assume something *will* break.

This is the operational translation of Principle VIII for projects AEOS drives. It decouples two acts. **Deploy** is automated, reversible, and mechanical. **Release** is a deliberate human act that exposes behaviour to users. Then it closes the loop: a ticket is `DONE` only once its change is released, observed, and measured against a stated success metric. The human sign-off is Principle VII's release gate. The measurement feeds Principle XII.

## What it demands, operationally

- **Deploy ≠ release.** Merging to `main` and shipping the binary to production is deploy. Turning the behaviour *on* for a user cohort is release. The two are separated by a flag, never by a branch or a manual artifact copy. Code reaches production dark, carrying its new behaviour behind a flag that is off.
- **Every risky change ships behind a flag** with an explicit owner, a default-off state, a targeting rule, and a documented kill switch. The flag is created with the code, in the same PR, and is removed (not left to rot) once the change is fully rolled out and measured.
- **Progressive delivery, not big-bang.** New versions take traffic incrementally (canary / blue-green), and each step is gated by an automated analysis of golden signals before the next step is allowed.
- **Rollback is automatic and fast.** A health gate that fails rolls back without waiting for a human. The system assumes breakage; the human is for the *release* decision, not the *rescue* decision.
- **Observability is a precondition for deploy, not an afterthought.** No change deploys unless it emits the metrics, traces, and logs needed to judge it. "We can't tell if it's working" is a failed deploy.
- **Release is linked to a success metric.** Before release, the ticket names the metric (an SLO, a conversion rate, a latency target) and the observation window. `DONE` is asserted only when the metric is read after release — not when the PR merges.
- **DORA is the scoreboard.** The pipeline is tuned to lower **change-failure rate** and **failed-deployment recovery time (MTTR)** while keeping deployment frequency high. These numbers are the feedback signal for how much to automate and how wide to canary.

## Reference architecture

```
  spec + success metric (ticket)                         Principle III / XII
          │
          ▼
  PR merged → CI builds immutable artifact (OCI image, pinned digest)
          │
          ▼
  GitOps CD applies desired state ────────────────────────► Argo CD / Flux
          │        (image digest in Git = single source of truth)
          ▼
  Progressive rollout controller ─────────────────────────► Argo Rollouts / Flagger
    canary 5% → 25% → 50% → 100%, each step gated by
          │
          ├── automated analysis (AnalysisTemplate / MetricTemplate)
          │     query SLIs from Prometheus / Datadog / CloudWatch
          │     pass/fail thresholds + multi-window burn rate
          │     fail ⇒ AUTOMATIC ROLLBACK (no human)   ◄── Murphy's Law guard
          │
          ▼
  Code is in production, behaviour still OFF ──────────────► feature flag = off
          │
          ▼  ← HUMAN RELEASE GATE (Principle VII)
  Operator flips flag / widens targeting ─────────────────► OpenFeature + provider
    (Unleash / Flagsmith / LaunchDarkly / GrowthBook)
    gradual rollout 1% → 100%, kill switch always available
          │
          ▼
  Observe + measure against the ticket's success metric ──► OTel → Prometheus/Grafana,
    SLO burn-rate alerts, Sentry errors, RUM               Sentry, Grafana SLO
          │
          ▼
  Ticket → DONE  (released + observed + measured)
          │
          ▼
  DORA: change-failure rate, MTTR, lead-time-to-release ──► Principle XII
```

Two distinct control planes: **the CD/rollout plane** owns deploy and automated rollback (machine-fast, no human); **the flag plane** owns release and the kill switch (human-flipped, user-facing). Keeping them separate is what lets deploy be continuous while release stays deliberate.

## CI / automation

- **Immutable, pinned artifacts.** CI builds once, tags by content digest, and that digest is the only thing promoted across environments. No rebuild between stage and prod.
- **GitOps as the deploy trigger.** The deployed state is a commit. `Argo CD` / `Flux` reconcile the cluster to Git; a deploy is a PR that bumps an image digest, which makes every deploy diffable and every rollback a `git revert`.
- **Environments as gates.** `GitHub Environments` carries **required reviewers** (up to 6, one approval needed) and a **wait timer** (1–43,200 min) on the production job, so the pipeline encodes Principle VII's human gate in the workflow file rather than in tribal knowledge.
- **Analysis-gated promotion.** At each traffic step the rollout controller runs an `AnalysisTemplate` (Argo Rollouts) or `MetricTemplate` (Flagger) against the metrics backend. Thresholds decide promote vs. abort. Statistical canary analysis goes further: it scores the canary against the baseline instead of gating on a single reading.
- **Flag lifecycle in CI.** A lint step fails the build if a PR adds flagged code without registering the flag, and a scheduled job flags stale (fully-rolled-out) flags for removal so flag debt does not accumulate.
- **Release-to-metric binding.** The ticket's success metric and observation window are machine-readable; a post-release check reads the metric from the observability backend and is what flips the ticket to `DONE`. A release with no readable metric cannot be marked done.
- **DORA extraction.** Deployment events, incident open/close, and release timestamps are emitted as structured events so change-failure rate and MTTR are computed, not estimated (see Principle XII).

In AEOS terms, this belongs in the **DONE gate**: the column's checks assert that the artifact deployed, the flag exists, the rollout analysis passed, and the success metric was read after release. Those are deterministic checks (Principle VI) — a review agent judges the *narrative*, deterministic gates judge *released + observed + measured*.

Concretely, the three automated seams look like this. The rollout step gates promotion on a pure metric threshold:

```yaml
# Argo Rollouts AnalysisTemplate — queried at each canary step; failure aborts + rolls back
metrics:
  - name: success-rate
    interval: 1m
    successCondition: result[0] >= 0.99      # SLI from Prometheus, not a human
    failureLimit: 2                           # 2 bad reads ⇒ automatic rollback
    provider:
      prometheus:
        address: http://prometheus.monitoring:9090
        query: |
          sum(rate(http_requests_total{job="checkout",code!~"5.."}[2m]))
          / sum(rate(http_requests_total{job="checkout"}[2m]))
```

The application reads the release decision through the portable OpenFeature seam — never a vendor SDK directly:

```ts
const client = OpenFeature.getClient();                 // provider swappable: Unleash/Flagsmith/LD
if (await client.getBooleanValue("checkout-v2", false, { targetingKey: userId })) {
  return checkoutV2(cart);                               // off by default: deployed dark
}
```

And the ticket binds its release to a measured success metric, read *after* release before `DONE` is asserted:

```yaml
success_metric:
  sli: checkout_conversion_rate
  query: sum(conversions) / sum(sessions)
  target: ">= 0.042"      # released only counts if the metric clears this
  window: 24h             # observation window after flag reaches 100%
```

## Tooling options

| Tool | What it does | When to pick it |
| --- | --- | --- |
| [OpenFeature](https://openfeature.dev/) | CNCF vendor-neutral flag-evaluation API + SDKs (Java, Go, JS/TS, .NET, Python, PHP, Ruby, Kotlin, Swift); you code against one API and swap providers | Default. Keeps app code free of vendor lock-in; pair with any provider below |
| [flagd](https://flagd.dev/) | OpenFeature's own lightweight flag daemon, flags from files/HTTP/gRPC | You want OpenFeature with no SaaS and no heavy backend |
| [Unleash](https://www.getunleash.io/) | Open-source, self-hostable flag platform with gradual rollout, strategies, kill switch; OpenFeature provider | Self-hosted control, data stays in-house, OSS-first teams |
| [Flagsmith](https://www.flagsmith.com/) | Open-source flags + remote config + segments, SaaS or self-host; OpenFeature provider | Need remote config alongside flags, want self-host option |
| [GrowthBook](https://www.growthbook.io/) | Open-source feature flags **and** A/B experimentation with built-in stats engine | Release decisions are experiments; you want flag + metric lift in one tool |
| [LaunchDarkly](https://launchdarkly.com/) | Mature commercial flag + experimentation + release-guardrail platform; OpenFeature provider | Enterprise scale, governance, managed guarded releases |
| [Argo Rollouts](https://argoproj.github.io/rollouts/) | K8s controller: canary + blue-green with `AnalysisTemplate`-driven promotion/rollback, metric plugins | Argo CD users; declarative progressive delivery on Kubernetes |
| [Flagger](https://flagger.app/) | K8s operator automating canary/blue-green via Istio, Linkerd, NGINX, Contour, Gateway API; metric-gated rollback | Flux/service-mesh users wanting mesh-native traffic shifting |
| [Kargo](https://kargo.io/) | Continuous-promotion controller for Argo CD: moves one artifact stage-to-stage via GitOps, each promotion gated | Multi-environment promotion without bespoke scripts; pairs with Argo CD/Rollouts |
| [Argo CD](https://argo-cd.readthedocs.io/) | GitOps CD controller; cluster state reconciled to Git, rollback = revert | Kubernetes, pull-based GitOps, auditable deploys |
| [Flux CD](https://fluxcd.io/) | GitOps toolkit (CNCF graduated); pairs with Flagger for progressive delivery | GitOps with mesh-native canaries, Helm/Kustomize native |
| [GitHub Environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments) | Deployment gates in the workflow: required reviewers, wait timers, env secrets | Encode the human release gate (Principle VII) directly in CI |
| [OpenTelemetry](https://opentelemetry.io/) | Vendor-neutral traces/metrics/logs instrumentation + Collector | The instrumentation layer; feeds every backend below |
| [Prometheus](https://prometheus.io/) + [Grafana](https://grafana.com/) | Metrics storage, recording rules, SLO dashboards, multi-burn-rate alerts | Self-hosted SLO backend; source for rollout analysis queries |
| [Sentry](https://sentry.io/) | Error tracking, release health, regression + crash-free-rate signals per release | Catch exceptions/regressions a metric threshold misses |
| Grafana RUM / [OpenTelemetry browser](https://opentelemetry.io/docs/languages/js/) | Real-user monitoring of client-side latency/errors post-release | Success metric is user-facing (web vitals, client errors) |

Cross-ecosystem: OpenFeature is the portable seam on the flag side; OpenTelemetry is the portable seam on the observability side. Pick a provider and a backend per environment, but code against those two standards so a vendor swap never touches application logic.

## Anti-patterns

- **Deploy *is* release.** Shipping to prod and immediately serving all users, with no flag. First bad change is a full-blast incident.
- **Branch-as-flag.** Long-lived `release` branches or environment-specific builds instead of one artifact gated by a flag. Reintroduces merge risk and non-reproducible prod.
- **Manual rollback only.** No automated health gate; recovery waits on a human noticing, paging, and reverting by hand. MTTR balloons and Murphy's Law wins.
- **Flag debt.** Flags that outlive their rollout become dead conditionals and hidden coupling. No removal step = a codebase of permanent `if`s.
- **Threshold-of-one alerting.** A single-window alert pages on every transient blip and misses slow burns. Use multi-window, multi-burn-rate SLO alerts (Google SRE pattern).
- **Deploy-time blindness.** Shipping code that emits no metric for its own behaviour, then "measuring" by eyeballing a dashboard. Unmeasurable change cannot be `DONE`.
- **`DONE` on merge.** Closing the ticket when the PR merges, before the success metric is read. That is deployed, not released, observed, or measured.
- **LLM in the rollback path.** Letting an agent decide promote/abort. The health gate is a pure threshold/statistical function so "why did it roll back?" is answerable from the analysis run, not a model's prose — mirrors AEOS's own pure-scheduler rule.
- **Vendor-locked flag calls.** Calling a vendor SDK throughout the code instead of OpenFeature; swapping providers becomes a refactor.

## Signals it's working

- Most PRs merge to production the same day, dark, behind an off flag; release is a separate, logged, human action.
- **Change-failure rate** trends toward the elite band (0–15%) and **failed-deployment recovery time** is minutes, dominated by automated rollback, not human toil.
- A bad canary aborts and rolls back automatically, with an analysis run that names the failing SLI — before a human is paged.
- Every released ticket links to a success metric and shows its post-release reading in the observation window; none reach `DONE` without one.
- Flag count is bounded: flags are created with their feature and deleted after full rollout; stale-flag alerts stay near zero.
- The kill switch has been exercised (in a game day or for real) and cuts user exposure in seconds without a deploy.
- Deployment frequency rises while change-failure rate holds or falls — the two are decoupled, which is the whole point of deploy ≠ release.

## Related

- **Principle VII — Humans hold three gates.** The release is one of the three human gates. This principle supplies the *mechanism* (flag + GitHub Environment reviewer) that makes that gate a deliberate flip rather than an accident of a merge.
- **Principle XII — The system learns from measurement.** Change-failure rate, MTTR, and lead-time-to-release are produced here and judged there; the success-metric reading that marks a ticket `DONE` is the per-change input to that measurement system.
- **Principle VI — Checks run first, review agents second.** "Released + observed + measured" is enforced by deterministic DONE-gate checks (rollout passed, flag exists, metric read), not by a reviewer's opinion.
- **Principle I — Discipline is the control.** Feature flags and continuous delivery are named there as controls that keep agent output correct; this document is their concrete realization.

## Sources

- OpenFeature (CNCF) — vendor-neutral feature-flag standard: <https://openfeature.dev/>
- flagd — OpenFeature flag daemon: <https://flagd.dev/>
- Unleash — open-source feature management: <https://www.getunleash.io/>
- Flagsmith — OpenFeature client/provider docs: <https://docs.flagsmith.com/clients/openfeature>
- GrowthBook — flags + experimentation: <https://www.growthbook.io/>
- LaunchDarkly: <https://launchdarkly.com/>
- Argo Rollouts — Analysis & Progressive Delivery: <https://argo-rollouts.readthedocs.io/en/stable/features/analysis/>
- Flagger — progressive delivery operator: <https://flagger.app/>
- Kargo — continuous promotion for Argo CD: <https://kargo.io/>
- Argo CD — GitOps CD: <https://argo-cd.readthedocs.io/>
- Flux CD — GitOps toolkit: <https://fluxcd.io/>
- GitHub — Controlling deployments (environments, required reviewers, wait timers): <https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments>
- OpenTelemetry: <https://opentelemetry.io/>
- Prometheus: <https://prometheus.io/>
- Grafana: <https://grafana.com/>
- Sentry — error tracking & release health: <https://sentry.io/>
- DORA — four keys, change-failure rate, failed-deployment recovery time: <https://dora.dev/>
- Google SRE Workbook — multi-window, multi-burn-rate SLO alerting: <https://sre.google/workbook/alerting-on-slos/>
