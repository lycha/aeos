// CLI command — aeos costs

import type { Handlers } from '../generated/commands.gen.js';
import { formatCostUsd } from '../../domain/model/cost-record.js';
import type { CostBreakdown } from '../../domain/ports/driving/costs.port.js';
import { withColumnLabels } from '../../domain/services/column-labels.js';

const RULE = '─'.repeat(53);
const AMOUNT_COLUMN = 31;

function row(indent: number, label: string, costUsd: number | null): string {
  return `${`${' '.repeat(indent)}${label}`.padEnd(AMOUNT_COLUMN)}${formatCostUsd(costUsd, 2)}`;
}

export const costs: Handlers['costs'] = async (_args, options, context) => {
  const out: string[] = [];
  // Not a full calendar check: the value is only compared against timestamps.
  if (options.since && !/^\d{4}-\d{2}-\d{2}$/.test(options.since)) {
    // eslint-disable-next-line no-console
    console.error(`Error: --since must be a date as YYYY-MM-DD, got '${options.since}'.`);
    process.exitCode = 1;
    return;
  }

  // Reads the global database, so it does not need a project directory.
  const result = context.container.costs.execute({
    projectKey: options.project,
    epicId: options.epic,
    ticketId: options.ticket,
    since: options.since,
  });
  if (!result.ok) {
    // eslint-disable-next-line no-console
    console.error(`Error: Project '${options.project}' not found in the AEOS registry.`);
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
    options.since
      ? `Period: since ${options.since}`
      : 'Period: all time  (use --since YYYY-MM-DD to filter)',
    '',
    'By Project:',
  );
  for (const project of report.byProject) {
    out.push(row(2, project.projectId, project.totalUsd));
    const labels = context.container.columnLabelsOfProject(project.projectId);
    for (const ticket of project.byTicket) {
      out.push(row(4, ticket.ticketId, ticket.totalUsd));
      for (const [column, costUsd] of Object.entries(ticket.byColumn)) {
        out.push(row(6, withColumnLabels(column, labels), costUsd));
      }
      breakdownRows(ticket.byRole);
    }
  }
  out.push('', RULE, row(0, 'Total:', report.totalUsd));
  if (report.unknownRecords > 0) {
    out.push(`${report.unknownRecords} record(s) with unknown cost are not included`);
  }
  // eslint-disable-next-line no-console
  console.log(out.join('\n'));
};
