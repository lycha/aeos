// Use case — Install (global setup)

import type { ConfigStore } from '../domain/ports/driven/config-store.port.js';
import type { InstallPort } from '../domain/ports/driving/install.port.js';
import { DEFAULT_GLOBAL_CONFIG, AEOS_GITIGNORE_PATTERN } from '../shared/config.js';

export class InstallUseCase implements InstallPort {
  constructor(private readonly configStore: ConfigStore) {}

  execute(): void {
    this.configStore.ensureHomeDir();
    this.configStore.writeConfigIfNotExists(DEFAULT_GLOBAL_CONFIG);
    this.configStore.writeRegistry([]);
    this.configStore.ensureGlobalGitignore(AEOS_GITIGNORE_PATTERN);
  }
}
