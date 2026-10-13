// Driven port — OrchestratorStateRepository: per-epic autonomous run state

import type { OrchestratorState } from '../../model/orchestrator-state.js';

export interface OrchestratorStateRepository {
  /** Returns the stored state for an epic, or null if it has never been driven. */
  find(projectId: string, epicId: string): OrchestratorState | null;
  /** Inserts or replaces the state for an epic. */
  upsert(state: OrchestratorState): void;
  /** Returns every epic with stored orchestrator state in a project. */
  findByProject(projectId: string): OrchestratorState[];
  /**
   * Bumps `updatedAt` without touching anything else — the liveness heartbeat
   * for an in-flight run. A RUNNING row that stops being touched is how a
   * crashed run is told apart from a slow one.
   */
  touch(projectId: string, epicId: string, at: string): void;
}
