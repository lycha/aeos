// CLI command — aeos ticket list

import type { Command } from 'commander';
import type { TicketListPort } from '../../domain/ports/driving/ticket-list.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';
import { isValidColumn, Column } from '../../domain/model/column.js';

const VALID_COLUMNS = Object.values(Column).join(', ');

export function registerTicketListCommand(
  program: Command,
  getTicketListUseCase: () => TicketListPort,
  projectRepo: ProjectRepository,
): void {
  const ticketCmd =
    program.commands.find((c) => c.name() === 'ticket') ??
    program.command('ticket').description('Ticket management commands');

  ticketCmd
    .command('list')
    .description('List all tickets in the current project')
    .option('--column <column>', 'Filter by pipeline column')
    .action((opts: { column?: string }) => {
      try {
        // 1. Validate --column flag if provided
        let columnFilter: Column | undefined;
        if (opts.column) {
          const upper = opts.column.toUpperCase();
          if (!isValidColumn(upper)) {
            // eslint-disable-next-line no-console
            console.error(
              `Error: Unknown column '${opts.column}'. Valid columns: ${VALID_COLUMNS}`,
            );
            process.exitCode = 1;
            return;
          }
          columnFilter = upper;
        }

        // 2. Resolve project root
        const cwd = process.cwd();
        const projectPath = projectRepo.findRoot(cwd);

        if (!projectPath) {
          // eslint-disable-next-line no-console
          console.error("Error: Not inside an AEOS project. Run 'aeos project init' first.");
          process.exitCode = 1;
          return;
        }

        const project = projectRepo.read(projectPath);

        // 3. Call the use case
        const tickets = getTicketListUseCase().execute({
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

        for (const ticket of tickets) {
          const subState = ticket.subState ?? '—';
          const truncId =
            ticket.id.length > COL_ID ? ticket.id.substring(0, COL_ID - 1) + '…' : ticket.id;
          const truncTitle =
            ticket.title.length > COL_TITLE
              ? ticket.title.substring(0, COL_TITLE - 1) + '…'
              : ticket.title;
          const truncColumn =
            ticket.column.length > COL_COLUMN
              ? ticket.column.substring(0, COL_COLUMN - 1) + '…'
              : ticket.column;
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
    });
}
