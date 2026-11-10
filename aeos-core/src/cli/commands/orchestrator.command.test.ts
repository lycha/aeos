import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { registerOrchestratorCommand } from './orchestrator.command.js';
import { columnLabels } from '../../domain/services/column-labels.js';
import type { OrchestratorPort } from '../../domain/ports/driving/orchestrator.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';
import { displayOrder } from '../../domain/model/column.js';
import { templatePipelines } from '../../infrastructure/spec-loader/yaml-pipeline-loader.adapter.js';

// Every column of the shipped pipelines.
const COLUMNS = displayOrder(templatePipelines());

describe('aeos orchestrator clear-budget', () => {
  let program: Command;
  let clearBudget: ReturnType<typeof vi.fn>;
  const status = vi.fn();
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    clearBudget = vi.fn().mockReturnValue({ epicId: 'AEOS-1', budgetUsd: null });
    registerOrchestratorCommand(
      program,
      () => ({ clearBudget, status }) as unknown as OrchestratorPort,
      {
        findRoot: vi.fn().mockReturnValue('/test'),
        read: vi.fn().mockReturnValue({ id: 'proj-1' }),
      } as unknown as ProjectRepository,
      () => columnLabels(COLUMNS, { TECH_SPEC: { label: 'Shaping' } }, null),
    );
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('shows a stored halt message with column labels in place of identifiers', () => {
    status.mockReturnValue([
      {
        epicId: 'AEOS-1',
        status: 'HALTED',
        budgetUsd: null,
        haltReason: 'AWAITING_APPROVAL',
        message: 'AEOS-1 is ready to leave TECH_SPEC, but that column advances manually.',
      },
    ]);

    program.parse(['node', 'aeos', 'orchestrator', 'status']);

    expect(consoleSpy.mock.calls[0]![0]).toContain('ready to leave Shaping, but');
    expect(consoleSpy.mock.calls[0]![0]).toContain('last halt: AWAITING_APPROVAL');
  });

  it('clears the budget and prints a one-line confirmation', () => {
    program.parse(['node', 'aeos', 'orchestrator', 'clear-budget', 'AEOS-1']);

    expect(clearBudget).toHaveBeenCalledWith('proj-1', 'AEOS-1');
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith('✓ AEOS-1 budget cleared (no ceiling)');
  });

  it('lets the "no orchestrator state" error reach the CLI error handler', () => {
    clearBudget.mockImplementation(() => {
      throw new Error('Epic AEOS-1 has no orchestrator state');
    });

    expect(() => program.parse(['node', 'aeos', 'orchestrator', 'clear-budget', 'AEOS-1'])).toThrow(
      /no orchestrator state/,
    );
  });
});
