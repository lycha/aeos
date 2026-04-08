// Use case — TicketApprove (advance column)

import * as path from 'node:path';
import { Column, COLUMN_ORDER } from '../domain/model/column.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
import type { StateMachineService } from '../domain/services/state-machine.js';
import type {
  TicketApprovePort,
  TicketApproveResult,
} from '../domain/ports/driving/ticket-approve.port.js';

export class TicketApproveUseCase implements TicketApprovePort {
  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly stateMachine: StateMachineService,
    private readonly gitGateway: GitGateway,
  ) {}

  execute(projectId: string, projectPath: string, ticketId: string): TicketApproveResult {
    // 1. Load ticket
    const ticket = this.ticketRepo.findById(projectId, ticketId);
    if (!ticket) {
      return { status: 'error', ticketId, error: `Ticket ${ticketId} not found` };
    }

    // 2. Verify sub-state is SIGNED_OFF
    if (ticket.subState !== 'SIGNED_OFF') {
      const stateDescription =
        ticket.subState === null ? `${ticket.column} (no sub-state)` : ticket.subState;
      return {
        status: 'error',
        ticketId,
        error: `Ticket ${ticketId} is not signed off (current state: ${stateDescription}). Only signed-off tickets can be approved.`,
      };
    }

    // 3. Determine next column
    const currentColumn = ticket.column;
    const currentIndex = COLUMN_ORDER.indexOf(currentColumn);

    // 4. If current column is DONE, return already_done
    if (currentColumn === Column.DONE) {
      return { status: 'already_done', ticketId };
    }

    const nextColumn = COLUMN_ORDER[currentIndex + 1];

    // 5. Transition column
    const transitionResult = this.stateMachine.transition(projectId, ticketId, nextColumn);
    if (!transitionResult.ok) {
      return { status: 'error', ticketId, error: transitionResult.reason };
    }

    // 6. Set sub-state to BLOCKED (new column starts blocked until run)
    const subStateResult = this.stateMachine.setSubState(projectId, ticketId, 'BLOCKED');
    if (!subStateResult.ok) {
      return {
        status: 'error',
        ticketId,
        error: `Failed to set BLOCKED state: ${subStateResult.reason}`,
      };
    }

    // 7. Commit approval to git
    const aeosDir = path.join(projectPath, '.aeos');
    try {
      this.gitGateway.commit(
        aeosDir,
        `[${ticketId}][HUMAN][v1][advance: ${currentColumn} → ${nextColumn}]`,
      );
    } catch (err) {
      // Compensate: revert column and sub-state
      this.stateMachine.transition(projectId, ticketId, currentColumn);
      this.stateMachine.setSubState(projectId, ticketId, 'SIGNED_OFF');
      throw err;
    }

    // 8. Return success
    return { status: 'advanced', ticketId, fromColumn: currentColumn, toColumn: nextColumn };
  }
}
