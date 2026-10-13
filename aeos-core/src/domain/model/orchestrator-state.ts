// Value Object — OrchestratorState (per-epic autonomous run state)
//
// Kept separate from the ticket row on purpose: this is orchestration
// bookkeeping, not workflow state. A ticket's column and sub-state mean the
// same thing whether or not anything is driving it.

import type { HaltReason } from '../services/orchestrator-policy.js';

export const OrchestratorStatus = {
  /** Never driven, or the last run ended cleanly. */
  IDLE: 'IDLE',
  /** A run is in flight. */
  RUNNING: 'RUNNING',
  /** Deliberately stopped by an operator; `orchestrator run` refuses to pick it up. */
  PAUSED: 'PAUSED',
} as const;

export type OrchestratorStatus = (typeof OrchestratorStatus)[keyof typeof OrchestratorStatus];

export interface OrchestratorState {
  readonly projectId: string;
  readonly epicId: string;
  readonly status: OrchestratorStatus;
  /** Why the last run stopped, if it stopped for a reason worth reporting. */
  readonly haltReason: HaltReason | null;
  readonly message: string | null;
  /** USD ceiling for this epic, or null for no ceiling. */
  readonly budgetUsd: number | null;
  readonly updatedAt: string;
}
