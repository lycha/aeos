#!/usr/bin/env node
// CLI layer — Commander.js bootstrap entrypoint

import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { Command, CommanderError } from 'commander';
import { createContainer } from './container.js';
import { runInkApp } from './ui/run-ink-app.js';
import { handlers } from './commands/index.js';
import { registerGenerated } from './generated/commands.gen.js';
import { render, setProcessExit } from './render.js';
import { createResources } from './resources.js';
import { failed, stopped } from './result.js';

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
  readonly buildProgram: typeof buildProgram;
  readonly runInkApp: typeof runInkApp;
}

/** `setExit` is told each command's exit code; the process's own, unless a caller keeps it. */
export function buildProgram(setExit: (code: number) => void = setProcessExit): Command {
  const program = new Command();
  program
    // A usage error is thrown, not exited on: `runCli` gives it the contract's code.
    .exitOverride()
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
        '  aeos ticket create "Title" --spec <feature>\n' +
        '                                            Create an epic from a written spec\n' +
        '  aeos ticket create "Title" --bug          Create a standalone bug task\n' +
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
  registerGenerated(program, handlers, createResources(container), setExit);
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

  const program = runtime.buildProgram();
  try {
    await program.parseAsync(argv);
  } catch (error) {
    // Help and --version end this way, having printed what was asked for.
    if (error instanceof CommanderError && error.exitCode === 0) return;
    // What no command caught: Commander's own usage errors, which it has
    // already written to stderr, and a refusal before the command ran.
    const result =
      error instanceof CommanderError
        ? stopped('usage', 'USAGE', error.message, { text: '' })
        : failed(error);
    render(commandPath(program, commandArgs), result, commandArgs.includes('--json'));
  }
}

/** The command the arguments name, as far as they name one: `ticket show`. */
function commandPath(program: Command, args: readonly string[]): string {
  const words: string[] = [];
  let at: Command | undefined = program;
  for (const arg of args) {
    at = at.commands?.find((command) => command.name() === arg);
    if (!at) break;
    words.push(arg);
  }
  return words.join(' ');
}

// Only parse when run as CLI entrypoint (not when imported as module)
const thisFile = fileURLToPath(import.meta.url);
const isEntrypoint =
  process.argv[1] != null && realpathSync(process.argv[1]) === realpathSync(thisFile);

if (isEntrypoint) {
  void runCli().catch((error: unknown) => render('', failed(error), false));
}
