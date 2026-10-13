import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { registerTicketSignOffCommand } from './ticket-sign-off.command.js';
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

describe('registerTicketSignOffCommand', () => {
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
    registerTicketSignOffCommand(program, () => useCase, projectRepo);
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

  it('passes the ticket id and project info to the use case', () => {
    program.parse(['node', 'aeos', 'ticket', 'sign-off', 'AEOS-1']);
    expect(useCase.execute).toHaveBeenCalledWith({
      projectId: 'proj-1',
      projectPath: '/test',
      ticketId: 'AEOS-1',
    });
  });

  it('prints a success message when manual sign-off succeeds', () => {
    program.parse(['node', 'aeos', 'ticket', 'sign-off', 'AEOS-1']);
    expect(consoleSpy).toHaveBeenCalledWith('✓ Ticket AEOS-1 signed off (previous state: FAILED)');
  });

  it('shows use case errors and sets exit code 1', () => {
    (useCase.execute as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'error',
      ticketId: 'AEOS-1',
      error: 'Ticket AEOS-1 is already SIGNED_OFF',
    });
    program.parse(['node', 'aeos', 'ticket', 'sign-off', 'AEOS-1']);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Ticket AEOS-1 is already SIGNED_OFF');
    expect(process.exitCode).toBe(1);
  });

  it('shows an error when not inside an AEOS project', () => {
    (projectRepo.findRoot as ReturnType<typeof vi.fn>).mockReturnValue(null);
    program.parse(['node', 'aeos', 'ticket', 'sign-off', 'AEOS-1']);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error: No AEOS project found. Run "aeos project init" first.',
    );
    expect(process.exitCode).toBe(1);
  });
});
