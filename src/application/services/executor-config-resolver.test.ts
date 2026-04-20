import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExecutorConfigResolver } from './executor-config-resolver.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';
import type { AgentSpec } from '../../domain/model/agent-spec.js';

function createMockProjectRepo(): ProjectRepository {
  return {
    read: vi.fn(),
    writeProject: vi.fn(),
    ensureColumnSpecsDir: vi.fn(),
    findRoot: vi.fn().mockReturnValue('/project'),
    readExecutorConfig: vi.fn().mockReturnValue(null),
    readConstraints: vi.fn().mockReturnValue(null),
    writeConstraintsPlaceholder: vi.fn(),
  } as unknown as ProjectRepository;
}

function createAgentSpec(overrides: Partial<AgentSpec['executor']> = {}): AgentSpec {
  return {
    name: 'engineer-agent',
    systemPrompt: 'System',
    taskInstruction: 'Task',
    outputFormat: 'Markdown',
    selfVerificationChecklist: [],
    executor: {
      type: 'stub',
      timeoutSeconds: 300,
      ...overrides,
    },
  };
}

describe('ExecutorConfigResolver', () => {
  let projectRepo: ReturnType<typeof createMockProjectRepo>;
  let resolver: ExecutorConfigResolver;

  beforeEach(() => {
    projectRepo = createMockProjectRepo();
    resolver = new ExecutorConfigResolver(projectRepo);
  });

  it('reads project executor config through ProjectRepository', () => {
    (projectRepo.readExecutorConfig as ReturnType<typeof vi.fn>).mockReturnValue({
      uuid: '550e8400-e29b-41d4-a716-446655440000',
      id: 'proj',
      name: 'Project',
      key: 'PRJ',
      path: '/project',
      created_at: '2026-01-01T00:00:00.000Z',
      executor: { type: 'ollama-cli', model: 'llama3.2' },
    });

    const result = resolver.resolveExecutorConfig('/project', createAgentSpec());

    expect(projectRepo.readExecutorConfig).toHaveBeenCalledWith('/project');
    expect(result).toEqual({
      executorType: 'ollama-cli',
      model: 'llama3.2',
      timeoutMs: 300_000,
    });
  });

  it('prefers CLI overrides over agent spec and project config', () => {
    (projectRepo.readExecutorConfig as ReturnType<typeof vi.fn>).mockReturnValue({
      uuid: '550e8400-e29b-41d4-a716-446655440000',
      id: 'proj',
      name: 'Project',
      key: 'PRJ',
      path: '/project',
      created_at: '2026-01-01T00:00:00.000Z',
      executor: { type: 'ollama-cli', model: 'llama3.2' },
    });

    const result = resolver.resolveExecutorConfig(
      '/project',
      createAgentSpec({ type: 'claude-cli', model: 'claude-sonnet' }),
      { executorType: 'auggie-cli', model: 'auggie-pro' },
    );

    expect(result).toEqual({
      executorType: 'auggie-cli',
      model: 'auggie-pro',
      timeoutMs: 300_000,
    });
  });

  it('throws on invalid CLI executor type', () => {
    expect(() =>
      resolver.resolveExecutorConfig('/project', createAgentSpec(), {
        executorType: 'invalid' as 'claude-cli',
      }),
    ).toThrow('Invalid executor type: invalid');
  });
});
