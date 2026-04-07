import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerTicketListCommand } from './ticket-list.command.js';
import type { TicketListPort } from '../../domain/ports/driving/ticket-list.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';
import type { Ticket } from '../../domain/model/ticket.js';

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'AEOS-1',
    projectId: 'proj-1',
    title: 'Test ticket',
    column: 'BACKLOG',
    subState: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createMockTicketListUseCase(): TicketListPort {
  return { execute: vi.fn().mockReturnValue([]) };
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

describe('registerTicketListCommand', () => {
  let program: Command;
  let useCase: ReturnType<typeof createMockTicketListUseCase>;
  let projectRepo: ReturnType<typeof createMockProjectRepo>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let savedExitCode: number | string | null | undefined;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    useCase = createMockTicketListUseCase();
    projectRepo = createMockProjectRepo();
    registerTicketListCommand(program, () => useCase, projectRepo);
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

  it('should display "no tickets" message when no tickets exist', () => {
    program.parse(['node', 'aeos', 'ticket', 'list']);

    expect(consoleSpy).toHaveBeenCalledWith(
      "No tickets found. Run 'aeos ticket create <title>' to add one.",
    );
  });

  it('should display tickets with correct column and sub-state', () => {
    const tickets = [
      makeTicket({ id: 'AEOS-1', title: 'Add rate limiting', column: 'BACKLOG', subState: null }),
      makeTicket({
        id: 'AEOS-2',
        title: 'Implement PM agent',
        column: 'PRODUCT_SCOPING',
        subState: 'WORKING',
      }),
    ];
    (useCase.execute as ReturnType<typeof vi.fn>).mockReturnValue(tickets);

    program.parse(['node', 'aeos', 'ticket', 'list']);

    expect(consoleSpy).toHaveBeenCalledTimes(3); // header + 2 rows
    const header = consoleSpy.mock.calls[0][0] as string;
    expect(header).toContain('ID');
    expect(header).toContain('TITLE');
    expect(header).toContain('COLUMN');
    expect(header).toContain('SUB-STATE');

    const row1 = consoleSpy.mock.calls[1][0] as string;
    expect(row1).toContain('AEOS-1');
    expect(row1).toContain('Add rate limiting');
    expect(row1).toContain('BACKLOG');
    expect(row1).toContain('—');

    const row2 = consoleSpy.mock.calls[2][0] as string;
    expect(row2).toContain('AEOS-2');
    expect(row2).toContain('PRODUCT_SCOPING');
    expect(row2).toContain('WORKING');
  });

  it('should display em-dash for null sub_state', () => {
    const tickets = [makeTicket({ subState: null })];
    (useCase.execute as ReturnType<typeof vi.fn>).mockReturnValue(tickets);

    program.parse(['node', 'aeos', 'ticket', 'list']);

    const row = consoleSpy.mock.calls[1][0] as string;
    expect(row).toContain('—');
    expect(row).not.toContain('null');
  });

  it('should filter by --column flag', () => {
    program.parse(['node', 'aeos', 'ticket', 'list', '--column', 'BACKLOG']);

    expect(useCase.execute).toHaveBeenCalledWith({
      projectId: 'proj-1',
      columnFilter: 'BACKLOG',
    });
  });

  it('should uppercase column input for case-insensitive matching', () => {
    program.parse(['node', 'aeos', 'ticket', 'list', '--column', 'backlog']);

    expect(useCase.execute).toHaveBeenCalledWith({
      projectId: 'proj-1',
      columnFilter: 'BACKLOG',
    });
  });

  it('should reject invalid column with error and exit code 1', () => {
    program.parse(['node', 'aeos', 'ticket', 'list', '--column', 'BACKLG']);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unknown column 'BACKLG'"),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Valid columns: BACKLOG'));
    expect(process.exitCode).toBe(1);
    expect(useCase.execute).not.toHaveBeenCalled();
  });

  it('should show error when not inside an AEOS project', () => {
    (projectRepo.findRoot as ReturnType<typeof vi.fn>).mockReturnValue(null);

    program.parse(['node', 'aeos', 'ticket', 'list']);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Error: Not inside an AEOS project. Run 'aeos project init' first.",
    );
    expect(process.exitCode).toBe(1);
  });
});
