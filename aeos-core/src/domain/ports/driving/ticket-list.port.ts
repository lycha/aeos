// Driving port — TicketList use case interface

import type { Column } from '../../model/column.js';
import type { Ticket } from '../../model/ticket.js';

export interface TicketListInput {
  projectId: string;
  columnFilter?: Column;
}

export interface TicketListPort {
  execute(input: TicketListInput): Ticket[];
}
