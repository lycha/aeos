// Domain service — decides the orchestrator's next action for an epic.
//
// This is deliberately a pure function, not an LLM call. Every decision here is
// a predicate over structured state: is the budget spent? is this ticket
// signed off? are all children done? Putting a model in this path would add
// cost per tick, make control flow non-deterministic, and make "why did this
// advance?" unanswerable from the transition log.
//
// LLM judgment belongs in the workers and reviewers, which this schedules.

import { Column } from '../model/column.js';
import { SubState } from '../model/sub-state.js';
import { TicketKind } from '../model/ticket-kind.js';
import type { Ticket } from '../model/ticket.js';

export const HaltReason = {
  /** Every task and the epic itself reached DONE. */
  COMPLETE: 'COMPLETE',
  /** The epic reached the human-only DoD gate. */
  HUMAN_GATE: 'HUMAN_GATE',
  /** A ticket escalated — a human must resolve it before work continues. */
  NEEDS_HUMAN: 'NEEDS_HUMAN',
  /** A ticket failed outright. */
  FAILED: 'FAILED',
  /** Spend reached the configured ceiling. */
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
  /** A column is set to manual advance, so the operator must approve. */
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
  /**
   * The epic is decomposed but has no child tasks yet.
   * Creating them from `tasks.md` is still a human step.
   */
  AWAITING_DECOMPOSITION: 'AWAITING_DECOMPOSITION',
} as const;

export type HaltReason = (typeof HaltReason)[keyof typeof HaltReason];

export type OrchestratorAction =
  | { readonly kind: 'run'; readonly ticketId: string; readonly reason: string }
  | { readonly kind: 'advance'; readonly ticketId: string; readonly reason: string }
  | { readonly kind: 'halt'; readonly reason: HaltReason; readonly message: string };

export interface OrchestratorPolicyInput {
  readonly epic: Ticket;
  /** Child tasks of the epic, in creation order. Empty for an undecomposed epic. */
  readonly children: readonly Ticket[];
  /** Total USD recorded against the epic and its children so far. */
  readonly spentUsd: number;
  /** Ceiling in USD, or null for no ceiling. */
  readonly budgetUsd: number | null;
  /** Whether the given column may advance without a human. */
  readonly autoAdvance: (column: Column) => boolean;
}

/** Sub-states that mean "a human must look at this before work continues". */
function needsHuman(ticket: Ticket): HaltReason | null {
  if (ticket.subState === SubState.ESCALATED) return HaltReason.NEEDS_HUMAN;
  if (ticket.subState === SubState.FAILED) return HaltReason.FAILED;
  if (ticket.subState === SubState.BLOCKED) return HaltReason.NEEDS_HUMAN;
  if (ticket.subState === SubState.INTERRUPTED) return HaltReason.NEEDS_HUMAN;
  return null;
}

/** A ticket is runnable when it is queued and not already terminal. */
function isRunnable(ticket: Ticket): boolean {
  return (
    ticket.column !== Column.DONE &&
    ticket.column !== Column.BACKLOG &&
    ticket.column !== Column.DOD_GATE &&
    (ticket.subState === SubState.READY || ticket.subState === null)
  );
}

function decideForTicket(
  ticket: Ticket,
  autoAdvance: (column: Column) => boolean,
): OrchestratorAction | null {
  const halt = needsHuman(ticket);
  if (halt) {
    return {
      kind: 'halt',
      reason: halt,
      message: `${ticket.id} is ${ticket.subState} in ${ticket.column} and needs a human before work continues.`,
    };
  }

  if (ticket.subState === SubState.SIGNED_OFF || ticket.column === Column.BACKLOG) {
    if (!autoAdvance(ticket.column)) {
      return {
        kind: 'halt',
        reason: HaltReason.AWAITING_APPROVAL,
        message: `${ticket.id} is ready to leave ${ticket.column}, but that column advances manually. Run \`aeos ticket approve ${ticket.id}\`.`,
      };
    }
    return {
      kind: 'advance',
      ticketId: ticket.id,
      reason: `${ticket.id} signed off in ${ticket.column}; advancing.`,
    };
  }

  if (isRunnable(ticket)) {
    return {
      kind: 'run',
      ticketId: ticket.id,
      reason: `Running ${ticket.column} for ${ticket.id}.`,
    };
  }

  return null;
}

/**
 * Decides the single next action. The caller performs it and calls again —
 * one step at a time keeps the loop restartable and every decision auditable.
 */
export function decideNextAction(input: OrchestratorPolicyInput): OrchestratorAction {
  const { epic, children, spentUsd, budgetUsd, autoAdvance } = input;

  // Budget is checked first: an exhausted budget stops everything, regardless
  // of what the pipeline would otherwise do next.
  if (budgetUsd !== null && spentUsd >= budgetUsd) {
    return {
      kind: 'halt',
      reason: HaltReason.BUDGET_EXCEEDED,
      message: `Epic ${epic.id} has spent $${spentUsd.toFixed(2)} against a $${budgetUsd.toFixed(2)} ceiling.`,
    };
  }

  if (epic.column === Column.DONE) {
    return {
      kind: 'halt',
      reason: HaltReason.COMPLETE,
      message: `Epic ${epic.id} is DONE.`,
    };
  }

  // DoD is human-only by design; TicketRunUseCase refuses it too.
  if (epic.column === Column.DOD_GATE) {
    return {
      kind: 'halt',
      reason: HaltReason.HUMAN_GATE,
      message: `Epic ${epic.id} reached DOD_GATE. Final sign-off is human-only — run \`aeos ticket dod-approve ${epic.id}\`.`,
    };
  }

  const epicHalt = needsHuman(epic);
  if (epicHalt) {
    return {
      kind: 'halt',
      reason: epicHalt,
      message: `Epic ${epic.id} is ${epic.subState} in ${epic.column} and needs a human before work continues.`,
    };
  }

  // Once decomposed, the epic waits on its children; their build pipelines are
  // the work. The epic itself never implements anything.
  const decomposed = epic.column === Column.TASK_BREAKDOWN && epic.subState === SubState.SIGNED_OFF;
  if (decomposed) {
    if (children.length === 0) {
      return {
        kind: 'halt',
        reason: HaltReason.AWAITING_DECOMPOSITION,
        message: `Epic ${epic.id} is decomposed but has no child tasks. Create them from its tasks.md with \`aeos ticket create <title> --parent ${epic.id}\`.`,
      };
    }

    // A blocked child halts the whole epic — surface it before scheduling more
    // work that a human is about to invalidate.
    for (const child of children) {
      const childHalt = needsHuman(child);
      if (childHalt) {
        return {
          kind: 'halt',
          reason: childHalt,
          message: `Task ${child.id} is ${child.subState} in ${child.column} and needs a human before the epic continues.`,
        };
      }
    }

    // Work children one at a time, in order. Sequential by design: sibling
    // tasks touching overlapping paths would otherwise race in the worktree.
    for (const child of children) {
      if (child.column === Column.DONE) continue;
      const action = decideForTicket(child, autoAdvance);
      if (action) return action;
    }

    // Every child is DONE — the epic can move to its human gate.
    if (!autoAdvance(epic.column)) {
      return {
        kind: 'halt',
        reason: HaltReason.AWAITING_APPROVAL,
        message: `All tasks under ${epic.id} are DONE, but ${epic.column} advances manually. Run \`aeos ticket approve ${epic.id}\`.`,
      };
    }
    return {
      kind: 'advance',
      ticketId: epic.id,
      reason: `All tasks under ${epic.id} are DONE; advancing the epic.`,
    };
  }

  const epicAction = decideForTicket(epic, autoAdvance);
  if (epicAction) return epicAction;

  return {
    kind: 'halt',
    reason: HaltReason.NEEDS_HUMAN,
    message: `Epic ${epic.id} is ${epic.subState ?? 'in no sub-state'} in ${epic.column}, which the orchestrator has no action for.`,
  };
}

/** Sums recorded spend across an epic and its children. */
export function totalSpend(costsByTicket: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const amount of costsByTicket.values()) total += amount;
  return total;
}

/** True when the ticket is an epic — the only kind the orchestrator drives. */
export function isOrchestratable(ticket: Ticket): boolean {
  return ticket.kind === TicketKind.EPIC;
}
