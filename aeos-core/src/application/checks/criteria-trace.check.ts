// The first in-process check, and the first that runs before the worker:
// criterion tracing for a spec-backed epic. It spawns nothing.

import type { Check, CheckContext, CheckResult } from '../../domain/model/check.js';
import type { SpecPin } from '../../domain/model/spec-pin.js';
import type { Ticket } from '../../domain/model/ticket.js';
import type { ArtifactStore } from '../../domain/ports/driven/artifact-store.port.js';
import { renderCriteriaTrace, tracePassed } from '../../domain/services/criteria-trace.js';
import type { CriteriaCollector } from '../services/criteria-collector.js';

export class CriteriaTraceCheck implements Check {
  readonly name = 'criteria-trace';
  readonly phase = 'pre-worker';

  constructor(
    private readonly collector: CriteriaCollector,
    private readonly artifactStore: ArtifactStore,
    private readonly epic: Ticket,
    private readonly specPin: SpecPin,
  ) {}

  async run(ctx: CheckContext): Promise<CheckResult> {
    const startedAt = Date.now();
    const trace = this.collector.collect(ctx.projectPath, this.epic, this.specPin);
    const report = renderCriteriaTrace(trace);
    const artifacts = [`${this.epic.id}-criteria-trace.md`, `${this.epic.id}-criteria-trace.json`];
    this.artifactStore.writeArtifact(ctx.projectPath, this.epic.id, artifacts[0]!, report);
    this.artifactStore.writeArtifact(
      ctx.projectPath,
      this.epic.id,
      artifacts[1]!,
      `${JSON.stringify(trace, null, 2)}\n`,
    );
    return {
      name: this.name,
      passed: tracePassed(trace),
      durationMs: Date.now() - startedAt,
      timedOut: false,
      outputTail: report,
      artifacts,
    };
  }
}
