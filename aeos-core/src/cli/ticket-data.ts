// CLI — a ticket in the shapes the contract declares.

import type { Ticket, TicketEscalation } from '../domain/model/ticket.js';
import type { ColumnLabels } from '../domain/services/column-labels.js';
import type * as T from './generated/types.gen.js';

export function summaryOf(ticket: Ticket, labels: ColumnLabels): T.TicketSummary {
  return {
    id: ticket.id,
    title: ticket.title,
    kind: ticket.kind,
    parentId: ticket.parentId,
    column: ticket.column,
    columnLabel: labels[ticket.column],
    subState: ticket.subState,
  };
}

export function escalationOf(escalation?: TicketEscalation | null): T.Escalation | null {
  if (!escalation) return null;
  const { reason, message, artifactPath } = escalation;
  return { reason, message, ...(artifactPath ? { artifactPath } : {}) };
}

/** The known costs summed. Null when there are costs and none is known: never 0 for unknown. */
export function knownTotal(costs: readonly (number | null)[]): number | null {
  const known = costs.filter((cost) => cost !== null);
  return costs.length > 0 && known.length === 0 ? null : known.reduce((sum, cost) => sum + cost, 0);
}
