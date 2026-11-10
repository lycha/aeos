// Domain service — what an executor type can do, as pure predicates.

import type { AgentSpec } from '../model/agent-spec.js';

/** True when the executor returns a cost with its result. A budget needs one that does. */
export function reportsCost(executorType: AgentSpec['executor']['type']): boolean {
  return executorType === 'claude-cli' || executorType === 'stub';
}
