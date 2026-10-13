// Use case — TicketList

import type { Ticket } from '../domain/model/ticket.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { TicketListPort, TicketListInput } from '../domain/ports/driving/ticket-list.port.js';

export class TicketListUseCase implements TicketListPort {
  constructor(private readonly ticketRepo: TicketRepository) {}

  execute(input: TicketListInput): Ticket[] {
    return this.ticketRepo.findByProject(input.projectId, input.columnFilter);
  }
}
