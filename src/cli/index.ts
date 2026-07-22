#!/usr/bin/env node
// CLI layer — Commander.js bootstrap entrypoint

import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { Command } from 'commander';
import { createContainer } from './container.js';
import { runInkApp } from './ui/run-ink-app.js';
import { registerInstallCommand } from './commands/install.command.js';
import { registerProjectInitCommand } from './commands/project-init.command.js';
import { registerProjectSyncCommand } from './commands/project-sync.command.js';
import { registerTicketCreateCommand } from './commands/ticket-create.command.js';
import { registerTicketListCommand } from './commands/ticket-list.command.js';
import { registerTicketShowCommand } from './commands/ticket-show.command.js';
import { registerTicketAnswerCommand } from './commands/ticket-answer.command.js';
import { registerTicketRunCommand } from './commands/ticket-run.command.js';
import { registerTicketApproveCommand } from './commands/ticket-approve.command.js';
import { registerTicketSignOffCommand } from './commands/ticket-sign-off.command.js';
import { registerTicketMoveCommand } from './commands/ticket-move.command.js';
import { registerTicketReadyCommand } from './commands/ticket-ready.command.js';
import { registerTicketDodApproveCommand } from './commands/ticket-dod-approve.command.js';
import { registerOrchestratorCommand } from './commands/orchestrator.command.js';

export { createContainer } from './container.js';
export type { Container } from './container.js';
export { registerInstallCommand } from './commands/install.command.js';
export { registerProjectInitCommand } from './commands/project-init.command.js';
export { registerProjectSyncCommand } from './commands/project-sync.command.js';
export { registerTicketCreateCommand } from './commands/ticket-create.command.js';
export { registerTicketListCommand } from './commands/ticket-list.command.js';
export { registerTicketShowCommand } from './commands/ticket-show.command.js';
export { registerTicketAnswerCommand } from './commands/ticket-answer.command.js';
export { registerTicketRunCommand } from './commands/ticket-run.command.js';
export { registerTicketApproveCommand } from './commands/ticket-approve.command.js';
export { registerTicketSignOffCommand } from './commands/ticket-sign-off.command.js';
export { registerTicketMoveCommand } from './commands/ticket-move.command.js';
export { registerTicketReadyCommand } from './commands/ticket-ready.command.js';
export { registerTicketDodApproveCommand } from './commands/ticket-dod-approve.command.js';

interface CliRuntimeDependencies {
  readonly stdout: Pick<NodeJS.WriteStream, 'isTTY'>;
  readonly createContainer: typeof createContainer;
  readonly buildProgram: () => Command;
  readonly runInkApp: typeof runInkApp;
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name('aeos')
    .version('0.1.0')
    .description(
      'AI-Engineered Operating System — an AI-assisted development pipeline\n' +
        'that takes a ticket from idea to code review using specialised LLM agents.\n\n' +
        'Each pipeline column has a dedicated agent, a reviewer with rubrics,\n' +
        'and a human approval gate.\n\n' +
        'Getting started:\n' +
        '  aeos install                              One-time global setup\n' +
        '  aeos project init --name "Name" --key XY  Initialise project\n' +
        '  aeos ticket create "Title"                Create a ticket\n' +
        '  aeos ticket run <id>                      Run the pipeline column\n' +
        '  aeos ticket approve <id>                  Advance to next column\n' +
        '  aeos ticket sign-off <id>                 Manually mark as SIGNED_OFF\n' +
        '  aeos ticket move <id> <status>            Move ticket to any status\n' +
        '  aeos ticket ready <id>                    Reset ticket sub-state to READY\n' +
        '  aeos orchestrator run <epicId>            Drive an epic autonomously\n\n' +
        'Environment variables:\n' +
        '  AEOS_EXECUTOR=stub    Use stub executor (default: claude CLI)',
    );

  const container = createContainer();
  registerInstallCommand(program, container.install);
  registerProjectInitCommand(program, container.projectInit);
  registerProjectSyncCommand(program, () => container.projectSync, container.projectRepo);

  // Ticket commands access the DB — resolve lazily inside the action callback,
  // not at program build time. This allows `aeos install` and `aeos project init`
  // to run before .aeos/ (and state.db) exist.
  registerTicketCreateCommand(program, () => container.ticketCreate, container.projectRepo);
  registerTicketListCommand(program, () => container.ticketList, container.projectRepo);
  registerTicketShowCommand(program, () => container.ticketShow, container.projectRepo);
  registerTicketAnswerCommand(program, () => container.ticketAnswer, container.projectRepo);
  registerTicketRunCommand(program, () => container.ticketRun, container.projectRepo);
  registerTicketApproveCommand(program, () => container.ticketApprove, container.projectRepo);
  registerTicketSignOffCommand(program, () => container.ticketSignOff, container.projectRepo);
  registerTicketMoveCommand(program, () => container.ticketMove, container.projectRepo);
  registerTicketReadyCommand(program, () => container.ticketReady, container.projectRepo);
  registerTicketDodApproveCommand(
    program,
    () => container.ticketDodApprove,
    container.projectRepo,
    container.rubricLoader,
    container.artifactStore,
  );
  registerOrchestratorCommand(program, () => container.orchestrator, container.projectRepo);

  return program;
}

export function shouldLaunchInkShell(
  commandArgs: string[],
  stdout: Pick<NodeJS.WriteStream, 'isTTY'> = process.stdout,
): boolean {
  return stdout.isTTY === true && commandArgs.length === 0;
}

export async function runCli(
  argv: string[] = process.argv,
  overrides: Partial<CliRuntimeDependencies> = {},
): Promise<void> {
  const runtime: CliRuntimeDependencies = {
    stdout: process.stdout,
    createContainer,
    buildProgram: () => buildProgram(),
    runInkApp,
    ...overrides,
  };
  const commandArgs = argv.slice(2);

  if (shouldLaunchInkShell(commandArgs, runtime.stdout)) {
    await runtime.runInkApp({
      container: runtime.createContainer(),
      buildProgram: runtime.buildProgram,
      cwd: process.cwd(),
    });
    return;
  }

  await runtime.buildProgram().parseAsync(argv);
}

// Only parse when run as CLI entrypoint (not when imported as module)
const thisFile = fileURLToPath(import.meta.url);
const isEntrypoint =
  process.argv[1] != null && realpathSync(process.argv[1]) === realpathSync(thisFile);

if (isEntrypoint) {
  void runCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error(`Error: ${message}`);
    process.exitCode = 1;
  });
}
