import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InstallUseCase } from './install.use-case.js';
import type { ConfigStore } from '../domain/ports/driven/config-store.port.js';
import { DEFAULT_GLOBAL_CONFIG, AEOS_GITIGNORE_PATTERN } from '../shared/config.js';

function createMockConfigStore(): ConfigStore {
  return {
    ensureHomeDir: vi.fn(),
    readConfig: vi.fn().mockReturnValue(null),
    writeConfigIfNotExists: vi.fn(),
    readRegistry: vi.fn().mockReturnValue([]),
    writeRegistry: vi.fn(),
    ensureGlobalGitignore: vi.fn(),
  };
}

describe('InstallUseCase', () => {
  let configStore: ReturnType<typeof createMockConfigStore>;
  let useCase: InstallUseCase;

  beforeEach(() => {
    configStore = createMockConfigStore();
    useCase = new InstallUseCase(configStore);
  });

  it('should ensure home directory exists', () => {
    useCase.execute();
    expect(configStore.ensureHomeDir).toHaveBeenCalledOnce();
  });

  it('should write default config if not exists', () => {
    useCase.execute();
    expect(configStore.writeConfigIfNotExists).toHaveBeenCalledWith(DEFAULT_GLOBAL_CONFIG);
  });

  it('should write empty registry', () => {
    useCase.execute();
    expect(configStore.writeRegistry).toHaveBeenCalledWith([]);
  });

  it('should ensure global gitignore pattern', () => {
    useCase.execute();
    expect(configStore.ensureGlobalGitignore).toHaveBeenCalledWith(AEOS_GITIGNORE_PATTERN);
  });

  it('should call operations in order: homeDir, config, registry, gitignore', () => {
    const callOrder: string[] = [];
    (configStore.ensureHomeDir as ReturnType<typeof vi.fn>).mockImplementation(() =>
      callOrder.push('ensureHomeDir'),
    );
    (configStore.writeConfigIfNotExists as ReturnType<typeof vi.fn>).mockImplementation(() =>
      callOrder.push('writeConfigIfNotExists'),
    );
    (configStore.writeRegistry as ReturnType<typeof vi.fn>).mockImplementation(() =>
      callOrder.push('writeRegistry'),
    );
    (configStore.ensureGlobalGitignore as ReturnType<typeof vi.fn>).mockImplementation(() =>
      callOrder.push('ensureGlobalGitignore'),
    );

    useCase.execute();

    expect(callOrder).toEqual([
      'ensureHomeDir',
      'writeConfigIfNotExists',
      'writeRegistry',
      'ensureGlobalGitignore',
    ]);
  });
});
