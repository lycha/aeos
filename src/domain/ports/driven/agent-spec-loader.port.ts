// Driven port — AgentSpecLoader: load/validate YAML agent specs

import type { AgentSpec } from '../../model/agent-spec.js';

export interface AgentSpecLoader {
  load(agentFile: string, root?: string): AgentSpec;
}
