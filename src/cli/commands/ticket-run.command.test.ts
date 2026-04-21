import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

import { registerTicketRunCommand } from './ticket-run.command.js';
import type { TicketRunPort } from '../../domain/ports/driving/ticket-run.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';

function createMockTicketRunUseCase(): TicketRunPort {
  return {
    execute: vi.fn().mockResolvedValue({
      status: 'success',
      ticketId: 'AEOS-1',
      artifactPath: '/test/.aeos/tickets/AEOS-1/AEOS-1-impl.md',
      reviewPath: '/test/.aeos/tickets/AEOS-1/AEOS-1-impl-review.md',
    }),
    interrupt: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockProjectRepo(): ProjectRepository {
  return {
    exists: vi.fn().mockReturnValue(true),
    read: vi.fn().mockReturnValue({
      uuid: 'u1',
      id: 'proj-1',
      name: 'Test',
      key: 'AEOS',
      path: '/test',
      created_at: '2026-01-01',
    }),
    writeProject: vi.fn(),
    ensureColumnSpecsDir: vi.fn(),
    findRoot: vi.fn().mockReturnValue('/test'),
    readExecutorConfig: vi.fn().mockReturnValue(null),
    readConstraints: vi.fn().mockReturnValue(null),
    writeConstraintsPlaceholder: vi.fn(),
  };
}

describe('registerTicketRunCommand', () => {
  let program: Command;
  let useCase: ReturnType<typeof createMockTicketRunUseCase>;
  let projectRepo: ReturnType<typeof createMockProjectRepo>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let savedExitCode: number | string | null | undefined;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    useCase = createMockTicketRunUseCase();
    projectRepo = createMockProjectRepo();
    registerTicketRunCommand(program, () => useCase, projectRepo);
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    savedExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    process.exitCode = savedExitCode;
  });

  it('passes project info, overrides, and an observer to the use case', async () => {
    await program.parseAsync([
      'node',
      'aeos',
      'ticket',
      'run',
      'AEOS-1',
      '--executor',
      'claude-cli',
      '--model',
      'claude-sonnet-4-5',
    ]);

    expect(useCase.execute).toHaveBeenCalledWith(
      'proj-1',
      '/test',
      'AEOS-1',
      {
        executorType: 'claude-cli',
        model: 'claude-sonnet-4-5',
      },
      expect.objectContaining({ onEvent: expect.any(Function) }),
    );
  });

  it('prints the final success summary', async () => {
    await program.parseAsync(['node', 'aeos', 'ticket', 'run', 'AEOS-1']);

    expect(consoleSpy).toHaveBeenCalledWith('Running ticket AEOS-1…');
    expect(consoleSpy).toHaveBeenCalledWith('✓ Ticket AEOS-1 reached SIGNED_OFF');
    expect(consoleSpy).toHaveBeenCalledWith(
      '  Artifact: /test/.aeos/tickets/AEOS-1/AEOS-1-impl.md',
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      '  Review:   /test/.aeos/tickets/AEOS-1/AEOS-1-impl-review.md',
    );
  });

  it('prints an error and sets exit code on failure', async () => {
    (useCase.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 'failed',
      ticketId: 'AEOS-1',
      error: 'Boom',
    });

    await program.parseAsync(['node', 'aeos', 'ticket', 'run', 'AEOS-1']);

    expect(consoleErrorSpy).toHaveBeenCalledWith('✗ Ticket AEOS-1 failed: Boom');
    expect(process.exitCode).toBe(1);
  });

  it('requests a graceful interrupt when SIGINT is received', async () => {
    let resolveExecute:
      | ((value: Awaited<ReturnType<TicketRunPort['execute']>>) => void)
      | undefined;

    (useCase.execute as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise((resolve: (value: Awaited<ReturnType<TicketRunPort['execute']>>) => void) => {
          resolveExecute = resolve;
        }),
    );

    const parsePromise = program.parseAsync(['node', 'aeos', 'ticket', 'run', 'AEOS-1']);
    await new Promise((resolve) => setImmediate(resolve));

    process.emit('SIGINT');
    expect(useCase.interrupt).toHaveBeenCalledOnce();

    resolveExecute?.({
      status: 'failed',
      ticketId: 'AEOS-1',
      error: 'Execution interrupted by operator',
    });

    await parsePromise;
  });

  it('rejects unsupported executor overrides before running', async () => {
    await program.parseAsync(['node', 'aeos', 'ticket', 'run', 'AEOS-1', '--executor', 'bad-cli']);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error: Invalid executor 'bad-cli'. Supported executors: claude-cli, auggie-cli, opencode-cli, ollama-cli",
    );
    expect(useCase.execute).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
