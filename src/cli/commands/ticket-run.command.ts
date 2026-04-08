// CLI command — aeos ticket run

import type { Command } from 'commander';
import type { TicketRunPort } from '../../domain/ports/driving/ticket-run.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';

export function registerTicketRunCommand(
  program: Command,
  getTicketRunUseCase: () => TicketRunPort,
  projectRepo: ProjectRepository,
): void {
  const ticketCmd =
    program.commands.find((c) => c.name() === 'ticket') ??
    program.command('ticket').description('Ticket management commands');

  ticketCmd
    .command('run')
    .description(
      'Run the full column cycle for a ticket (preflight → executor → review → sign-off)',
    )
    .argument('<id>', 'Ticket ID (e.g. AEOS-1)')
    .action(async (ticketId: string) => {
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

        // eslint-disable-next-line no-console
        console.log(`Running ticket ${ticketId}…`);

        const result = await getTicketRunUseCase().execute(project.id, projectPath, ticketId);

        switch (result.status) {
          case 'success':
            // eslint-disable-next-line no-console
            console.log(`✓ Ticket ${result.ticketId} reached SIGNED_OFF`);
            // eslint-disable-next-line no-console
            console.log(`  Artifact: ${result.artifactPath}`);
            // eslint-disable-next-line no-console
            console.log(`  Review:   ${result.reviewPath}`);
            break;
          case 'blocked':
            // eslint-disable-next-line no-console
            console.log(`⚠ Ticket ${result.ticketId} is blocked:`);
            for (const blocker of result.blockers) {
              // eslint-disable-next-line no-console
              console.log(`  - ${blocker}`);
            }
            break;
          case 'failed':
            // eslint-disable-next-line no-console
            console.error(`✗ Ticket ${result.ticketId} failed: ${result.error}`);
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
