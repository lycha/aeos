// Driven port — ConfigStore: global config, registry, and gitignore operations

export interface ReviewLoopConfig {
  /**
   * When false, a REJECTED review ends the run immediately instead of giving
   * the worker another attempt. The kill switch for autonomous revision.
   */
  enabled: boolean;
  /** Hard ceiling on attempts per column, including the first. */
  maxIterations: number;
}

export interface GlobalConfig {
  model: string;
  currency: string;
  advanceMode: 'manual' | 'auto';
  reviewLoop: ReviewLoopConfig;
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
