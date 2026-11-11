import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { programWith } from './program.fixture.js';
import type { TicketSignOffPort } from '../../domain/ports/driving/ticket-sign-off.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';

function createMockTicketSignOffUseCase(): TicketSignOffPort {
  return {
    execute: vi.fn().mockReturnValue({
      status: 'signed_off',
      ticketId: 'AEOS-1',
      previousSubState: 'FAILED',
    }),
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
    scaffoldDefaults: vi.fn().mockReturnValue([]),
    findRoot: vi.fn().mockReturnValue('/test'),
    readExecutorConfig: vi.fn().mockReturnValue(null),
    readConstraints: vi.fn().mockReturnValue(null),
    writeConstraintsPlaceholder: vi.fn(),
  };
}

const REASON = 'The reviewer misread AC-2.';

describe('the ticket sign-off handler', () => {
  let program: Command;
  let useCase: ReturnType<typeof createMockTicketSignOffUseCase>;
  let projectRepo: ReturnType<typeof createMockProjectRepo>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let savedExitCode: number | string | null | undefined;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    useCase = createMockTicketSignOffUseCase();
    projectRepo = createMockProjectRepo();
    programWith({ ticketSignOff: useCase, projectRepo }, program);
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

  it('passes the ticket id and project info to the use case', async () => {
    await program.parseAsync(['node', 'aeos', 'ticket', 'sign-off', 'AEOS-1', '--reason', REASON]);
    expect(useCase.execute).toHaveBeenCalledWith({
      projectId: 'proj-1',
      projectPath: '/test',
      ticketId: 'AEOS-1',
      reason: REASON,
    });
  });

  it('prints a success message when manual sign-off succeeds', async () => {
    await program.parseAsync(['node', 'aeos', 'ticket', 'sign-off', 'AEOS-1', '--reason', REASON]);
    expect(consoleSpy).toHaveBeenCalledWith('✓ Ticket AEOS-1 signed off (previous state: FAILED)');
  });

  it('shows use case errors and sets exit code 1', async () => {
    (useCase.execute as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'error',
      ticketId: 'AEOS-1',
      error: 'Ticket AEOS-1 is already SIGNED_OFF',
    });
    await program.parseAsync(['node', 'aeos', 'ticket', 'sign-off', 'AEOS-1', '--reason', REASON]);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Ticket AEOS-1 is already SIGNED_OFF');
    expect(process.exitCode).toBe(1);
  });

  it('shows an error when not inside an AEOS project', async () => {
    (projectRepo.findRoot as ReturnType<typeof vi.fn>).mockReturnValue(null);
    await program.parseAsync(['node', 'aeos', 'ticket', 'sign-off', 'AEOS-1', '--reason', REASON]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Run `aeos project init` in the project root.'),
    );
    expect(process.exitCode).toBe(4);
  });

  it('is refused without --reason, and the use case is not run', async () => {
    // Commander refuses a missing required option before the action runs.
    program.configureOutput({ writeErr: () => {} });

    await expect(
      program.parseAsync(['node', 'aeos', 'ticket', 'sign-off', 'AEOS-1']),
    ).rejects.toThrow("required option '--reason <text>' not specified");
    expect(useCase.execute).not.toHaveBeenCalled();
  });
});
