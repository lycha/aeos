import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerTicketShowCommand } from './ticket-show.command.js';
import { Column } from '../../domain/model/column.js';
import { columnLabels } from '../../domain/services/column-labels.js';
import type { TicketShowPort } from '../../domain/ports/driving/ticket-show.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';

// The tech spec column is labelled; every other column shows its default.
const labelsOf = () => columnLabels({ [Column.TECH_SPEC]: { label: 'Shaping' } }, null);

function createMockTicketShowUseCase(): TicketShowPort {
  return {
    execute: vi.fn().mockReturnValue({
      ok: true,
      runs: ['RUN-20261110T100000Z-ab12'],
      children: [],
      parent: null,
      ticket: {
        id: 'AEOS-1',
        projectId: 'proj-1',
        title: 'Add rate limiting',
        kind: 'EPIC',
        parentId: null,
        column: 'SPEC_REVIEW',
        subState: 'WORKING',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      artifacts: ['AEOS-1-ticket.md', 'AEOS-1-prd.md'],
      executions: [
        {
          executor: 'claude-cli',
          model: 'claude-opus-4-6',
          agent: 'worker-agent',
          column: 'SPEC_REVIEW',
          recordedAt: '2026-01-01T00:00:00.000Z',
          costUsd: 0.0123,
        },
        {
          executor: 'ollama-cli',
          model: 'llama',
          agent: 'reviewer-agent',
          column: 'SPEC_REVIEW',
          recordedAt: '2026-01-01T00:01:00.000Z',
          costUsd: null,
        },
      ],
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
    registerTicketShowCommand(program, () => useCase, projectRepo, labelsOf);
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
    // The one place the identifier is shown beside the label.
    expect(consoleSpy).toHaveBeenCalledWith('Column: Spec review (SPEC_REVIEW)');
    expect(consoleSpy).toHaveBeenCalledWith('State:  WORKING');
    expect(consoleSpy).toHaveBeenCalledWith('');
    expect(consoleSpy).toHaveBeenCalledWith('Artifacts:');
    expect(consoleSpy).toHaveBeenCalledWith('  • AEOS-1-ticket.md');
    expect(consoleSpy).toHaveBeenCalledWith('  • AEOS-1-prd.md');
  });

  it('shows the pull request URL once one is recorded, and no line before that', () => {
    program.parse(['node', 'aeos', 'ticket', 'show', 'AEOS-1']);
    expect(consoleSpy.mock.calls.flat().join('\n')).not.toContain('PR:');

    const shown = createMockTicketShowUseCase().execute({
      projectId: 'proj-1',
      ticketId: 'AEOS-1',
      projectPath: '/test',
    }) as unknown as { ticket: Record<string, unknown> };
    (useCase.execute as ReturnType<typeof vi.fn>).mockReturnValue({
      ...shown,
      ticket: { ...shown.ticket, prUrl: 'https://github.com/o/r/pull/7' },
    });
    program.parse(['node', 'aeos', 'ticket', 'show', 'AEOS-1']);

    expect(consoleSpy).toHaveBeenCalledWith('PR:     https://github.com/o/r/pull/7');
  });

  it('shows the cost of each execution, and unknown when it is null', () => {
    program.parse(['node', 'aeos', 'ticket', 'show', 'AEOS-1']);

    expect(consoleSpy).toHaveBeenCalledWith(
      '  • Spec review (worker-agent): claude-cli / claude-opus-4-6 — $0.0123',
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      '  • Spec review (reviewer-agent): ollama-cli / llama — unknown',
    );
  });

  it('should display em-dash for null sub_state', () => {
    (useCase.execute as ReturnType<typeof vi.fn>).mockReturnValue({
      ok: true,
      runs: [],
      children: [],
      parent: null,
      ticket: {
        id: 'AEOS-1',
        projectId: 'proj-1',
        title: 'Add rate limiting',
        kind: 'EPIC',
        parentId: null,
        column: 'BACKLOG',
        subState: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      artifacts: [],
      executions: [],
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
      runs: [],
      children: [],
      parent: null,
      ticket: {
        id: 'AEOS-1',
        projectId: 'proj-1',
        title: 'Add rate limiting',
        kind: 'EPIC',
        parentId: null,
        column: 'BACKLOG',
        subState: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      artifacts: [],
      executions: [],
    });

    program.parse(['node', 'aeos', 'ticket', 'show', 'AEOS-1']);

    const allCalls = consoleSpy.mock.calls.map((c: unknown[]) => c[0]);
    expect(allCalls).not.toContain('Artifacts:');
  });

  it('should list the run ids', () => {
    program.parse(['node', 'aeos', 'ticket', 'show', 'AEOS-1']);

    const allCalls = consoleSpy.mock.calls.map((c: unknown[]) => c[0]);
    expect(allCalls).toContain('Runs:');
    expect(allCalls).toContain('  • RUN-20261110T100000Z-ab12');
  });
});
