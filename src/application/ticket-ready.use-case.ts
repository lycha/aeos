// Use case — TicketReady (human reset to READY)

import * as path from 'node:path';
import { Column } from '../domain/model/column.js';
import { SubState } from '../domain/model/sub-state.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
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
    private readonly gitGateway: GitGateway,
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

    const aeosDir = path.join(projectPath, '.aeos');
    const ticketFilePath = syncTicketDocument(this.artifactStore, projectPath, {
      ...ticket,
      subState: SubState.READY,
    });

    try {
      this.gitGateway.commitFiles(
        aeosDir,
        [ticketFilePath],
        `[${ticketId}][HUMAN][v1][ready: ${ticket.subState ?? 'NONE'} → READY]`,
      );
    } catch (err) {
      if (ticket.subState !== null) {
        this.stateMachine.setSubState(projectId, ticketId, ticket.subState);
      }
      syncTicketDocument(this.artifactStore, projectPath, ticket);
      throw err;
    }

    return { status: 'readied', ticketId, previousSubState: ticket.subState };
  }
}
