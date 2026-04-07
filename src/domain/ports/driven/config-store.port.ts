// Driven port — ConfigStore: global config, registry, and gitignore operations

export interface GlobalConfig {
  model: string;
  currency: string;
  advanceMode: string;
}

export interface ProjectRegistryEntry {
  uuid: string;
  id: string;
  name: string;
  key: string;
  path: string;
  aeos_path: string;
  created_at: string;
}

export interface ConfigStore {
  ensureHomeDir(): void;
  readConfig(): GlobalConfig | null;
  writeConfigIfNotExists(config: GlobalConfig): void;
  readRegistry(): ProjectRegistryEntry[];
  writeRegistry(entries: ProjectRegistryEntry[]): void;
  writeRegistryIfNotExists(entries: ProjectRegistryEntry[]): void;
  ensureGlobalGitignore(pattern: string): void;
}
