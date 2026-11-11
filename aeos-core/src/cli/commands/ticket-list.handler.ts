// CLI command — aeos ticket list

import type { Handlers } from '../generated/commands.gen.js';
import { done, stopped } from '../result.js';
import { summaryOf } from '../ticket-data.js';
import type { Column } from '../../domain/model/column.js';
import { resolveColumn } from '../../domain/services/column-labels.js';

export const ticketList: Handlers['ticketList'] = async (_args, options, context) => {
  // 1. Resolve project root
  const { projectPath } = context;

  const labels = context.container.columnLabels(projectPath);

  // 2. Validate --column flag if provided: an identifier or a label
  let columnFilter: Column | undefined;
  if (options.column) {
    const resolved = resolveColumn(options.column, labels);
    if (!resolved) {
      return stopped(
        'usage',
        'INVALID_ARGUMENT',
        `Unknown column '${options.column}'. Valid columns: ${Object.keys(labels).join(', ')}`,
      );
    }
    columnFilter = resolved;
  }

  const project = context.container.projectRepo.read(projectPath);

  // 3. Call the use case
  const tickets = context.container.ticketList.execute({
    projectId: project.id,
    columnFilter,
  });
  const data = { tickets: tickets.map((ticket) => summaryOf(ticket, labels)) };

  // 4. Handle empty state
  if (tickets.length === 0) {
    return done(data, "No tickets found. Run 'aeos ticket create <title>' to add one.");
  }

  // 5. Format the table
  const COL_ID = 10;
  const COL_TITLE = 32;
  const COL_COLUMN = 20;

  const rows = [
    ['ID'.padEnd(COL_ID), 'TITLE'.padEnd(COL_TITLE), 'COLUMN'.padEnd(COL_COLUMN), 'SUB-STATE'].join(
      '',
    ),
  ];

  // Nest tasks under their epic so hierarchy is visible at a glance.
  // Under a column filter the parent may be absent from the result set,
  // so anything whose parent is missing is rendered at top level.
  const present = new Set(tickets.map((t) => t.id));
  const childrenOf = new Map<string, typeof tickets>();
  for (const ticket of tickets) {
    if (ticket.parentId && present.has(ticket.parentId)) {
      const siblings = childrenOf.get(ticket.parentId) ?? [];
      siblings.push(ticket);
      childrenOf.set(ticket.parentId, siblings);
    }
  }
  const ordered = tickets.flatMap((ticket) => {
    if (ticket.parentId && present.has(ticket.parentId)) return [];
    return [ticket, ...(childrenOf.get(ticket.id) ?? [])];
  });

  for (const ticket of ordered) {
    const nested = ticket.parentId !== null && present.has(ticket.parentId);
    const subState = ticket.subState ?? '—';
    const displayId = nested ? `└ ${ticket.id}` : ticket.id;
    const truncId =
      displayId.length > COL_ID ? displayId.substring(0, COL_ID - 1) + '…' : displayId;
    const truncTitle =
      ticket.title.length > COL_TITLE
        ? ticket.title.substring(0, COL_TITLE - 1) + '…'
        : ticket.title;
    const label = labels[ticket.column];
    const truncColumn =
      label.length > COL_COLUMN ? label.substring(0, COL_COLUMN - 1) + '…' : label;
    rows.push(
      [
        truncId.padEnd(COL_ID),
        truncTitle.padEnd(COL_TITLE),
        truncColumn.padEnd(COL_COLUMN),
        subState,
      ].join(''),
    );
  }

  return done(data, rows.join('\n'));
};
