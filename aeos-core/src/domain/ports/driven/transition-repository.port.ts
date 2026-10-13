// Driven port — TransitionRepository: record column transitions

import type { Column } from '../../model/column.js';
import type { SubStateOrNull } from '../../model/sub-state.js';

export interface TransitionRecord {
  ticketId: string;
  projectId: string;
  fromColumn: Column;
  toColumn: Column;
  fromSubState: SubStateOrNull;
  toSubState: SubStateOrNull;
  comment: string | null;
  at: string;
}

export interface TransitionRepository {
  /** Persists a transition row */
  record(transition: TransitionRecord): void;

  /** Returns all transitions for a given ticket, ordered chronologically */
  findByTicket(projectId: string, ticketId: string): TransitionRecord[];
}
