// CLI command — aeos ticket create

import type { Command } from 'commander';
import type { TicketCreatePort } from '../../domain/ports/driving/ticket-create.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';

export function registerTicketCreateCommand(
  program: Command,
  getTicketCreateUseCase: () => TicketCreatePort,
  projectRepo: ProjectRepository,
): void {
  const ticketCmd =
    program.commands.find((c) => c.name() === 'ticket') ??
    program.command('ticket').description('Ticket management commands');

  ticketCmd
    .command('create')
    .description('Create a new ticket (an epic by default, or a task with --parent)')
    .argument('<title>', 'Ticket title')
    .option(
      '--parent <epicId>',
      'Create this ticket as a task under the given epic, skipping scoping and spec',
    )
    .option(
      '--key <taskKey>',
      'Stable decomposition key (e.g. T-001); idempotency matches on it instead of the title',
    )
    .action((title: string, options: { parent?: string; key?: string }) => {
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

        const result = getTicketCreateUseCase().execute({
          title,
          projectId: project.id,
          projectKey: project.key,
          projectPath,
          parentId: options.parent,
          taskKey: options.key,
        });

        const lineage = result.parentId ? ` (task of ${result.parentId})` : '';
        if (result.alreadyExisted) {
          // eslint-disable-next-line no-console
          console.log(
            `= ${result.kind} ${result.ticketId} already exists: "${result.title}"${lineage} — left as is`,
          );
        } else {
          // eslint-disable-next-line no-console
          console.log(`✓ Created ${result.kind} ${result.ticketId}: "${result.title}"${lineage}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.error(`Error: ${message}`);
        process.exitCode = 1;
      }
    });
}
