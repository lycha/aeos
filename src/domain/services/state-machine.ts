// Domain service — StateMachineService
//
// Enforces forward-only column movement and sub-state transitions.
// Receives TicketRepository and TransitionRepository ports via constructor injection.
// Does NOT depend on any infrastructure type (no Database, no SQLite).

import { Column, COLUMN_ORDER } from '../model/column.js';
import type { SubState } from '../model/sub-state.js';
import { isValidSubState } from '../model/sub-state.js';
import type { TicketRepository } from '../ports/driven/ticket-repository.port.js';
import type { TransitionRepository } from '../ports/driven/transition-repository.port.js';

export type DomainResult = { ok: true } | { ok: false; reason: string };
export type TransitionResult = DomainResult;
export type SetSubStateResult = DomainResult;

export class StateMachineService {
  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly transitionRepo: TransitionRepository,
  ) {}

  transition(
    projectId: string,
    ticketId: string,
    targetColumn: Column,
    comment?: string,
  ): TransitionResult {
    // 1. Load ticket
    const ticket = this.ticketRepo.findById(projectId, ticketId);
    if (!ticket) {
      return { ok: false, reason: 'Ticket not found' };
    }

    const currentColumn = ticket.column;

    // 2. Same column — illegal
    if (currentColumn === targetColumn) {
      return { ok: false, reason: `Already in ${currentColumn}` };
    }

    const currentIndex = COLUMN_ORDER.indexOf(currentColumn);
    const targetIndex = COLUMN_ORDER.indexOf(targetColumn);

    // 3. Validate transition legality
    const isForward = targetIndex > currentIndex;

    if (isForward) {
      // Forward: must be exactly adjacent (next column only)
      if (targetIndex !== currentIndex + 1) {
        return {
          ok: false,
          reason: `Cannot transition from ${currentColumn} to ${targetColumn}`,
        };
      }
    }
    // Backward: any prior column is allowed — no additional check needed

    // 4. Legal transition — execute
    const now = new Date().toISOString();
    const fromSubState = ticket.subState;
    const toSubState = null; // caller sets via setSubState() after transition

    // Record the transition
    this.transitionRepo.record({
      ticketId,
      projectId,
      fromColumn: currentColumn,
      toColumn: targetColumn,
      fromSubState,
      toSubState,
      comment: comment ?? null,
      at: now,
    });

    // 5. Update the ticket's column
    this.ticketRepo.updateColumn(projectId, ticketId, targetColumn);

    // BACKLOG exception: reset sub-state to null
    if (targetColumn === Column.BACKLOG) {
      this.ticketRepo.updateSubState(projectId, ticketId, null);
    }

    return { ok: true };
  }

  setSubState(projectId: string, ticketId: string, subState: SubState): SetSubStateResult {
    // 1. Load ticket
    const ticket = this.ticketRepo.findById(projectId, ticketId);
    if (!ticket) {
      return { ok: false, reason: 'Ticket not found' };
    }

    // 2. BACKLOG guard — BACKLOG tickets must have sub_state = NULL
    if (ticket.column === Column.BACKLOG) {
      return { ok: false, reason: 'Cannot set sub-state on a BACKLOG ticket' };
    }

    // 3. Validate sub-state value at runtime
    if (!isValidSubState(subState)) {
      return { ok: false, reason: `Invalid sub-state: ${subState as string}` };
    }

    // 4. Update ticket sub-state
    this.ticketRepo.updateSubState(projectId, ticketId, subState);

    return { ok: true };
  }
}
