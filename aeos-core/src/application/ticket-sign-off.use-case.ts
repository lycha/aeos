// Use case — TicketSignOff (human manual sign-off)

import { Column } from '../domain/model/column.js';
import { SubState } from '../domain/model/sub-state.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { StateMachineService } from '../domain/services/state-machine.js';
import type {
  TicketSignOffInput,
  TicketSignOffPort,
  TicketSignOffResult,
} from '../domain/ports/driving/ticket-sign-off.port.js';
import { syncTicketDocument } from './services/ticket-document.js';

export class TicketSignOffUseCase implements TicketSignOffPort {
  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly artifactStore: ArtifactStore,
    private readonly stateMachine: StateMachineService,
  ) {}

  execute(input: TicketSignOffInput): TicketSignOffResult {
    const { projectId, projectPath, ticketId } = input;
    const ticket = this.ticketRepo.findById(projectId, ticketId);

    if (!ticket) {
      return { status: 'error', ticketId, error: `Ticket ${ticketId} not found` };
    }
    if (ticket.column === Column.BACKLOG || ticket.column === Column.DONE) {
      return {
        status: 'error',
        ticketId,
        error: `Ticket ${ticketId} cannot be signed off in ${ticket.column}`,
      };
    }
    if (ticket.subState === SubState.SIGNED_OFF) {
      return {
        status: 'error',
        ticketId,
        error: `Ticket ${ticketId} is already SIGNED_OFF`,
      };
    }

    const result = this.stateMachine.setSubState(projectId, ticketId, SubState.SIGNED_OFF);
    if (!result.ok) {
      return {
        status: 'error',
        ticketId,
        error: `Failed to set SIGNED_OFF state: ${result.reason}`,
      };
    }

    // Mirrored to disk for readability; SQLite is authoritative for sub-state.
    // No git commit — state churn buried the artifact history a human reads,
    // and with nothing to fail there is no longer a rollback to compensate.
    syncTicketDocument(this.artifactStore, projectPath, {
      ...ticket,
      subState: SubState.SIGNED_OFF,
    });

    return { status: 'signed_off', ticketId, previousSubState: ticket.subState };
  }
}
