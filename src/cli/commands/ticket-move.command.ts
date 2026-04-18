// CLI command — aeos ticket move

import type { Command } from 'commander';
import { Column, isValidColumn } from '../../domain/model/column.js';
import type { TicketMovePort } from '../../domain/ports/driving/ticket-move.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';

export function registerTicketMoveCommand(
  program: Command,
  getTicketMoveUseCase: () => TicketMovePort,
  projectRepo: ProjectRepository,
): void {
  const ticketCmd =
    program.commands.find((c) => c.name() === 'ticket') ??
    program.command('ticket').description('Ticket management commands');

  ticketCmd
    .command('move')
    .description('Move a ticket to any workflow status')
    .argument('<id>', 'Ticket ID (e.g. AEOS-1)')
    .argument('<status>', 'Target workflow status / column')
    .action((ticketId: string, rawStatus: string) => {
      try {
        const cwd = process.cwd();
        const projectPath = projectRepo.findRoot(cwd);

        if (!projectPath) {
          // eslint-disable-next-line no-console
          console.error('Error: No AEOS project found. Run "aeos project init" first.');
          process.exitCode = 1;
          return;
        }

        const targetColumn = rawStatus.toUpperCase();
        if (!isValidColumn(targetColumn)) {
          // eslint-disable-next-line no-console
          console.error(
            `Error: Unknown status '${rawStatus}'. Valid statuses: ${Object.values(Column).join(', ')}`,
          );
          process.exitCode = 1;
          return;
        }

        const project = projectRepo.read(projectPath);
        const result = getTicketMoveUseCase().execute({
          projectId: project.id,
          projectPath,
          ticketId,
          targetColumn,
        });

        switch (result.status) {
          case 'moved':
            // eslint-disable-next-line no-console
            console.log(
              `✓ Ticket ${result.ticketId} moved: ${result.fromColumn} → ${result.toColumn}`,
            );
            break;
          case 'error':
            // eslint-disable-next-line no-console
            console.error(`Error: ${result.error}`);
            process.exitCode = 1;
            break;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.error(`Error: ${message}`);
        process.exitCode = 1;
      }
    });
}
