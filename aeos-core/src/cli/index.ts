#!/usr/bin/env node
// CLI layer — Commander.js bootstrap entrypoint

import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { Command } from 'commander';
import { createContainer } from './container.js';
import { runInkApp } from './ui/run-ink-app.js';
import { handlers } from './commands/index.js';
import { registerGenerated } from './generated/commands.gen.js';
import { createResources } from './resources.js';

export { createContainer } from './container.js';
export type { Container } from './container.js';

/** The command groups; the contract describes commands, not the words they hang from. */
const GROUPS: Record<string, string> = {
  project: 'Project management commands',
  ticket: 'Ticket management commands',
  orchestrator: 'Drive an epic and its tasks autonomously',
};

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
        '  aeos ticket sign-off <id> --reason <text> Manually mark as SIGNED_OFF\n' +
        '  aeos ticket move <id> <status> --reason <text>\n' +
        '                                            Move ticket to any status\n' +
        '  aeos ticket ready <id>                    Reset ticket sub-state to READY\n' +
        '  aeos orchestrator run <epicId>            Drive an epic autonomously\n\n' +
        'Environment variables:\n' +
        '  AEOS_EXECUTOR=stub    Use stub executor (default: claude CLI)',
    );

  const container = createContainer();
  // Wiring, option types and resource guards are generated from
  // cli-contract.yaml. A guard runs inside the action, so `aeos install` and
  // `aeos project init` still run before .aeos/ (and state.db) exist.
  registerGenerated(program, handlers, createResources(container));
  for (const group of program.commands) {
    if (group.name() in GROUPS) group.description(GROUPS[group.name()]);
  }

  // Every command that acts on tickets is held to the accepted pipelines
  // (I1-M4-005c). The ones that only read go on, with the accepted order.
  const READ_ONLY = new Set(['ticket list', 'ticket show', 'orchestrator status']);
  program.hook('preAction', (_program, action) => {
    const group = action.parent?.name() ?? '';
    if (!['ticket', 'orchestrator'].includes(group)) return;
    if (READ_ONLY.has(`${group} ${action.name()}`)) return;
    const projectPath = container.projectRepo.findRoot(process.cwd());
    if (projectPath) container.checkPipelines(projectPath);
  });

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
