// Use case — TicketShow

import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type { CostRepository } from '../domain/ports/driven/cost-repository.port.js';
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
    }));

    // Lineage: an epic shows what it decomposed into, a task shows what it
    // belongs to. Without this a task is indistinguishable from an epic.
    const children = this.ticketRepo.findChildren(input.projectId, ticket.id);
    const parent = ticket.parentId
      ? this.ticketRepo.findById(input.projectId, ticket.parentId)
      : null;

    return { ok: true, ticket, artifacts, executions, children, parent };
  }
}
