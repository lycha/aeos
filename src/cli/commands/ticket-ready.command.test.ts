import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { registerTicketReadyCommand } from './ticket-ready.command.js';
import type { TicketReadyPort } from '../../domain/ports/driving/ticket-ready.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';

function createMockTicketReadyUseCase(): TicketReadyPort {
  return {
    execute: vi.fn().mockReturnValue({
      status: 'readied',
      ticketId: 'AEOS-1',
      previousSubState: 'WORKING',
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
    ensureColumnSpecsDir: vi.fn(),
    findRoot: vi.fn().mockReturnValue('/test'),
    readConstraints: vi.fn().mockReturnValue(null),
    writeConstraintsPlaceholder: vi.fn(),
  };
}

describe('registerTicketReadyCommand', () => {
  let program: Command;
  let useCase: ReturnType<typeof createMockTicketReadyUseCase>;
  let projectRepo: ReturnType<typeof createMockProjectRepo>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let savedExitCode: number | string | null | undefined;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    useCase = createMockTicketReadyUseCase();
    projectRepo = createMockProjectRepo();
    registerTicketReadyCommand(program, () => useCase, projectRepo);
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
    program.parse(['node', 'aeos', 'ticket', 'ready', 'AEOS-1']);
    expect(useCase.execute).toHaveBeenCalledWith({
      projectId: 'proj-1',
      projectPath: '/test',
      ticketId: 'AEOS-1',
    });
  });

  it('prints a success message when the ready reset succeeds', () => {
    program.parse(['node', 'aeos', 'ticket', 'ready', 'AEOS-1']);
    expect(consoleSpy).toHaveBeenCalledWith(
      '✓ Ticket AEOS-1 marked READY (previous state: WORKING)',
    );
  });

  it('shows use case errors and sets exit code 1', () => {
    (useCase.execute as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'error',
      ticketId: 'AEOS-1',
      error: 'Ticket AEOS-1 is already READY',
    });
    program.parse(['node', 'aeos', 'ticket', 'ready', 'AEOS-1']);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Ticket AEOS-1 is already READY');
    expect(process.exitCode).toBe(1);
  });

  it('shows an error when not inside an AEOS project', () => {
    (projectRepo.findRoot as ReturnType<typeof vi.fn>).mockReturnValue(null);
    program.parse(['node', 'aeos', 'ticket', 'ready', 'AEOS-1']);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error: No AEOS project found. Run "aeos project init" first.',
    );
    expect(process.exitCode).toBe(1);
  });
});
