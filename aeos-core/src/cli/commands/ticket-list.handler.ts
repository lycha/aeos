// CLI command — aeos ticket list

import type { Handlers } from '../generated/commands.gen.js';
import type { Column } from '../../domain/model/column.js';
import { resolveColumn } from '../../domain/services/column-labels.js';

export const ticketList: Handlers['ticketList'] = async (_args, options, context) => {
  try {
    // 1. Resolve project root
    const { projectPath } = context;

    const labels = context.container.columnLabels(projectPath);

    // 2. Validate --column flag if provided: an identifier or a label
    let columnFilter: Column | undefined;
    if (options.column) {
      const resolved = resolveColumn(options.column, labels);
      if (!resolved) {
        // eslint-disable-next-line no-console
        console.error(
          `Error: Unknown column '${options.column}'. Valid columns: ${Object.keys(labels).join(', ')}`,
        );
        process.exitCode = 1;
        return;
      }
      columnFilter = resolved;
    }

    const project = context.container.projectRepo.read(projectPath);

    // 3. Call the use case
    const tickets = context.container.ticketList.execute({
      projectId: project.id,
      columnFilter,
    });

    // 4. Handle empty state
    if (tickets.length === 0) {
      // eslint-disable-next-line no-console
      console.log("No tickets found. Run 'aeos ticket create <title>' to add one.");
      return;
    }

    // 5. Format and print table
    const COL_ID = 10;
    const COL_TITLE = 32;
    const COL_COLUMN = 20;

    const header = [
      'ID'.padEnd(COL_ID),
      'TITLE'.padEnd(COL_TITLE),
      'COLUMN'.padEnd(COL_COLUMN),
      'SUB-STATE',
    ].join('');

    // eslint-disable-next-line no-console
    console.log(header);

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
      const row = [
        truncId.padEnd(COL_ID),
        truncTitle.padEnd(COL_TITLE),
        truncColumn.padEnd(COL_COLUMN),
        subState,
      ].join('');

      // eslint-disable-next-line no-console
      console.log(row);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(`Error: ${message}`);
    process.exitCode = 1;
  }
};
