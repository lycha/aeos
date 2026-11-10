// Turns configuration into the checks the stage runs: one ShellCheck per
// `.aeos/project.json` entry, in the order written, then any registered check.
// Checks that run before the worker are built in, not configured.

import type { Check } from '../../domain/model/check.js';
import type { ChecksRunner } from '../../domain/ports/driven/checks-runner.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';
import { Column } from '../../domain/model/column.js';
import type { SpecPin } from '../../domain/model/spec-pin.js';
import type { Ticket } from '../../domain/model/ticket.js';
import { TicketKind } from '../../domain/model/ticket-kind.js';
import type { ArtifactStore } from '../../domain/ports/driven/artifact-store.port.js';
import type { CriteriaCollector } from '../services/criteria-collector.js';
import { CriteriaTraceCheck } from './criteria-trace.check.js';
import { ShellCheck } from './shell-check.js';

export class CheckRegistry {
  private readonly registered: Check[] = [];

  constructor(
    private readonly projectRepo: ProjectRepository,
    private readonly runner: ChecksRunner,
    private readonly criteriaCollector: CriteriaCollector,
    private readonly artifactStore: ArtifactStore,
  ) {}

  register(check: Check): void {
    this.registered.push(check);
  }

  checksFor(projectPath: string): Check[] {
    const configured = this.projectRepo.readExecutorConfig(projectPath)?.checks ?? [];
    return [...configured.map((config) => new ShellCheck(config, this.runner)), ...this.registered];
  }

  /**
   * The checks that run before any agent does. Criterion tracing, for a
   * spec-backed epic at its integration column.
   */
  preWorkerChecksFor(ticket: Ticket, specPin: SpecPin | null): Check[] {
    // shortcut: the column by name; I1-M4-005a makes it the column's role.
    const tracesCriteria =
      specPin !== null &&
      ticket.kind === TicketKind.EPIC &&
      ticket.column === Column.INTEGRATION_REVIEW;
    return tracesCriteria
      ? [new CriteriaTraceCheck(this.criteriaCollector, this.artifactStore, ticket, specPin)]
      : [];
  }
}
