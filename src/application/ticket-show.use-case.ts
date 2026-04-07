// Use case — TicketShow

import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type {
  TicketShowPort,
  TicketShowInput,
  TicketShowResult,
} from '../domain/ports/driving/ticket-show.port.js';

export class TicketShowUseCase implements TicketShowPort {
  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly artifactStore: ArtifactStore,
  ) {}

  execute(input: TicketShowInput): TicketShowResult {
    const ticket = this.ticketRepo.findById(input.projectId, input.ticketId);
    if (!ticket) {
      return { ok: false, reason: 'NOT_FOUND' };
    }

    const artifacts = this.artifactStore.listArtifacts(input.projectPath, ticket.id);

    return { ok: true, ticket, artifacts };
  }
}
