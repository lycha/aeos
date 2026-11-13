// Application service — the explicit, finite (subState, role, pendingAmendment)
// -> decision-form table AC-9/AC-22 need. Pure, no I/O: a reviewer can read
// the entire eligibility rule in one function.

import { Column } from '../../domain/model/column.js';
import type { ColumnRole } from '../../domain/model/column-spec.js';
import { SubState } from '../../domain/model/sub-state.js';
import type { SubStateOrNull } from '../../domain/model/sub-state.js';

export type AvailableActionId =
  | 'ticketAnswer'
  | 'ticketResolve'
  | 'ticketApprove'
  | 'ticketDodApprove'
  | 'ticketSignOff'
  | 'ticketReady'
  | 'ticketRepin'
  | 'ticketMove';

export interface AvailableActionsInput {
  readonly column: Column;
  readonly subState: SubStateOrNull;
  readonly role: ColumnRole;
  readonly pendingAmendment: boolean;
}

/**
 * READY, WORKING and null all return []: none is a human decision (the
 * "run" affordance is a separate UI control), matching D-001.
 */
function decisionActionsFor(
  subState: SubStateOrNull,
  role: ColumnRole,
  pendingAmendment: boolean,
): readonly AvailableActionId[] {
  switch (subState) {
    case SubState.BLOCKED:
      return pendingAmendment ? ['ticketRepin', 'ticketReady'] : ['ticketAnswer', 'ticketReady'];
    case SubState.ESCALATED:
      return ['ticketResolve', 'ticketReady'];
    case SubState.FAILED:
    case SubState.INTERRUPTED:
      return ['ticketReady'];
    case SubState.IN_REVIEW:
      return ['ticketSignOff'];
    case SubState.SIGNED_OFF:
      return role === 'final-gate' ? ['ticketDodApprove'] : ['ticketApprove'];
    case SubState.WORKING:
    case SubState.READY:
    case null:
      return [];
  }
}

/** `'ticketMove'` is a standing override: present whenever the column is not BACKLOG/DONE. */
export function availableActionsFor(input: AvailableActionsInput): readonly AvailableActionId[] {
  const { column, subState, role, pendingAmendment } = input;
  if (column === Column.BACKLOG || column === Column.DONE) return [];
  return [...decisionActionsFor(subState, role, pendingAmendment), 'ticketMove'];
}
