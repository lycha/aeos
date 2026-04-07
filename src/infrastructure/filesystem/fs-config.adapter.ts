// Adapter — Filesystem-based global config reader/writer

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';

import type {
  ConfigStore,
  GlobalConfig,
  ProjectRegistryEntry,
} from '../../domain/ports/driven/config-store.port.js';
import { aeosHome, CONFIG_FILENAME, REGISTRY_FILENAME } from '../../shared/config.js';

export class FsConfigStore implements ConfigStore {
  private get homePath(): string {
    return aeosHome();
  }

  private get configPath(): string {
    return path.join(this.homePath, CONFIG_FILENAME);
  }

  private get registryPath(): string {
    return path.join(this.homePath, REGISTRY_FILENAME);
  }

  ensureHomeDir(): void {
    fs.mkdirSync(this.homePath, { recursive: true });
  }

  readConfig(): GlobalConfig | null {
    if (!fs.existsSync(this.configPath)) return null;
    const raw = fs.readFileSync(this.configPath, 'utf-8');
    return JSON.parse(raw) as GlobalConfig;
  }

  writeConfigIfNotExists(config: GlobalConfig): void {
    if (fs.existsSync(this.configPath)) return;
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  }

  readRegistry(): ProjectRegistryEntry[] {
    if (!fs.existsSync(this.registryPath)) return [];
    const raw = fs.readFileSync(this.registryPath, 'utf-8');
    const data = JSON.parse(raw) as { projects: ProjectRegistryEntry[] };
    return data.projects;
  }

  writeRegistry(entries: ProjectRegistryEntry[]): void {
    const data = { projects: entries };
    fs.writeFileSync(this.registryPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  }

  writeRegistryIfNotExists(entries: ProjectRegistryEntry[]): void {
    if (fs.existsSync(this.registryPath)) return;
    this.writeRegistry(entries);
  }

  ensureGlobalGitignore(pattern: string): void {
    let excludesFile: string;

    try {
      excludesFile = execFileSync('git', ['config', '--global', 'core.excludesfile'], {
        encoding: 'utf-8',
      }).trim();
    } catch {
      // No core.excludesfile configured — use default
      excludesFile = path.join(os.homedir(), '.gitignore_global');
      execFileSync('git', ['config', '--global', 'core.excludesfile', excludesFile], {
        encoding: 'utf-8',
      });
    }

    // Resolve ~ in the path
    if (excludesFile.startsWith('~')) {
      excludesFile = path.join(os.homedir(), excludesFile.slice(1));
    }

    // Ensure directory exists
    const dir = path.dirname(excludesFile);
    fs.mkdirSync(dir, { recursive: true });

    // Read existing content, append if pattern not already present
    let content = '';
    if (fs.existsSync(excludesFile)) {
      content = fs.readFileSync(excludesFile, 'utf-8');
    }

    const lines = content.split('\n');
    if (!lines.some((line) => line.trim() === pattern)) {
      const suffix = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
      fs.writeFileSync(excludesFile, content + suffix + pattern + '\n', 'utf-8');
    }
  }
}
