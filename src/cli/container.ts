// CLI — Composition root / dependency injection wiring

import type { InstallPort } from '../domain/ports/driving/install.port.js';
import type { ProjectInitPort } from '../domain/ports/driving/project-init.port.js';
import { FsConfigStore } from '../infrastructure/filesystem/fs-config.adapter.js';
import { FsProjectRepository } from '../infrastructure/filesystem/fs-project.repository.js';
import { SimpleGitGateway } from '../infrastructure/git/simple-git-gateway.adapter.js';
import { InstallUseCase } from '../application/install.use-case.js';
import { ProjectInitUseCase } from '../application/project-init.use-case.js';

export interface Container {
  install: InstallPort;
  projectInit: ProjectInitPort;
}

export function createContainer(): Container {
  const configStore = new FsConfigStore();
  const projectRepo = new FsProjectRepository();
  const gitGateway = new SimpleGitGateway();

  return {
    install: new InstallUseCase(configStore),
    projectInit: new ProjectInitUseCase(projectRepo, configStore, gitGateway),
  };
}
