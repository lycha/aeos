// Use case — TicketShow

import { columnOrderFor } from '../domain/model/column.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type { CostRepository } from '../domain/ports/driven/cost-repository.port.js';
import type { RunRecordStore } from '../domain/ports/driven/run-record-store.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
import type { ArtefactTree } from '../domain/ports/driven/artefact-tree.port.js';
import type { ColumnSpecLoader } from '../domain/ports/driven/column-spec-loader.port.js';
import type { PipelineLoader } from '../domain/ports/driven/pipeline-loader.port.js';
import type { GateRecordStore } from '../domain/ports/driven/gate-record-store.port.js';
import { roleOf } from './services/column-roles.js';
import { availableActionsFor } from './services/ticket-actions.js';
import { resolveSpecPin, pendingAmendment } from './services/spec-pin.js';
import type {
  TicketShowPort,
  TicketShowInput,
  TicketShowResult,
  TicketExecutionInfo,
} from '../domain/ports/driving/ticket-show.port.js';

export class TicketShowUseCase implements TicketShowPort {
  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly artifactStore: ArtifactStore,
    private readonly costRepo: CostRepository,
    private readonly runRecordStore: RunRecordStore,
    private readonly gitGateway: GitGateway,
    private readonly artefactTree: ArtefactTree,
    private readonly columnSpecLoader: ColumnSpecLoader,
    private readonly pipelineLoader: PipelineLoader,
    private readonly gateRecordStore: GateRecordStore,
  ) {}

  execute(input: TicketShowInput): TicketShowResult {
    const ticket = this.ticketRepo.findById(input.projectId, input.ticketId);
    if (!ticket) {
      return { ok: false, reason: 'NOT_FOUND' };
    }

    const artifacts = this.artifactStore.listArtifacts(input.projectPath, ticket.id);

    // Fetch execution information from cost records
    const costRecords = this.costRepo.findByTicket(input.projectId, input.ticketId);
    const executions: TicketExecutionInfo[] = costRecords.map((record) => ({
      executor: record.executor,
      model: record.model,
      agent: record.agent,
      column: record.column,
      recordedAt: record.recordedAt,
      costUsd: record.costUsd,
    }));

    // Lineage: an epic shows what it decomposed into, a task shows what it
    // belongs to. Without this a task is indistinguishable from an epic.
    const children = this.ticketRepo.findChildren(input.projectId, ticket.id);
    const parent = ticket.parentId
      ? this.ticketRepo.findById(input.projectId, ticket.parentId)
      : null;

    const runRecords = this.runRecordStore.list(input.projectPath, ticket.id);
    const runs = runRecords.map((record) => record.run_id);

    const specPin = resolveSpecPin(this.ticketRepo, ticket);
    const specMoved =
      specPin !== null &&
      this.gitGateway.pathChangedSince(
        this.artefactTree.root(input.projectPath),
        specPin.commit,
        specPin.path,
        // Gate decisions and the conformance report are recorded beside the
        // spec; they are not the spec.
        ['gates.yaml', 'conformance.yaml', 'conformance.md'].map(
          (file) => `${specPin.path}/${file}`,
        ),
      );

    const hasPendingAmendment =
      specPin !== null &&
      pendingAmendment(this.gateRecordStore, input.projectPath, specPin) !== undefined;
    const role = roleOf(this.columnSpecLoader, input.projectPath)(ticket.column);
    const availableActions = availableActionsFor({
      column: ticket.column,
      subState: ticket.subState,
      role,
      pendingAmendment: hasPendingAmendment,
    });
    const availableColumns = columnOrderFor(
      this.pipelineLoader.load(input.projectPath),
      ticket.kind,
    ).filter((column) => column !== ticket.column);
    const gateRecords = this.gateRecordStore.list(input.projectPath, { ticketId: ticket.id });
    const gitIdentity = this.gitGateway.userIdentity(input.projectPath);

    return {
      ok: true,
      ticket,
      artifacts,
      executions,
      runs,
      runRecords,
      children,
      parent,
      specPin,
      specMoved,
      gitIdentity,
      availableActions: [...availableActions],
      availableColumns: [...availableColumns],
      pendingAmendment: hasPendingAmendment,
      gateRecords,
    };
  }
}
