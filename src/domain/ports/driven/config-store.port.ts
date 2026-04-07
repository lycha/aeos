// Driven port — ConfigStore: global config, registry, and gitignore operations

export interface GlobalConfig {
  model: string;
  currency: string;
  advanceMode: string;
}

export interface ProjectRegistryEntry {
  key: string;
  name: string;
  path: string;
  registeredAt: string;
}

export interface ConfigStore {
  ensureHomeDir(): void;
  readConfig(): GlobalConfig | null;
  writeConfigIfNotExists(config: GlobalConfig): void;
  readRegistry(): ProjectRegistryEntry[];
  writeRegistry(entries: ProjectRegistryEntry[]): void;
  ensureGlobalGitignore(pattern: string): void;
}
