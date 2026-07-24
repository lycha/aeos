import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectInitUseCase } from './project-init.use-case.js';
import type { ProjectRepository } from '../domain/ports/driven/project-repository.port.js';
import type { ConfigStore } from '../domain/ports/driven/config-store.port.js';
import type { GitGateway } from '../domain/ports/driven/git-gateway.port.js';
import type { Project } from '../domain/model/project.js';

function createMockProjectRepo(): ProjectRepository {
  return {
    exists: vi.fn().mockReturnValue(false),
    read: vi.fn(),
    writeProject: vi.fn(),
    scaffoldDefaults: vi.fn().mockReturnValue([]),
    findRoot: vi.fn().mockReturnValue(null),
    readExecutorConfig: vi.fn().mockReturnValue(null),
    readConstraints: vi.fn().mockReturnValue(null),
    writeConstraintsPlaceholder: vi.fn(),
  };
}

function createMockConfigStore(): ConfigStore {
  return {
    ensureHomeDir: vi.fn(),
    readConfig: vi.fn().mockReturnValue(null),
    writeConfigIfNotExists: vi.fn(),
    readRegistry: vi.fn().mockReturnValue([]),
    writeRegistry: vi.fn(),
    writeRegistryIfNotExists: vi.fn(),
    ensureGlobalGitignore: vi.fn(),
  };
}

function createMockGitGateway(): GitGateway {
  return {
    init: vi.fn(),
    commit: vi.fn(),
    commitFiles: vi.fn(),
    stageAll: vi.fn(),
    commitAll: vi.fn().mockReturnValue(false),
    isRepo: vi.fn().mockReturnValue(true),
    ensureOnBranch: vi.fn(),
    tagHere: vi.fn(),
    diffRange: vi.fn().mockReturnValue(''),
    refExists: vi.fn().mockReturnValue(false),
    diff: vi.fn().mockReturnValue(''),
  };
}

describe('ProjectInitUseCase', () => {
  let projectRepo: ReturnType<typeof createMockProjectRepo>;
  let configStore: ReturnType<typeof createMockConfigStore>;
  let gitGateway: ReturnType<typeof createMockGitGateway>;
  let useCase: ProjectInitUseCase;

  beforeEach(() => {
    projectRepo = createMockProjectRepo();
    configStore = createMockConfigStore();
    gitGateway = createMockGitGateway();
    useCase = new ProjectInitUseCase(projectRepo, configStore, gitGateway);
  });

  it('should create project with correct slug id from name', () => {
    const result = useCase.execute({ name: 'My Project', key: 'MYPR', cwd: '/tmp/my-project' });

    expect(result).toEqual({ name: 'My Project', key: 'MYPR', scaffolded: [] });

    const writtenProject = (projectRepo.writeProject as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Project;
    expect(writtenProject.id).toBe('my-project');
    expect(writtenProject.name).toBe('My Project');
    expect(writtenProject.key).toBe('MYPR');
    expect(writtenProject.path).toBe('/tmp/my-project');
    expect(writtenProject.uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(writtenProject.created_at).toBeTruthy();
  });

  it('should init git repo in .aeos/ directory', () => {
    useCase.execute({ name: 'Test', key: 'TEST', cwd: '/tmp/test' });
    expect(gitGateway.init).toHaveBeenCalledWith('/tmp/test/.aeos');
  });

  it('should scaffold default specs, agents, and rubrics', () => {
    useCase.execute({ name: 'Test', key: 'TEST', cwd: '/tmp/test' });
    expect(projectRepo.scaffoldDefaults).toHaveBeenCalledWith('/tmp/test');
  });

  it('should write CONSTRAINTS.md placeholder on fresh init', () => {
    useCase.execute({ name: 'Test', key: 'TEST', cwd: '/tmp/test' });
    expect(projectRepo.writeConstraintsPlaceholder).toHaveBeenCalledWith('/tmp/test');
  });

  it('should register project in global registry', () => {
    useCase.execute({ name: 'Test', key: 'TEST', cwd: '/tmp/test' });

    expect(configStore.writeRegistry).toHaveBeenCalledOnce();
    const entries = (configStore.writeRegistry as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('/tmp/test');
    expect(entries[0].aeos_path).toBe('/tmp/test/.aeos');
    expect(entries[0].name).toBe('Test');
    expect(entries[0].key).toBe('TEST');
  });

  it('should be idempotent — skip creation when project already exists', () => {
    const existingProject: Project = {
      uuid: 'existing-uuid',
      id: 'existing',
      name: 'Existing',
      key: 'EXST',
      path: '/tmp/existing',
      created_at: '2024-01-01T00:00:00.000Z',
    };

    (projectRepo.exists as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (projectRepo.read as ReturnType<typeof vi.fn>).mockReturnValue(existingProject);

    const result = useCase.execute({ name: 'Different', key: 'DIFF', cwd: '/tmp/existing' });

    expect(result).toEqual({ name: 'Existing', key: 'EXST', scaffolded: [] });
    expect(projectRepo.writeProject).not.toHaveBeenCalled();
    expect(gitGateway.init).not.toHaveBeenCalled();
    // writeConstraintsPlaceholder IS called on re-init (idempotent — skips if file exists)
    expect(projectRepo.writeConstraintsPlaceholder).toHaveBeenCalledWith('/tmp/existing');
  });

  it('should not duplicate registry entry on re-run', () => {
    const existingProject: Project = {
      uuid: 'existing-uuid',
      id: 'existing',
      name: 'Existing',
      key: 'EXST',
      path: '/tmp/existing',
      created_at: '2024-01-01T00:00:00.000Z',
    };

    (projectRepo.exists as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (projectRepo.read as ReturnType<typeof vi.fn>).mockReturnValue(existingProject);
    (configStore.readRegistry as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        uuid: 'existing-uuid',
        id: 'existing',
        name: 'Existing',
        key: 'EXST',
        path: '/tmp/existing',
        aeos_path: '/tmp/existing/.aeos',
        created_at: '2024-01-01T00:00:00.000Z',
      },
    ]);

    useCase.execute({ name: 'Existing', key: 'EXST', cwd: '/tmp/existing' });

    // writeRegistry should NOT be called since entry already exists
    expect(configStore.writeRegistry).not.toHaveBeenCalled();
  });

  it('should call operations in correct order', () => {
    const callOrder: string[] = [];
    (projectRepo.writeProject as ReturnType<typeof vi.fn>).mockImplementation(() =>
      callOrder.push('writeProject'),
    );
    (gitGateway.init as ReturnType<typeof vi.fn>).mockImplementation(() =>
      callOrder.push('gitInit'),
    );
    (projectRepo.scaffoldDefaults as ReturnType<typeof vi.fn>).mockImplementation(() =>
      callOrder.push('scaffoldDefaults'),
    );
    (projectRepo.writeConstraintsPlaceholder as ReturnType<typeof vi.fn>).mockImplementation(() =>
      callOrder.push('writeConstraintsPlaceholder'),
    );
    (configStore.readRegistry as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (configStore.writeRegistry as ReturnType<typeof vi.fn>).mockImplementation(() =>
      callOrder.push('writeRegistry'),
    );

    useCase.execute({ name: 'Test', key: 'TEST', cwd: '/tmp/test' });

    expect(callOrder).toEqual([
      'writeProject',
      'gitInit',
      'scaffoldDefaults',
      'writeConstraintsPlaceholder',
      'writeRegistry',
    ]);
  });

  it('should derive slug correctly for names with special characters', () => {
    useCase.execute({ name: 'My  Cool---Project!!', key: 'MYCO', cwd: '/tmp/test' });

    const writtenProject = (projectRepo.writeProject as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as Project;
    expect(writtenProject.id).toBe('my-cool-project');
  });
});
