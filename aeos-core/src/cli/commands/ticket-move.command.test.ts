import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { registerTicketMoveCommand } from './ticket-move.command.js';
import { Column } from '../../domain/model/column.js';
import { columnLabels } from '../../domain/services/column-labels.js';
import type { TicketMovePort } from '../../domain/ports/driving/ticket-move.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';

// The tech spec column is labelled; every other column shows its default.
const labelsOf = () => columnLabels({ [Column.TECH_SPEC]: { label: 'Shaping' } }, null);

function createMockTicketMoveUseCase(): TicketMovePort {
  return {
    execute: vi.fn().mockReturnValue({
      status: 'moved',
      ticketId: 'AEOS-1',
      fromColumn: 'SPEC_REVIEW',
      toColumn: 'QA',
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

describe('registerTicketMoveCommand', () => {
  let program: Command;
  let useCase: ReturnType<typeof createMockTicketMoveUseCase>;
  let projectRepo: ReturnType<typeof createMockProjectRepo>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let savedExitCode: number | string | null | undefined;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    useCase = createMockTicketMoveUseCase();
    projectRepo = createMockProjectRepo();
    registerTicketMoveCommand(program, () => useCase, projectRepo, labelsOf);
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

  it('passes an uppercased target status to the use case', () => {
    program.parse(['node', 'aeos', 'ticket', 'move', 'AEOS-1', 'qa', '--reason', REASON]);
    expect(useCase.execute).toHaveBeenCalledWith({
      projectId: 'proj-1',
      projectPath: '/test',
      ticketId: 'AEOS-1',
      targetColumn: 'QA',
      reason: REASON,
    });
  });

  it('prints a success message when the move succeeds', () => {
    program.parse(['node', 'aeos', 'ticket', 'move', 'AEOS-1', 'QA', '--reason', REASON]);
    expect(consoleSpy).toHaveBeenCalledWith('✓ Ticket AEOS-1 moved: Spec review → Qa');
  });

  it('rejects an invalid status', () => {
    program.parse(['node', 'aeos', 'ticket', 'move', 'AEOS-1', 'not-real', '--reason', REASON]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unknown status 'not-real'"),
    );
    expect(process.exitCode).toBe(1);
    expect(useCase.execute).not.toHaveBeenCalled();
  });

  it('shows use case errors and sets exit code 1', () => {
    (useCase.execute as ReturnType<typeof vi.fn>).mockReturnValue({
      status: 'error',
      ticketId: 'AEOS-1',
      error: 'Already in QA',
    });
    program.parse(['node', 'aeos', 'ticket', 'move', 'AEOS-1', 'QA', '--reason', REASON]);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error: Already in Qa');
    expect(process.exitCode).toBe(1);
  });

  it('shows an error when not inside an AEOS project', () => {
    (projectRepo.findRoot as ReturnType<typeof vi.fn>).mockReturnValue(null);
    program.parse(['node', 'aeos', 'ticket', 'move', 'AEOS-1', 'QA', '--reason', REASON]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error: No AEOS project found. Run "aeos project init" first.',
    );
    expect(process.exitCode).toBe(1);
  });

  it('accepts a label for the target, in any case, and passes the identifier on', () => {
    program.parse(['node', 'aeos', 'ticket', 'move', 'AEOS-1', 'shaping', '--reason', REASON]);

    expect(useCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ targetColumn: 'TECH_SPEC' }),
    );
  });

  it('is refused without --reason, and the use case is not run', () => {
    program.parse(['node', 'aeos', 'ticket', 'move', 'AEOS-1', 'QA']);

    expect(useCase.execute).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('--reason'));
    expect(process.exitCode).toBe(1);
  });
});
