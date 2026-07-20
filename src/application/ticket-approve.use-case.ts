// Use case — TicketApprove (advance column)

import { Column, nextColumnFor } from '../domain/model/column.js';
import { SubState } from '../domain/model/sub-state.js';
import { TicketKind } from '../domain/model/ticket-kind.js';
import type { ArtifactStore } from '../domain/ports/driven/artifact-store.port.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { StateMachineService } from '../domain/services/state-machine.js';
import type {
  TicketApprovePort,
  TicketApproveResult,
} from '../domain/ports/driving/ticket-approve.port.js';
import { syncTicketDocument } from './services/ticket-document.js';

export class TicketApproveUseCase implements TicketApprovePort {
  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly artifactStore: ArtifactStore,
    private readonly stateMachine: StateMachineService,
  ) {}

  execute(projectId: string, projectPath: string, ticketId: string): TicketApproveResult {
    const ticket = this.ticketRepo.findById(projectId, ticketId);
    if (!ticket) {
      return { status: 'error', ticketId, error: `Ticket ${ticketId} not found` };
    }

    // BACKLOG tickets can advance without sign-off (no agent pipeline in BACKLOG).
    // All other columns require SIGNED_OFF from the agent pipeline.
    const isBacklog = ticket.column === Column.BACKLOG;
    if (!isBacklog && ticket.subState !== SubState.SIGNED_OFF) {
      const stateDescription =
        ticket.subState === null ? `${ticket.column} (no sub-state)` : ticket.subState;
      return {
        status: 'error',
        ticketId,
        error: `Ticket ${ticketId} is not signed off (current state: ${stateDescription}). Run 'aeos ticket run ${ticketId}' or 'aeos ticket sign-off ${ticketId}' first.`,
      };
    }

    const currentColumn = ticket.column;
    if (currentColumn === Column.DONE) {
      return { status: 'already_done', ticketId };
    }

    // The epic join: an epic leaving TASK_BREAKDOWN is claiming its children
    // are finished. Verify that rather than trusting it.
    if (ticket.kind === TicketKind.EPIC && currentColumn === Column.TASK_BREAKDOWN) {
      const children = this.ticketRepo.findChildren(projectId, ticketId);
      const unfinished = children.filter((child) => child.column !== Column.DONE);
      if (unfinished.length > 0) {
        const summary = unfinished
          .map((child) => `${child.id} (${child.column})`)
          .slice(0, 5)
          .join(', ');
        const overflow = unfinished.length > 5 ? `, and ${unfinished.length - 5} more` : '';
        return {
          status: 'error',
          ticketId,
          error: `Epic ${ticketId} has ${unfinished.length} unfinished task(s): ${summary}${overflow}. Finish them before advancing to DOD_GATE.`,
        };
      }
    }

    const nextColumn = nextColumnFor(ticket.kind, currentColumn);
    if (!nextColumn) {
      return {
        status: 'error',
        ticketId,
        error: `Ticket ${ticketId} is a ${ticket.kind} in ${currentColumn}, which has no next column in that pipeline.`,
      };
    }

    const transitionResult = this.stateMachine.transition(projectId, ticketId, nextColumn);
    if (!transitionResult.ok) {
      return { status: 'error', ticketId, error: transitionResult.reason };
    }

    // Set sub-state to READY (new column awaits its first `ticket run`)
    const subStateResult = this.stateMachine.setSubState(projectId, ticketId, SubState.READY);
    if (!subStateResult.ok) {
      return {
        status: 'error',
        ticketId,
        error: `Failed to set READY state: ${subStateResult.reason}`,
      };
    }

    // Mirrored to disk; SQLite is authoritative for column and sub-state, so
    // the advance is not committed to git.
    syncTicketDocument(this.artifactStore, projectPath, {
      ...ticket,
      column: nextColumn,
      subState: SubState.READY,
    });

    return { status: 'advanced', ticketId, fromColumn: currentColumn, toColumn: nextColumn };
  }
}
