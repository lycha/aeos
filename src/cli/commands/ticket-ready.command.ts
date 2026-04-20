// CLI command — aeos ticket ready

import type { Command } from 'commander';
import type { TicketReadyPort } from '../../domain/ports/driving/ticket-ready.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';

export function registerTicketReadyCommand(
  program: Command,
  getTicketReadyUseCase: () => TicketReadyPort,
  projectRepo: ProjectRepository,
): void {
  const ticketCmd =
    program.commands.find((c) => c.name() === 'ticket') ??
    program.command('ticket').description('Ticket management commands');

  ticketCmd
    .command('ready')
    .description('Set a ticket sub-state to READY')
    .argument('<id>', 'Ticket ID (e.g. AEOS-1)')
    .action((ticketId: string) => {
      try {
        const cwd = process.cwd();
        const projectPath = projectRepo.findRoot(cwd);

        if (!projectPath) {
          // eslint-disable-next-line no-console
          console.error('Error: No AEOS project found. Run "aeos project init" first.');
          process.exitCode = 1;
          return;
        }

        const project = projectRepo.read(projectPath);
        const result = getTicketReadyUseCase().execute({
          projectId: project.id,
          projectPath,
          ticketId,
        });

        switch (result.status) {
          case 'readied':
            // eslint-disable-next-line no-console
            console.log(
              `✓ Ticket ${result.ticketId} marked READY (previous state: ${result.previousSubState ?? 'NONE'})`,
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
