#!/usr/bin/env node
// CLI layer — Commander.js bootstrap entrypoint

import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { Command } from 'commander';
import { createContainer } from './container.js';
import { registerInstallCommand } from './commands/install.command.js';
import { registerProjectInitCommand } from './commands/project-init.command.js';
import { registerTicketCreateCommand } from './commands/ticket-create.command.js';
import { registerTicketListCommand } from './commands/ticket-list.command.js';
import { registerTicketShowCommand } from './commands/ticket-show.command.js';
import { registerTicketAnswerCommand } from './commands/ticket-answer.command.js';
import { registerTicketRunCommand } from './commands/ticket-run.command.js';

export { createContainer } from './container.js';
export type { Container } from './container.js';
export { registerInstallCommand } from './commands/install.command.js';
export { registerProjectInitCommand } from './commands/project-init.command.js';
export { registerTicketCreateCommand } from './commands/ticket-create.command.js';
export { registerTicketListCommand } from './commands/ticket-list.command.js';
export { registerTicketShowCommand } from './commands/ticket-show.command.js';
export { registerTicketAnswerCommand } from './commands/ticket-answer.command.js';
export { registerTicketRunCommand } from './commands/ticket-run.command.js';

export function buildProgram(): Command {
  const program = new Command();
  program.name('aeos').version('0.1.0');

  const container = createContainer();
  registerInstallCommand(program, container.install);
  registerProjectInitCommand(program, container.projectInit);

  // Ticket commands access the DB — resolve lazily inside the action callback,
  // not at program build time. This allows `aeos install` and `aeos project init`
  // to run before .aeos/ (and state.db) exist.
  registerTicketCreateCommand(program, () => container.ticketCreate, container.projectRepo);
  registerTicketListCommand(program, () => container.ticketList, container.projectRepo);
  registerTicketShowCommand(program, () => container.ticketShow, container.projectRepo);
  registerTicketAnswerCommand(program, () => container.ticketAnswer, container.projectRepo);
  registerTicketRunCommand(program, () => container.ticketRun, container.projectRepo);

  return program;
}

// Only parse when run as CLI entrypoint (not when imported as module)
const thisFile = fileURLToPath(import.meta.url);
const isEntrypoint =
  process.argv[1] != null && realpathSync(process.argv[1]) === realpathSync(thisFile);

if (isEntrypoint) {
  buildProgram().parse();
}
