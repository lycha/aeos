// Aggregate — Ticket (id, title, column, subState, createdAt, updatedAt)

import type { Column } from './column.js';
import type { SubStateOrNull } from './sub-state.js';

export interface Ticket {
  /** Ticket identifier, e.g. "AEOS-1" */
  id: string;
  /** Project slug from project.json, e.g. "startup-a" */
  projectId: string;
  /** Human-readable title */
  title: string;
  /** Pipeline column */
  column: Column;
  /** Sub-state within the column — null for BACKLOG tickets */
  subState: SubStateOrNull;
  /** ISO-8601 creation timestamp */
  createdAt: string;
  /** ISO-8601 last-updated timestamp */
  updatedAt: string;
}
