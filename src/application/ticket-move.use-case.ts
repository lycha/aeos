// Use case — TicketMove (human override to any workflow column)

import * as path from 'node:path';
import { Column } from '../domain/model/column.js';
import { SubState } from '../domain/model/sub-state.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
import type { StateMachineService } from '../domain/services/state-machine.js';
import type {
  TicketMoveInput,
  TicketMovePort,
  TicketMoveResult,
} from '../domain/ports/driving/ticket-move.port.js';
import { syncTicketDocument } from './services/ticket-document.js';

export class TicketMoveUseCase implements TicketMovePort {
  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly artifactStore: ArtifactStore,
    private readonly stateMachine: StateMachineService,
    private readonly gitGateway: GitGateway,
  ) {}

  execute(input: TicketMoveInput): TicketMoveResult {
    const { projectId, projectPath, ticketId, targetColumn } = input;

    const ticket = this.ticketRepo.findById(projectId, ticketId);
    if (!ticket) {
      return { status: 'error', ticketId, error: `Ticket ${ticketId} not found` };
    }

    const currentColumn = ticket.column;
    const transitionResult = this.stateMachine.transition(projectId, ticketId, targetColumn);
    if (!transitionResult.ok) {
      return { status: 'error', ticketId, error: transitionResult.reason };
    }

    if (targetColumn === Column.DONE) {
      this.ticketRepo.updateSubState(projectId, ticketId, null);
    } else if (targetColumn !== Column.BACKLOG) {
      const subStateResult = this.stateMachine.setSubState(projectId, ticketId, SubState.READY);
      if (!subStateResult.ok) {
        return {
          status: 'error',
          ticketId,
          error: `Failed to set READY state: ${subStateResult.reason}`,
        };
      }
    }

    const nextSubState =
      targetColumn === Column.DONE || targetColumn === Column.BACKLOG ? null : SubState.READY;

    const aeosDir = path.join(projectPath, '.aeos');
    syncTicketDocument(this.artifactStore, projectPath, {
      ...ticket,
      column: targetColumn,
      subState: nextSubState,
    });
    try {
      this.gitGateway.commit(
        aeosDir,
        `[${ticketId}][HUMAN][v1][move: ${currentColumn} → ${targetColumn}]`,
      );
    } catch (err) {
      this.stateMachine.transition(projectId, ticketId, currentColumn);
      if (currentColumn === Column.DONE) {
        this.ticketRepo.updateSubState(projectId, ticketId, null);
      } else if (currentColumn !== Column.BACKLOG && ticket.subState !== null) {
        this.stateMachine.setSubState(projectId, ticketId, ticket.subState);
      }
      syncTicketDocument(this.artifactStore, projectPath, ticket);
      throw err;
    }

    return { status: 'moved', ticketId, fromColumn: currentColumn, toColumn: targetColumn };
  }
}
