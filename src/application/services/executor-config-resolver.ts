// Service — ExecutorConfigResolver: resolves effective executor config from CLI flags, agent spec, and project config

import type { AgentSpec } from '../../domain/model/agent-spec.js';
import type { ProjectExecutorConfig } from '../../domain/model/project-executor-config.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';

export interface ExecutorOverrides {
  executorType?: 'claude-cli' | 'auggie-cli' | 'ollama-cli';
  model?: string;
}

export interface ResolvedExecutorConfig {
  executorType: 'claude-cli' | 'auggie-cli' | 'ollama-cli' | 'stub';
  model?: string;
  timeoutMs: number;
}

export class ExecutorConfigResolver {
  constructor(private readonly projectRepo: ProjectRepository) {}

  /**
   * Resolves effective executor configuration with precedence:
   * CLI flag > agent spec > project config > default
   */
  resolveExecutorConfig(
    projectPath: string,
    agentSpec: AgentSpec,
    overrides?: ExecutorOverrides,
  ): ResolvedExecutorConfig {
    // Validate executor type from CLI overrides
    if (overrides?.executorType && !this.isValidExecutorType(overrides.executorType)) {
      throw new Error(
        `Invalid executor type: ${overrides.executorType}. Supported types: claude-cli, auggie-cli, ollama-cli`,
      );
    }

    // Read project config (if it exists)
    const projectConfig = this.projectRepo.readExecutorConfig(projectPath);

    // Resolve executor type with precedence
    const executorType = this.resolveExecutorType(overrides, agentSpec, projectConfig);

    // Resolve model with precedence
    const model = this.resolveModel(overrides, agentSpec, projectConfig);

    // Timeout comes from agent spec
    const timeoutMs = agentSpec.executor.timeoutSeconds * 1000;

    return {
      executorType,
      model,
      timeoutMs,
    };
  }

  private resolveExecutorType(
    overrides: ExecutorOverrides | undefined,
    agentSpec: AgentSpec,
    projectConfig: ProjectExecutorConfig | null,
  ): 'claude-cli' | 'auggie-cli' | 'ollama-cli' | 'stub' {
    // 1. CLI override takes highest precedence
    if (overrides?.executorType) {
      return overrides.executorType;
    }

    // 2. Agent spec executor type
    if (agentSpec.executor.type !== 'stub') {
      return agentSpec.executor.type;
    }

    // 3. Project config executor type
    if (projectConfig?.executor?.type) {
      return projectConfig.executor.type;
    }

    // 4. Default fallback
    return 'claude-cli';
  }

  private resolveModel(
    overrides: ExecutorOverrides | undefined,
    agentSpec: AgentSpec,
    projectConfig: ProjectExecutorConfig | null,
  ): string | undefined {
    // 1. CLI override takes highest precedence
    if (overrides?.model) {
      return overrides.model;
    }

    // 2. Agent spec model
    if (agentSpec.executor.model) {
      return agentSpec.executor.model;
    }

    // 3. Project config model
    if (projectConfig?.executor?.model) {
      return projectConfig.executor.model;
    }

    // 4. No model specified - let CLI tool use its default
    return undefined;
  }

  private isValidExecutorType(type: string): type is 'claude-cli' | 'auggie-cli' | 'ollama-cli' {
    return ['claude-cli', 'auggie-cli', 'ollama-cli'].includes(type);
  }
}
