// CLI command — aeos costs

import type { Command } from 'commander';
import { formatCostUsd } from '../../domain/model/cost-record.js';
import type { CostBreakdown, CostsPort } from '../../domain/ports/driving/costs.port.js';

const RULE = '─'.repeat(53);
const AMOUNT_COLUMN = 31;

function row(indent: number, label: string, costUsd: number | null): string {
  return `${`${' '.repeat(indent)}${label}`.padEnd(AMOUNT_COLUMN)}${formatCostUsd(costUsd, 2)}`;
}

export function registerCostsCommand(program: Command, getCostsUseCase: () => CostsPort): void {
  program
    .command('costs')
    .description('Report model spend')
    .option('--project <key>', 'Limit to one project')
    .option('--epic <id>', 'One epic and its child tasks')
    .option('--ticket <id>', 'One ticket')
    .option('--since <date>', 'Records from this date on (YYYY-MM-DD)')
    .action((opts: { project?: string; epic?: string; ticket?: string; since?: string }) => {
      const out: string[] = [];
      // Not a full calendar check: the value is only compared against timestamps.
      if (opts.since && !/^\d{4}-\d{2}-\d{2}$/.test(opts.since)) {
        // eslint-disable-next-line no-console
        console.error(`Error: --since must be a date as YYYY-MM-DD, got '${opts.since}'.`);
        process.exitCode = 1;
        return;
      }

      // Reads the global database, so it does not need a project directory.
      const result = getCostsUseCase().execute({
        projectKey: opts.project,
        epicId: opts.epic,
        ticketId: opts.ticket,
        since: opts.since,
      });
      if (!result.ok) {
        // eslint-disable-next-line no-console
        console.error(`Error: Project '${opts.project}' not found in the AEOS registry.`);
        process.exitCode = 1;
        return;
      }

      const { report } = result;
      if (report.byProject.length === 0) {
        // eslint-disable-next-line no-console
        console.log('No cost data recorded yet.');
        return;
      }

      const breakdownRows = (breakdown: CostBreakdown): void => {
        for (const [name, costUsd] of Object.entries(breakdown)) out.push(row(6, name, costUsd));
      };

      out.push(
        'AEOS Cost Report',
        RULE,
        'Costs from Claude Code are client-side estimates, not billing data.',
        opts.since
          ? `Period: since ${opts.since}`
          : 'Period: all time  (use --since YYYY-MM-DD to filter)',
        '',
        'By Project:',
      );
      for (const project of report.byProject) {
        out.push(row(2, project.projectId, project.totalUsd));
        for (const ticket of project.byTicket) {
          out.push(row(4, ticket.ticketId, ticket.totalUsd));
          breakdownRows(ticket.byColumn);
          breakdownRows(ticket.byRole);
        }
      }
      out.push('', RULE, row(0, 'Total:', report.totalUsd));
      if (report.unknownRecords > 0) {
        out.push(`${report.unknownRecords} record(s) with unknown cost are not included`);
      }
      // eslint-disable-next-line no-console
      console.log(out.join('\n'));
    });
}
