// Driven port — OrchestratorStateRepository: per-epic autonomous run state

import type { OrchestratorState } from '../../model/orchestrator-state.js';

export interface OrchestratorStateRepository {
  /** Returns the stored state for an epic, or null if it has never been driven. */
  find(projectId: string, epicId: string): OrchestratorState | null;
  /** Inserts or replaces the state for an epic. */
  upsert(state: OrchestratorState): void;
  /** Returns every epic with stored orchestrator state in a project. */
  findByProject(projectId: string): OrchestratorState[];
}
