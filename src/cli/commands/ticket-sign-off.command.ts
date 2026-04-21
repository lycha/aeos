// CLI command — aeos ticket sign-off

import type { Command } from 'commander';
import type { TicketSignOffPort } from '../../domain/ports/driving/ticket-sign-off.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';

export function registerTicketSignOffCommand(
  program: Command,
  getTicketSignOffUseCase: () => TicketSignOffPort,
  projectRepo: ProjectRepository,
): void {
  const ticketCmd =
    program.commands.find((c) => c.name() === 'ticket') ??
    program.command('ticket').description('Ticket management commands');

  ticketCmd
    .command('sign-off')
    .description('Manually set a ticket sub-state to SIGNED_OFF')
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
        const result = getTicketSignOffUseCase().execute({
          projectId: project.id,
          projectPath,
          ticketId,
        });

        switch (result.status) {
          case 'signed_off':
            // eslint-disable-next-line no-console
            console.log(
              `✓ Ticket ${result.ticketId} signed off (previous state: ${result.previousSubState ?? 'NONE'})`,
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
