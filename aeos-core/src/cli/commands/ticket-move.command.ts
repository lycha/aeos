// CLI command — aeos ticket move

import type { Command } from 'commander';
import { Column } from '../../domain/model/column.js';
import {
  resolveColumn,
  withColumnLabels,
  type ColumnLabels,
} from '../../domain/services/column-labels.js';
import type { TicketMovePort } from '../../domain/ports/driving/ticket-move.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';

export function registerTicketMoveCommand(
  program: Command,
  getTicketMoveUseCase: () => TicketMovePort,
  projectRepo: ProjectRepository,
  getLabels: (projectPath: string) => ColumnLabels,
): void {
  const ticketCmd =
    program.commands.find((c) => c.name() === 'ticket') ??
    program.command('ticket').description('Ticket management commands');

  ticketCmd
    .command('move')
    .description('Move a ticket to any workflow status')
    .argument('<id>', 'Ticket ID (e.g. AEOS-1)')
    .argument('<status>', 'Target column (identifier or label)')
    .option('--reason <text>', 'Why the normal path is being bypassed. Recorded as a gate')
    .action((ticketId: string, rawStatus: string, options: { reason?: string }) => {
      try {
        if (!options.reason) {
          // eslint-disable-next-line no-console
          console.error(
            'Error: --reason <text> is required: say why the normal path is being bypassed. It is recorded with the decision.',
          );
          process.exitCode = 1;
          return;
        }

        const cwd = process.cwd();
        const projectPath = projectRepo.findRoot(cwd);

        if (!projectPath) {
          // eslint-disable-next-line no-console
          console.error('Error: No AEOS project found. Run "aeos project init" first.');
          process.exitCode = 1;
          return;
        }

        // An identifier or a label; only the identifier goes any further.
        const labels = getLabels(projectPath);
        const targetColumn = resolveColumn(rawStatus, labels);
        if (!targetColumn) {
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
          reason: options.reason,
        });

        switch (result.status) {
          case 'moved':
            // eslint-disable-next-line no-console
            console.log(
              `✓ Ticket ${result.ticketId} moved: ${labels[result.fromColumn]} → ${labels[result.toColumn]}`,
            );
            break;
          case 'error':
            // eslint-disable-next-line no-console
            console.error(`Error: ${withColumnLabels(result.error, labels)}`);
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
