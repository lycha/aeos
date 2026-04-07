// CLI — Composition root / dependency injection wiring

import type { InstallPort } from '../domain/ports/driving/install.port.js';
import { FsConfigStore } from '../infrastructure/filesystem/fs-config.adapter.js';
import { InstallUseCase } from '../application/install.use-case.js';

export interface Container {
  install: InstallPort;
}

export function createContainer(): Container {
  const configStore = new FsConfigStore();

  return {
    install: new InstallUseCase(configStore),
  };
}
