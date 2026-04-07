#!/usr/bin/env node
// CLI layer — Commander.js bootstrap entrypoint

import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { Command } from 'commander';
import { createContainer } from './container.js';
import { registerInstallCommand } from './commands/install.command.js';

export { createContainer } from './container.js';
export type { Container } from './container.js';
export { registerInstallCommand } from './commands/install.command.js';

export function buildProgram(): Command {
  const program = new Command();
  program.name('aeos').version('0.1.0');

  const container = createContainer();
  registerInstallCommand(program, container.install);

  return program;
}

// Only parse when run as CLI entrypoint (not when imported as module)
const thisFile = fileURLToPath(import.meta.url);
const isEntrypoint =
  process.argv[1] != null && realpathSync(process.argv[1]) === realpathSync(thisFile);

if (isEntrypoint) {
  buildProgram().parse();
}
