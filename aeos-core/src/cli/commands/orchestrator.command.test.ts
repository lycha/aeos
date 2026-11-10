import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { registerOrchestratorCommand } from './orchestrator.command.js';
import type { OrchestratorPort } from '../../domain/ports/driving/orchestrator.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';

describe('aeos orchestrator clear-budget', () => {
  let program: Command;
  let clearBudget: ReturnType<typeof vi.fn>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    program = new Command();
    program.exitOverride();
    clearBudget = vi.fn().mockReturnValue({ epicId: 'AEOS-1', budgetUsd: null });
    registerOrchestratorCommand(program, () => ({ clearBudget }) as unknown as OrchestratorPort, {
      findRoot: vi.fn().mockReturnValue('/test'),
      read: vi.fn().mockReturnValue({ id: 'proj-1' }),
    } as unknown as ProjectRepository);
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
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
