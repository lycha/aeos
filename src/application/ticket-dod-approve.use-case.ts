// Use case — TicketDodApprove (final human gate → DONE)

import * as path from 'node:path';
import { Column } from '../domain/model/column.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
import type { CostRepository } from '../domain/ports/driven/cost-repository.port.js';
import type { StateMachineService } from '../domain/services/state-machine.js';
import type {
  TicketDodApprovePort,
  TicketDodApproveResult,
} from '../domain/ports/driving/ticket-dod-approve.port.js';

export class TicketDodApproveUseCase implements TicketDodApprovePort {
  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly stateMachine: StateMachineService,
    private readonly gitGateway: GitGateway,
    private readonly costRepo: CostRepository,
  ) {}

  execute(
    projectId: string,
    projectPath: string,
    ticketId: string,
    approved: boolean,
  ): TicketDodApproveResult {
    // 1. Load ticket
    const ticket = this.ticketRepo.findById(projectId, ticketId);
    if (!ticket) {
      return { status: 'error', ticketId, error: `Ticket ${ticketId} not found` };
    }

    // 2. Guard: ticket must be in DOD_GATE column
    if (ticket.column !== Column.DOD_GATE) {
      return {
        status: 'error',
        ticketId,
        error: `Ticket ${ticketId} is not in DOD_GATE (current column: ${ticket.column}). Only DOD_GATE tickets can be approved via dod-approve.`,
      };
    }

    // 3. If not approved, return cancelled
    if (!approved) {
      return { status: 'cancelled', ticketId };
    }

    // 4. Transition column to DONE
    const transitionResult = this.stateMachine.transition(projectId, ticketId, Column.DONE);
    if (!transitionResult.ok) {
      return { status: 'error', ticketId, error: transitionResult.reason };
    }

    // 5. Set sub-state to null (DONE is terminal — no active sub-state).
    //    StateMachineService.setSubState() requires a valid SubState value,
    //    so we go through the repository directly to clear it.
    this.ticketRepo.updateSubState(projectId, ticketId, null);

    // 6. Commit approval to git
    const aeosDir = path.join(projectPath, '.aeos');
    try {
      this.gitGateway.commit(aeosDir, `[${ticketId}][HUMAN][v1][dod-approve: DOD_GATE → DONE]`);
    } catch (err) {
      // Compensate: revert column back to DOD_GATE and restore previous sub-state
      this.stateMachine.transition(projectId, ticketId, Column.DOD_GATE);
      if (ticket.subState !== null) {
        this.stateMachine.setSubState(projectId, ticketId, ticket.subState);
      }
      throw err;
    }

    // 7. Calculate total cost
    const costRecords = this.costRepo.findByTicket(projectId, ticketId);
    const totalCostUsd = costRecords.reduce((sum, r) => sum + r.costUsd, 0);

    // 8. Return success
    return { status: 'approved', ticketId, totalCostUsd };
  }
}
