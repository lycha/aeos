// CLI command — aeos ticket approve

import type { Command } from 'commander';
import type { TicketApprovePort } from '../../domain/ports/driving/ticket-approve.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';

export function registerTicketApproveCommand(
  program: Command,
  getTicketApproveUseCase: () => TicketApprovePort,
  projectRepo: ProjectRepository,
): void {
  const ticketCmd =
    program.commands.find((c) => c.name() === 'ticket') ??
    program.command('ticket').description('Ticket management commands');

  ticketCmd
    .command('approve')
    .description('Advance a SIGNED_OFF ticket to the next pipeline column')
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

        const result = getTicketApproveUseCase().execute(project.id, projectPath, ticketId);

        switch (result.status) {
          case 'advanced':
            // eslint-disable-next-line no-console
            console.log(
              // READY, not BLOCKED — approve resets the new column to READY so
              // it awaits its first `ticket run`.
              `✓ Ticket ${result.ticketId} advanced: ${result.fromColumn} → ${result.toColumn} (sub-state: READY)`,
            );
            break;
          case 'already_done':
            // eslint-disable-next-line no-console
            console.log(`Ticket ${result.ticketId} is already DONE — nothing to advance.`);
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
