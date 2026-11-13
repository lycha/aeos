// Criteria traced here: @AC-30 (executor env limited to an allowlist, excluding any secret).
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContractCommand } from '../cli/contract/contract-schema.js';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

import { spawn } from 'node:child_process';
import { buildArgv, proxyCommand, runCommand } from './cli-proxy.js';

const mockSpawn = vi.mocked(spawn);

type MockChild = ChildProcess & { stdout: PassThrough; stderr: PassThrough };

function createMockChild(): MockChild {
  const child = new EventEmitter() as MockChild;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  return child;
}

function emitClose(child: MockChild, exitCode: number | null): void {
  child.stdout.end();
  child.stderr.end();
  process.nextTick(() => child.emit('close', exitCode));
}

/** A command with one of each parameter shape: two positionals (declared out of
 * position order), a plain option, an array option with a separator, and a flag. */
const MOVE_COMMAND: ContractCommand = {
  operationId: 'ticketMove',
  summary: 'Move a ticket',
  requires: ['project'],
  parameters: [
    {
      name: 'status',
      in: 'argument',
      position: 2,
      description: 'Target column',
      schema: { type: 'string' },
    },
    {
      name: 'id',
      in: 'argument',
      position: 1,
      description: 'Ticket ID',
      schema: { type: 'string' },
    },
    { name: 'reason', in: 'option', description: 'Why', schema: { type: 'string' } },
    {
      name: 'verified',
      in: 'option',
      separator: ',',
      description: 'Criteria ids',
      schema: { type: 'array' },
    },
    { name: 'dry-run', in: 'flag', description: 'Change nothing' },
  ],
  responses: {},
};

describe('buildArgv', () => {
  it('orders positionals by position, renders options as --name value, appends --json', () => {
    const argv = buildArgv(MOVE_COMMAND, 'ticket move', {
      id: 'T-1',
      status: 'DONE',
      reason: 'why',
    });

    expect(argv).toEqual(['ticket', 'move', 'T-1', 'DONE', '--reason', 'why', '--json']);
  });

  it('joins an array option with its declared separator', () => {
    const argv = buildArgv(MOVE_COMMAND, 'ticket move', {
      id: 'T-1',
      status: 'DONE',
      verified: ['AC-1', 'AC-2'],
    });

    expect(argv).toEqual(['ticket', 'move', 'T-1', 'DONE', '--verified', 'AC-1,AC-2', '--json']);
  });

  it('renders a truthy flag as bare --name and omits a falsy one', () => {
    const truthy = buildArgv(MOVE_COMMAND, 'ticket move', {
      id: 'T-1',
      status: 'DONE',
      'dry-run': true,
    });
    const falsy = buildArgv(MOVE_COMMAND, 'ticket move', {
      id: 'T-1',
      status: 'DONE',
      'dry-run': false,
    });

    expect(truthy).toContain('--dry-run');
    expect(falsy).not.toContain('--dry-run');
  });

  it('omits a parameter that is absent from parameters', () => {
    const argv = buildArgv(MOVE_COMMAND, 'ticket move', { id: 'T-1', status: 'DONE' });

    expect(argv).toEqual(['ticket', 'move', 'T-1', 'DONE', '--json']);
  });

  it('always appends --json even with no parameters given', () => {
    const argv = buildArgv({ ...MOVE_COMMAND, parameters: [] }, 'costs', {});

    expect(argv).toEqual(['costs', '--json']);
  });
});

describe('runCommand', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
  });

  it('spawns with an env limited to an exact allowlisted key set, excluding any secret', async () => {
    vi.stubEnv('PATH', '/usr/bin');
    vi.stubEnv('HOME', '/home/op');
    vi.stubEnv('AEOS_HOME', '/custom/.aeos');
    vi.stubEnv('AEOS_EXECUTOR', 'stub');
    vi.stubEnv('AEOS_GIT_ISOLATION', 'none');
    vi.stubEnv('AEOS_SESSION_SECRET', 'super-secret');
    vi.stubEnv('AEOS_LAUNCH_TOKEN', 'one-time-secret');

    const child = createMockChild();
    mockSpawn.mockImplementation(() => {
      process.nextTick(() => emitClose(child, 0));
      return child;
    });

    await runCommand('/project', ['ticket', 'list', '--json']);

    const [, , options] = mockSpawn.mock.calls[0];
    const env = (options as { env: Record<string, string> }).env;
    expect(Object.keys(env).sort()).toEqual(
      ['AEOS_EXECUTOR', 'AEOS_GIT_ISOLATION', 'AEOS_HOME', 'HOME', 'PATH'].sort(),
    );
    expect(env).not.toHaveProperty('AEOS_SESSION_SECRET');
    expect(env).not.toHaveProperty('AEOS_LAUNCH_TOKEN');
  });

  it('runs in the given cwd and resolves stdout/stderr/exitCode', async () => {
    const child = createMockChild();
    mockSpawn.mockImplementation(() => {
      process.nextTick(() => {
        child.stdout.write('out');
        child.stderr.write('err');
        emitClose(child, 0);
      });
      return child;
    });

    const result = await runCommand('/project', ['ticket', 'list', '--json']);

    expect(result).toEqual({ stdout: 'out', stderr: 'err', exitCode: 0 });
    expect(mockSpawn.mock.calls[0][2]).toMatchObject({ cwd: '/project' });
  });

  it('rejects when the subprocess cannot be started', async () => {
    const child = createMockChild();
    mockSpawn.mockImplementation(() => {
      process.nextTick(() => child.emit('error', new Error('ENOENT')));
      return child;
    });

    await expect(runCommand('/project', ['ticket', 'list'])).rejects.toThrow('ENOENT');
  });
});

describe('proxyCommand', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
  });

  const contract = { commands: { 'ticket move': MOVE_COMMAND } } as unknown as Parameters<
    typeof proxyCommand
  >[0];

  it('returns the envelope the subprocess printed, untouched', async () => {
    const envelope = {
      ok: true,
      command: 'ticket move',
      exit: 0,
      contractVersion: 1,
      data: { ticketId: 'T-1' },
      error: null,
      warnings: [],
    };
    const child = createMockChild();
    mockSpawn.mockImplementation(() => {
      process.nextTick(() => {
        child.stdout.write(JSON.stringify(envelope));
        emitClose(child, 0);
      });
      return child;
    });

    const result = await proxyCommand(contract, 'ticket move', '/project', {
      id: 'T-1',
      status: 'DONE',
    });

    expect(result).toEqual(envelope);
  });

  it('rejects an unknown parameter as INVALID_ARGUMENT without spawning (AC-2)', async () => {
    const result = await proxyCommand(contract, 'ticket move', '/project', {
      id: 'T-1',
      status: 'DONE',
      bogus: 'x',
    });

    expect(result.ok).toBe(false);
    expect(result.exit).toBe(2);
    expect(result.error?.code).toBe('INVALID_ARGUMENT');
    expect(result.error?.message).toContain('bogus');
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('synthesizes COMMAND_FAILED when the subprocess cannot be started', async () => {
    const child = createMockChild();
    mockSpawn.mockImplementation(() => {
      process.nextTick(() => child.emit('error', new Error('ENOENT')));
      return child;
    });

    const result = await proxyCommand(contract, 'ticket move', '/project', {
      id: 'T-1',
      status: 'DONE',
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('COMMAND_FAILED');
  });

  it('synthesizes COMMAND_FAILED when stdout is not a parseable envelope', async () => {
    const child = createMockChild();
    mockSpawn.mockImplementation(() => {
      process.nextTick(() => {
        child.stdout.write('not json');
        emitClose(child, 1);
      });
      return child;
    });

    const result = await proxyCommand(contract, 'ticket move', '/project', {
      id: 'T-1',
      status: 'DONE',
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('COMMAND_FAILED');
  });

  it('throws for a command path the contract does not have', async () => {
    await expect(proxyCommand(contract, 'ticket nope', '/project', {})).rejects.toThrow(
      /Unknown command/,
    );
  });
});
