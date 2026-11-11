// CLI command — aeos ticket repin

import type { Command } from 'commander';
import type { TicketRepinPort } from '../../domain/ports/driving/ticket-repin.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';

export function registerTicketRepinCommand(
  program: Command,
  getTicketRepinUseCase: () => TicketRepinPort,
  projectRepo: ProjectRepository,
): void {
  const ticketCmd =
    program.commands.find((c) => c.name() === 'ticket') ??
    program.command('ticket').description('Ticket management commands');

  ticketCmd
    .command('repin')
    .description("Move a spec-backed ticket's pin to the current spec after an amendment")
    .argument('<id>', 'Ticket ID (e.g. AEOS-1)')
    .action((ticketId: string) => {
      try {
        const projectPath = projectRepo.findRoot(process.cwd());
        if (!projectPath) {
          // eslint-disable-next-line no-console
          console.error('Error: No AEOS project found. Run "aeos project init" first.');
          process.exitCode = 1;
          return;
        }
        const project = projectRepo.read(projectPath);
        const result = getTicketRepinUseCase().execute({
          projectId: project.id,
          projectPath,
          ticketId,
        });
        if (!result.ok) {
          // eslint-disable-next-line no-console
          console.error(`Error: ${result.error}`);
          process.exitCode = 1;
          return;
        }
        // eslint-disable-next-line no-console
        console.log(
          `✓ ${result.epicId} repinned: ${result.fromCommit.slice(0, 7)} → ${result.toCommit.slice(0, 7)} (${result.gateRecordId})`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.error(`Error: ${message}`);
        process.exitCode = 1;
      }
    });
}
