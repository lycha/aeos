// Use case — TicketReady (human reset to READY)

import { Column } from '../domain/model/column.js';
import { SubState } from '../domain/model/sub-state.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { StateMachineService } from '../domain/services/state-machine.js';
import type {
  TicketReadyInput,
  TicketReadyPort,
  TicketReadyResult,
} from '../domain/ports/driving/ticket-ready.port.js';
import { syncTicketDocument } from './services/ticket-document.js';

export class TicketReadyUseCase implements TicketReadyPort {
  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly artifactStore: ArtifactStore,
    private readonly stateMachine: StateMachineService,
  ) {}

  execute(input: TicketReadyInput): TicketReadyResult {
    const { projectId, projectPath, ticketId } = input;
    const ticket = this.ticketRepo.findById(projectId, ticketId);

    if (!ticket) {
      return { status: 'error', ticketId, error: `Ticket ${ticketId} not found` };
    }
    if (ticket.column === Column.BACKLOG || ticket.column === Column.DONE) {
      return {
        status: 'error',
        ticketId,
        error: `Ticket ${ticketId} cannot be set to READY in ${ticket.column}`,
      };
    }
    if (ticket.subState === SubState.READY) {
      return { status: 'error', ticketId, error: `Ticket ${ticketId} is already READY` };
    }

    const result = this.stateMachine.setSubState(projectId, ticketId, SubState.READY);
    if (!result.ok) {
      return { status: 'error', ticketId, error: `Failed to set READY state: ${result.reason}` };
    }

    // Mirrored to disk for readability; SQLite is authoritative for sub-state.
    syncTicketDocument(this.artifactStore, projectPath, {
      ...ticket,
      subState: SubState.READY,
    });

    return { status: 'readied', ticketId, previousSubState: ticket.subState };
  }
}
