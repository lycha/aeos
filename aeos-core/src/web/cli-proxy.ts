// Web — the generic command executor (tech spec §2.2). Turns an HTTP
// request's `{command path, parameters}` into an invocation of the same
// shipped `aeos` binary, in `--json` mode, and turns its stdout back into the
// envelope untouched. This is the whole mechanism behind AC-2/AC-3: a new
// command is proxyable the moment it lands in `cli-contract.yaml`, with no
// new code here.

import { spawn } from 'node:child_process';
import * as path from 'node:path';

import { loadContract, packageRoot } from '../cli/contract/load-contract.js';
import type { Contract, ContractCommand } from '../cli/contract/contract-schema.js';
import { CONTRACT_VERSION, EXIT } from '../cli/generated/exit-codes.gen.js';
import type { Envelope } from '../cli/generated/types.gen.js';

export type CliEnvelope = Envelope;

/** Environment keys passed through to the spawned CLI, besides the contract's own. */
const BASE_ALLOWED_ENV_KEYS = ['PATH', 'HOME'] as const;

/** Turns a value for an `option` parameter into its single argv string. */
function formatOptionValue(value: unknown, separator: string | undefined): string {
  return Array.isArray(value) ? value.join(separator ?? ',') : String(value);
}

/**
 * Positional args ordered by `position`, options as `--name value`, flags as
 * bare `--name` when truthy; `--json` is always appended. A parameter absent
 * from `parameters` is omitted, matching an optional CLI argument.
 */
export function buildArgv(
  command: ContractCommand,
  commandPath: string,
  parameters: Record<string, unknown>,
): string[] {
  const positionals: { position: number; value: string }[] = [];
  const rest: string[] = [];

  for (const parameter of command.parameters) {
    const value = parameters[parameter.name];
    if (value === undefined || value === null) continue;

    if (parameter.in === 'argument') {
      positionals.push({ position: parameter.position ?? 0, value: String(value) });
    } else if (parameter.in === 'option') {
      rest.push(`--${parameter.name}`, formatOptionValue(value, parameter.separator));
    } else if (value) {
      rest.push(`--${parameter.name}`);
    }
  }

  positionals.sort((a, b) => a.position - b.position);
  return [...commandPath.split(' '), ...positionals.map((p) => p.value), ...rest, '--json'];
}

export interface RunCommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/**
 * Spawns `process.execPath dist/cli/index.js <argv>` with `cwd` set to the
 * project path and an explicit allowlisted `env` — the per-launch credential
 * and session secrets are never added to it, so they are structurally absent
 * (AC-30), whatever this process's own environment happens to carry.
 */
export function runCommand(cwd: string, argv: string[]): Promise<RunCommandResult> {
  return new Promise((resolve, reject) => {
    const allowedKeys: readonly string[] = [
      ...BASE_ALLOWED_ENV_KEYS,
      ...Object.keys(loadContract().environment),
    ];
    const env: Record<string, string> = {};
    for (const key of allowedKeys) {
      const value = process.env[key];
      if (value !== undefined) env[key] = value;
    }

    const binPath = path.join(packageRoot(), 'dist', 'cli', 'index.js');
    const child = spawn(process.execPath, [binPath, ...argv], { cwd, env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf-8')));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf-8')));
    child.on('error', reject);
    child.on('close', (exitCode) =>
      resolve({ stdout, stderr, exitCode: exitCode ?? EXIT.failure }),
    );
  });
}

/**
 * Runs a contract command end to end and returns its envelope untouched. A
 * subprocess that cannot be started, or exits without a parseable envelope,
 * is synthesized as `COMMAND_FAILED` (tech spec §5.1) rather than thrown —
 * the server never crashes on a broken child.
 */
export async function proxyCommand(
  contract: Contract,
  commandPath: string,
  projectPath: string,
  parameters: Record<string, unknown>,
): Promise<CliEnvelope> {
  const command = contract.commands[commandPath];
  if (!command) throw new Error(`Unknown command "${commandPath}"`);

  // AC-2: an unknown argument is rejected as an invalid-argument outcome, just as
  // the terminal does — never silently dropped by building argv from declared
  // parameters alone.
  const declared = new Set(command.parameters.map((p) => p.name));
  const unknown = Object.keys(parameters).filter((name) => !declared.has(name));
  if (unknown.length > 0) {
    return {
      ok: false,
      command: commandPath,
      exit: EXIT.usage,
      contractVersion: CONTRACT_VERSION,
      data: null,
      error: {
        code: 'INVALID_ARGUMENT',
        message: `Unknown argument(s): ${unknown.join(', ')}`,
        resource: null,
      },
      warnings: [],
    };
  }

  const argv = buildArgv(command, commandPath, parameters);
  try {
    const { stdout } = await runCommand(projectPath, argv);
    return JSON.parse(stdout) as CliEnvelope;
  } catch (error) {
    return {
      ok: false,
      command: commandPath,
      exit: EXIT.failure,
      contractVersion: CONTRACT_VERSION,
      data: null,
      error: {
        code: 'COMMAND_FAILED',
        message: error instanceof Error ? error.message : String(error),
        resource: null,
      },
      warnings: [],
    };
  }
}
