// CLI command — aeos ticket create

import type { Command } from 'commander';
import type { TicketCreatePort } from '../../domain/ports/driving/ticket-create.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';

export function registerTicketCreateCommand(
  program: Command,
  ticketCreateUseCase: TicketCreatePort,
  projectRepo: ProjectRepository,
): void {
  const ticketCmd =
    program.commands.find((c) => c.name() === 'ticket') ??
    program.command('ticket').description('Ticket management commands');

  ticketCmd
    .command('create')
    .description('Create a new ticket')
    .argument('<title>', 'Ticket title')
    .action((title: string) => {
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

        const result = ticketCreateUseCase.execute({
          title,
          projectId: project.id,
          projectKey: project.key,
          projectPath,
        });

        // eslint-disable-next-line no-console
        console.log(`✓ Created ticket ${result.ticketId}: "${result.title}"`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.error(`Error: ${message}`);
        process.exitCode = 1;
      }
    });
}
