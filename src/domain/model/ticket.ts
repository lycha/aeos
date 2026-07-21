// Aggregate — Ticket (id, kind, parent, title, column, subState, timestamps)

import type { Column } from './column.js';
import type { SubStateOrNull } from './sub-state.js';
import type { TicketKind } from './ticket-kind.js';

export interface Ticket {
  /** Ticket identifier, e.g. "AEOS-1" */
  id: string;
  /** Project slug from project.json, e.g. "startup-a" */
  projectId: string;
  /** Human-readable title */
  title: string;
  /** EPIC or TASK — determines which column pipeline applies */
  kind: TicketKind;
  /** Parent epic ID for a TASK; null for an EPIC */
  parentId: string | null;
  /** Pipeline column */
  column: Column;
  /** Sub-state within the column — null for BACKLOG tickets */
  subState: SubStateOrNull;
  /** ISO-8601 creation timestamp */
  createdAt: string;
  /** ISO-8601 last-updated timestamp */
  updatedAt: string;
}
