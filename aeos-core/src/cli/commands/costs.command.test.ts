import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerCostsCommand } from './costs.command.js';
import { Column } from '../../domain/model/column.js';
import { columnLabels } from '../../domain/services/column-labels.js';
import type { CostsPort, CostReport } from '../../domain/ports/driving/costs.port.js';

describe('aeos costs', () => {
  let program: Command;
  let execute: ReturnType<typeof vi.fn>;
  let lines: string[];

  const report = (value: CostReport): void => {
    execute.mockReturnValue({ ok: true, report: value });
  };
  const run = (...args: string[]): string => {
    program.parse(['node', 'aeos', 'costs', ...args]);
    return lines.join('\n');
  };

  beforeEach(() => {
    lines = [];
    const capture = (...parts: unknown[]): void => {
      lines.push(parts.join(' '));
    };
    vi.spyOn(console, 'log').mockImplementation(capture);
    vi.spyOn(console, 'error').mockImplementation(capture);
    execute = vi.fn();
    program = new Command().name('aeos').exitOverride().configureOutput({ writeOut: capture });
    registerCostsCommand(
      program,
      () => ({ execute }) as CostsPort,
      // Labels are per project: only `aeos` labels its tech spec column.
      (projectId) =>
        columnLabels(
          projectId === 'aeos' ? { [Column.TECH_SPEC]: { label: 'Shaping' } } : {},
          null,
        ),
    );
    report({ totalUsd: 0, unknownRecords: 0, byProject: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('says so when nothing is recorded', () => {
    expect(run()).toBe('No cost data recorded yet.');
  });

  it('shows each project with its total, and each ticket by column and by role', () => {
    report({
      totalUsd: 4.63,
      unknownRecords: 0,
      byProject: [
        {
          projectId: 'aeos',
          totalUsd: 4.23,
          byTicket: [
            {
              ticketId: 'AEOS-1',
              totalUsd: 4.23,
              byColumn: { TECH_SPEC: 4.23 },
              byRole: { worker: 3, reviewer: 1.23 },
            },
          ],
        },
        { projectId: 'other', totalUsd: 0.4, byTicket: [] },
      ],
    });

    const output = run();

    expect(output).toContain('AEOS Cost Report');
    expect(output).toContain('client-side estimates');
    expect(output).toContain('Period: all time');
    expect(output).toMatch(/^ {2}aeos +\$4\.23$/m);
    expect(output).toMatch(/^ {4}AEOS-1 +\$4\.23$/m);
    expect(output).toMatch(/^ {6}Shaping +\$4\.23$/m);
    expect(output).toMatch(/^ {6}worker +\$3\.00$/m);
    expect(output).toMatch(/^ {6}reviewer +\$1\.23$/m);
    expect(output).toMatch(/^ {2}other +\$0\.40$/m);
    expect(output).toMatch(/^Total: +\$4\.63$/m);
    expect(output).not.toContain('unknown');
  });

  it('shows unknown for an all-unknown ticket and counts unknown records in a footer', () => {
    report({
      totalUsd: 0.4,
      unknownRecords: 1,
      byProject: [
        {
          projectId: 'aeos',
          totalUsd: 0.4,
          byTicket: [
            { ticketId: 'AEOS-1', totalUsd: 0.4, byColumn: {}, byRole: {} },
            { ticketId: 'AEOS-2', totalUsd: null, byColumn: {}, byRole: {} },
          ],
        },
      ],
    });

    const output = run();

    expect(output).toMatch(/^ {4}AEOS-1 +\$0\.40$/m);
    expect(output).toMatch(/^ {4}AEOS-2 +unknown$/m);
    expect(output).toContain('1 record(s) with unknown cost are not included');
  });

  it('passes its options to the use case', () => {
    const output = run(
      '--project',
      'AEOS',
      '--epic',
      'AEOS-1',
      '--ticket',
      'AEOS-2',
      '--since',
      '2026-11-01',
    );

    expect(execute).toHaveBeenCalledWith({
      projectKey: 'AEOS',
      epicId: 'AEOS-1',
      ticketId: 'AEOS-2',
      since: '2026-11-01',
    });
    expect(output).toBe('No cost data recorded yet.');
  });

  it('names the period when --since is given', () => {
    report({
      totalUsd: 1,
      unknownRecords: 0,
      byProject: [{ projectId: 'a', totalUsd: 1, byTicket: [] }],
    });

    expect(run('--since', '2026-11-01')).toContain('Period: since 2026-11-01');
  });

  it('rejects a --since that is not a date', () => {
    expect(run('--since', 'yesterday')).toContain('Error: --since must be a date as YYYY-MM-DD');
    expect(process.exitCode).toBe(1);
    expect(execute).not.toHaveBeenCalled();
  });

  it('reports an unknown project', () => {
    execute.mockReturnValue({ ok: false, reason: 'PROJECT_NOT_FOUND' });

    expect(run('--project', 'NOPE')).toContain("Error: Project 'NOPE' not found");
    expect(process.exitCode).toBe(1);
  });

  it('shows its own help', () => {
    expect(() => run('--help')).toThrow();

    const help = lines.join('\n');
    expect(help).toContain('Usage: aeos costs');
    expect(help).toContain('Report model spend');
    for (const option of ['--project <key>', '--epic <id>', '--ticket <id>', '--since <date>']) {
      expect(help).toContain(option);
    }
  });
});
