// Shared kernel — global configuration constants and types

import * as path from 'node:path';
import * as os from 'node:os';

import type { GlobalConfig } from '../domain/ports/driven/config-store.port.js';

/** Returns the path to ~/.aeos/ */
export function aeosHome(): string {
  return path.join(os.homedir(), '.aeos');
}

/** Default global config written on first install */
export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = {
  model: 'claude-opus-4-6',
  currency: 'USD',
  advanceMode: 'manual',
};

export const CONFIG_FILENAME = 'config.json';
export const REGISTRY_FILENAME = 'registry.json';
export const AEOS_GITIGNORE_PATTERN = '.aeos/';
