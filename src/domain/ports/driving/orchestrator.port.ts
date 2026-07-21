// Driving port — Orchestrator use case interface (autonomous epic runs)

import type { HaltReason } from '../../services/orchestrator-policy.js';
import type { OrchestratorState } from '../../model/orchestrator-state.js';

export interface OrchestratorStep {
  readonly action: 'run' | 'advance';
  readonly ticketId: string;
  /** One-line outcome, suitable for a progress log. */
  readonly outcome: string;
}

export interface OrchestratorRunResult {
  readonly epicId: string;
  readonly haltReason: HaltReason;
  readonly message: string;
  readonly steps: readonly OrchestratorStep[];
  readonly spentUsd: number;
}

export interface OrchestratorRunOptions {
  /** USD ceiling for this epic. Persisted, so later runs inherit it. */
  readonly budgetUsd?: number;
  /** Safety bound on scheduled actions per invocation. */
  readonly maxSteps?: number;
}

export interface OrchestratorObserver {
  onStep?(step: OrchestratorStep): void;
}

export interface OrchestratorPort {
  run(
    projectId: string,
    projectPath: string,
    epicId: string,
    options?: OrchestratorRunOptions,
    observer?: OrchestratorObserver,
  ): Promise<OrchestratorRunResult>;

  pause(projectId: string, epicId: string): OrchestratorState;
  resume(projectId: string, epicId: string): OrchestratorState;
  status(projectId: string, epicId?: string): OrchestratorState[];
}
