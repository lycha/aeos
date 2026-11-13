// Use case — ProjectBoard (cross-project board of every registered project's tickets)

import * as fs from 'node:fs';
import * as path from 'node:path';

import { SubState } from '../domain/model/sub-state.js';
import type { Ticket } from '../domain/model/ticket.js';
import type { ConfigStore } from '../domain/ports/driven/config-store.port.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type {
  ProjectBoardPort,
  ProjectBoardResult,
} from '../domain/ports/driving/project-board.port.js';

/**
 * AC-6/AC-35: a pending gate is exactly SIGNED_OFF — the state awaiting
 * ticketApprove/ticketDodApprove (D-001/D-002) — never a GateRecordStore
 * query, which only holds decisions already made.
 */
function needsHuman(ticket: Ticket): boolean {
  const awaitingDecision =
    ticket.subState === SubState.BLOCKED ||
    ticket.subState === SubState.ESCALATED ||
    ticket.subState === SubState.SIGNED_OFF;
  return awaitingDecision || ticket.contractChange?.approvedBy === null;
}

export class ProjectBoardUseCase implements ProjectBoardPort {
  constructor(
    private readonly ticketRepo: TicketRepository,
    private readonly configStore: ConfigStore,
  ) {}

  execute(): ProjectBoardResult {
    const projects = this.configStore.readRegistry().map((entry) => {
      const available =
        fs.existsSync(entry.path) && fs.existsSync(path.join(entry.path, '.aeos', 'project.json'));
      const tickets = this.ticketRepo
        .findByProject(entry.id)
        .map((ticket) => ({ ...ticket, needsHuman: needsHuman(ticket) }));
      return { key: entry.key, name: entry.name, path: entry.path, available, tickets };
    });
    return { ok: true, projects };
  }
}
