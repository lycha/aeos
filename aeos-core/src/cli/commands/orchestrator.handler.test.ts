import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { programWith } from './program.fixture.js';
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
  const spentUsd = vi.fn().mockReturnValue(0);
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    clearBudget = vi.fn().mockReturnValue({ epicId: 'AEOS-1', budgetUsd: null });
    programWith(
      {
        orchestrator: { clearBudget, status, spentUsd } as unknown as OrchestratorPort,
        projectRepo: {
          findRoot: vi.fn().mockReturnValue('/test'),
          read: vi.fn().mockReturnValue({ id: 'proj-1' }),
        } as unknown as ProjectRepository,
        columnLabels: () => columnLabels(COLUMNS, { TECH_SPEC: { label: 'Shaping' } }, null),
      },
      program,
    );
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('shows a stored halt message with column labels in place of identifiers', async () => {
    status.mockReturnValue([
      {
        epicId: 'AEOS-1',
        status: 'HALTED',
        budgetUsd: null,
        haltReason: 'AWAITING_APPROVAL',
        message: 'AEOS-1 is ready to leave TECH_SPEC, but that column advances manually.',
      },
    ]);

    await program.parseAsync(['node', 'aeos', 'orchestrator', 'status']);

    const printed = consoleSpy.mock.calls.map((call: unknown[]) => call[0]).join('\n');
    expect(printed).toContain('ready to leave Shaping, but');
    expect(printed).toContain('last halt: AWAITING_APPROVAL');
  });

  it('clears the budget and prints a one-line confirmation', async () => {
    await program.parseAsync(['node', 'aeos', 'orchestrator', 'clear-budget', 'AEOS-1']);

    expect(clearBudget).toHaveBeenCalledWith('proj-1', 'AEOS-1');
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith('✓ AEOS-1 budget cleared (no ceiling)');
  });

  it('reports the "no orchestrator state" error and exits 1', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    clearBudget.mockImplementation(() => {
      throw new Error('Epic AEOS-1 has no orchestrator state');
    });

    await program.parseAsync(['node', 'aeos', 'orchestrator', 'clear-budget', 'AEOS-1']);

    expect(errors).toHaveBeenCalledWith('Error: Epic AEOS-1 has no orchestrator state');
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
    errors.mockRestore();
  });
});
