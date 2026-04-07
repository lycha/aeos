import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerTicketShowCommand } from './ticket-show.command.js';
import type { TicketShowPort } from '../../domain/ports/driving/ticket-show.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';

function createMockTicketShowUseCase(): TicketShowPort {
  return {
    execute: vi.fn().mockReturnValue({
      ok: true,
      ticket: {
        id: 'AEOS-1',
        projectId: 'proj-1',
        title: 'Add rate limiting',
        column: 'PRODUCT_SCOPING',
        subState: 'WORKING',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      artifacts: ['AEOS-1-ticket.md', 'AEOS-1-prd.md'],
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
  };
}

describe('registerTicketShowCommand', () => {
  let program: Command;
  let useCase: ReturnType<typeof createMockTicketShowUseCase>;
  let projectRepo: ReturnType<typeof createMockProjectRepo>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let savedExitCode: number | string | null | undefined;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    useCase = createMockTicketShowUseCase();
    projectRepo = createMockProjectRepo();
    registerTicketShowCommand(program, useCase, projectRepo);
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

  it('should display ticket details and artifacts', () => {
    program.parse(['node', 'aeos', 'ticket', 'show', 'AEOS-1']);

    expect(consoleSpy).toHaveBeenCalledWith('Ticket: AEOS-1');
    expect(consoleSpy).toHaveBeenCalledWith('Title:  Add rate limiting');
    expect(consoleSpy).toHaveBeenCalledWith('Column: PRODUCT_SCOPING');
    expect(consoleSpy).toHaveBeenCalledWith('State:  WORKING');
    expect(consoleSpy).toHaveBeenCalledWith('');
    expect(consoleSpy).toHaveBeenCalledWith('Artifacts:');
    expect(consoleSpy).toHaveBeenCalledWith('  • AEOS-1-ticket.md');
    expect(consoleSpy).toHaveBeenCalledWith('  • AEOS-1-prd.md');
  });

  it('should display em-dash for null sub_state', () => {
    (useCase.execute as ReturnType<typeof vi.fn>).mockReturnValue({
      ok: true,
      ticket: {
        id: 'AEOS-1',
        projectId: 'proj-1',
        title: 'Add rate limiting',
        column: 'BACKLOG',
        subState: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      artifacts: [],
    });

    program.parse(['node', 'aeos', 'ticket', 'show', 'AEOS-1']);

    expect(consoleSpy).toHaveBeenCalledWith('State:  —');
  });

  it('should pass ticket ID to use case (case-insensitive)', () => {
    program.parse(['node', 'aeos', 'ticket', 'show', 'aeos-1']);

    expect(useCase.execute).toHaveBeenCalledWith(expect.objectContaining({ ticketId: 'aeos-1' }));
  });

  it('should show error when ticket is not found', () => {
    (useCase.execute as ReturnType<typeof vi.fn>).mockReturnValue({
      ok: false,
      reason: 'NOT_FOUND',
    });

    program.parse(['node', 'aeos', 'ticket', 'show', 'AEOS-99']);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error: Ticket 'AEOS-99' not found. Run 'aeos ticket list' to see available tickets.",
    );
    expect(process.exitCode).toBe(1);
  });

  it('should show error for invalid ticket ID format', () => {
    program.parse(['node', 'aeos', 'ticket', 'show', '!!!invalid']);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error: Invalid ticket ID '!!!invalid'. Expected format: PREFIX-123 (e.g. AEOS-1).",
    );
    expect(process.exitCode).toBe(1);
    expect(useCase.execute).not.toHaveBeenCalled();
  });

  it('should show error when not inside an AEOS project', () => {
    (projectRepo.findRoot as ReturnType<typeof vi.fn>).mockReturnValue(null);

    program.parse(['node', 'aeos', 'ticket', 'show', 'AEOS-1']);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error: Not inside an AEOS project. Run 'aeos project init' first.",
    );
    expect(process.exitCode).toBe(1);
  });

  it('should not display artifacts section when no artifacts exist', () => {
    (useCase.execute as ReturnType<typeof vi.fn>).mockReturnValue({
      ok: true,
      ticket: {
        id: 'AEOS-1',
        projectId: 'proj-1',
        title: 'Add rate limiting',
        column: 'BACKLOG',
        subState: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      artifacts: [],
    });

    program.parse(['node', 'aeos', 'ticket', 'show', 'AEOS-1']);

    const allCalls = consoleSpy.mock.calls.map((c: unknown[]) => c[0]);
    expect(allCalls).not.toContain('Artifacts:');
  });
});
