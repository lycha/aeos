// Shared kernel — global configuration constants and types

import * as path from 'node:path';
import * as os from 'node:os';

import type { GlobalConfig } from '../domain/ports/driven/config-store.port.js';

/** Returns the path to ~/.aeos/ (overridable via AEOS_HOME env var for testing) */
export function aeosHome(): string {
  return process.env.AEOS_HOME ?? path.join(os.homedir(), '.aeos');
}

/** Returns the absolute path to a file inside ~/.aeos/ */
export function aeosHomePath(...segments: string[]): string {
  return path.join(aeosHome(), ...segments);
}

export const CONFIG_FILENAME = 'config.json';
export const REGISTRY_FILENAME = 'registry.json';
export const AEOS_GITIGNORE_PATTERN = '.aeos/';

/** Convenience wrapper — path to ~/.aeos/config.json */
export const aeosConfigPath = (): string => aeosHomePath(CONFIG_FILENAME);

/** Convenience wrapper — path to ~/.aeos/registry.json */
export const aeosRegistryPath = (): string => aeosHomePath(REGISTRY_FILENAME);

/** Convenience wrapper — path to ~/.aeos/state.db */
export const aeosDbPath = (): string => aeosHomePath('state.db');

/** Default global config written on first install */
export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  model: 'claude-opus-4-6',
  currency: 'USD',
  advanceMode: 'manual',
};
