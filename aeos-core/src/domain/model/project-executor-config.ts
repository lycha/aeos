// Value Object — ProjectExecutorConfig (extends Project with optional executor defaults)

import type { Project } from './project.js';

export interface ProjectExecutorConfig extends Project {
  readonly executor?: {
    readonly type?: 'claude-cli' | 'auggie-cli' | 'opencode-cli' | 'ollama-cli';
    readonly model?: string;
  };
}
