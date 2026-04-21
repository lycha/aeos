import { format } from 'node:util';

import type { Command } from 'commander';

import type { ExecutorOverrides } from '../../domain/ports/driving/ticket-run.port.js';

const SHELL_HELP_LINES = [
  'AEOS Ink shell',
  '',
  'Built-in shell commands:',
  '  help                     Show this help',
  '  clear                    Clear the shell output',
  '  exit                     Quit the Ink shell',
  '',
  'Ticket commands:',
  '  ticket list',
  '  ticket show AEOS-1',
  '  ticket run AEOS-1',
  '  ticket run AEOS-1 --executor claude-cli --model claude-sonnet-4-5',
  '',
  'Legacy subcommands still work here when they are non-interactive.',
  'Commands that prompt with readline should still be run as direct CLI subcommands.',
];

const SUPPORTED_EXECUTORS = ['claude-cli', 'auggie-cli', 'opencode-cli', 'ollama-cli'] as const;

export type ShellCommandResult =
  | { kind: 'noop' }
  | { kind: 'clear' }
  | { kind: 'exit' }
  | { kind: 'lines'; lines: string[]; exitCode: number }
  | {
      kind: 'ticket-run';
      commandLine: string;
      ticketId: string;
      executorOverrides?: ExecutorOverrides;
    };

export function tokenizeCommandLine(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: 'single' | 'double' | null = null;
  let escaping = false;

  for (const character of input) {
    if (escaping) {
      current += character;
      escaping = false;
      continue;
    }

    if (character === '\\') {
      escaping = true;
      continue;
    }

    if (quote === 'single') {
      if (character === "'") {
        quote = null;
      } else {
        current += character;
      }
      continue;
    }

    if (quote === 'double') {
      if (character === '"') {
        quote = null;
      } else {
        current += character;
      }
      continue;
    }

    if (character === "'") {
      quote = 'single';
      continue;
    }

    if (character === '"') {
      quote = 'double';
      continue;
    }

    if (/\s/.test(character)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += character;
  }

  if (escaping) {
    current += '\\';
  }

  if (current.length > 0 || quote !== null) {
    tokens.push(current);
  }

  return tokens;
}

export async function executeShellCommand(
  commandLine: string,
  buildProgram: () => Command,
): Promise<ShellCommandResult> {
  let argv = tokenizeCommandLine(commandLine.trim());
  if (argv[0] === 'aeos') {
    argv = argv.slice(1);
  }

  if (argv.length === 0) {
    return { kind: 'lines', lines: SHELL_HELP_LINES, exitCode: 0 };
  }

  if (argv[0] === 'help') {
    return { kind: 'lines', lines: SHELL_HELP_LINES, exitCode: 0 };
  }

  if (argv[0] === 'clear') {
    return { kind: 'clear' };
  }

  if (argv[0] === 'exit' || argv[0] === 'quit') {
    return { kind: 'exit' };
  }

  if (argv[0] === 'ticket' && argv[1] === 'run') {
    return parseTicketRunRequest(argv, commandLine.trim());
  }

  if (argv[0] === 'ticket' && (argv[1] === 'answer' || argv[1] === 'dod-approve')) {
    return {
      kind: 'lines',
      exitCode: 1,
      lines: [
        `Error: \`${argv.slice(0, 2).join(' ')}\` is interactive and is not supported inside the Ink shell yet.`,
        `Run \`aeos ${argv.join(' ')}\` directly in the terminal instead.`,
      ],
    };
  }

  const result = await executeCommanderCommand(argv, buildProgram);
  return {
    kind: 'lines',
    exitCode: result.exitCode,
    lines:
      result.lines.length > 0
        ? result.lines
        : [
            result.exitCode === 0
              ? 'Command completed.'
              : `Command failed with exit code ${result.exitCode}.`,
          ],
  };
}

function parseTicketRunRequest(argv: string[], commandLine: string): ShellCommandResult {
  let ticketId: string | undefined;
  let executor: ExecutorOverrides['executorType'];
  let model: string | undefined;

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--executor') {
      const value = argv[index + 1];
      if (!value) {
        return {
          kind: 'lines',
          exitCode: 1,
          lines: ['Error: Missing value for --executor.'],
        };
      }
      if (!SUPPORTED_EXECUTORS.includes(value as (typeof SUPPORTED_EXECUTORS)[number])) {
        return {
          kind: 'lines',
          exitCode: 1,
          lines: [
            `Error: Invalid executor '${value}'. Supported executors: ${SUPPORTED_EXECUTORS.join(', ')}`,
          ],
        };
      }
      executor = value as ExecutorOverrides['executorType'];
      index += 1;
      continue;
    }

    if (token === '--model') {
      const value = argv[index + 1];
      if (!value) {
        return {
          kind: 'lines',
          exitCode: 1,
          lines: ['Error: Missing value for --model.'],
        };
      }
      model = value;
      index += 1;
      continue;
    }

    if (token.startsWith('--')) {
      return {
        kind: 'lines',
        exitCode: 1,
        lines: [`Error: Unsupported option '${token}' for ticket run inside the Ink shell.`],
      };
    }

    if (!ticketId) {
      ticketId = token;
      continue;
    }

    return {
      kind: 'lines',
      exitCode: 1,
      lines: [`Error: Unexpected extra argument '${token}' for ticket run.`],
    };
  }

  if (!ticketId) {
    return {
      kind: 'lines',
      exitCode: 1,
      lines: [
        'Error: Missing ticket id. Usage: ticket run <id> [--executor <type>] [--model <model>]',
      ],
    };
  }

  const executorOverrides = executor || model ? { executorType: executor, model } : undefined;
  return { kind: 'ticket-run', commandLine, ticketId, executorOverrides };
}

async function executeCommanderCommand(
  argv: string[],
  buildProgram: () => Command,
): Promise<{ lines: string[]; exitCode: number }> {
  /* eslint-disable no-console */
  const lines: string[] = [];
  const program = buildProgram();
  const savedExitCode = process.exitCode;
  const savedConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
  };

  program.exitOverride();
  program.configureOutput({
    writeOut: (text) => appendOutput(lines, text),
    writeErr: (text) => appendOutput(lines, text),
  });

  process.exitCode = undefined;
  console.log = (...args: unknown[]) => appendOutput(lines, format(...args));
  console.error = (...args: unknown[]) => appendOutput(lines, format(...args));
  console.warn = (...args: unknown[]) => appendOutput(lines, format(...args));

  let exitCode = 0;

  try {
    await program.parseAsync(['node', 'aeos', ...argv]);
    exitCode = typeof process.exitCode === 'number' ? process.exitCode : 0;
  } catch (error) {
    exitCode = getCommanderExitCode(error);
    if (lines.length === 0 && error instanceof Error && error.message.length > 0) {
      lines.push(error.message);
    }
  } finally {
    console.log = savedConsole.log;
    console.error = savedConsole.error;
    console.warn = savedConsole.warn;
    process.exitCode = savedExitCode as number | undefined;
  }
  /* eslint-enable no-console */

  return { lines, exitCode };
}

function appendOutput(lines: string[], text: string): void {
  const normalized = text.replace(/\r\n?/g, '\n');
  const parts = normalized.split('\n');

  if (parts.at(-1) === '') {
    parts.pop();
  }

  for (const part of parts) {
    lines.push(part);
  }
}

function getCommanderExitCode(error: unknown): number {
  if (
    typeof error === 'object' &&
    error !== null &&
    'exitCode' in error &&
    typeof error.exitCode === 'number'
  ) {
    return error.exitCode;
  }

  return 1;
}
