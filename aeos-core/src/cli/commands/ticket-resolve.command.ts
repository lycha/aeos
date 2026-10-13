// CLI command — aeos ticket resolve

import * as readline from 'node:readline';
import type { Command } from 'commander';
import type { TicketResolvePort } from '../../domain/ports/driving/ticket-resolve.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';

function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

export function registerTicketResolveCommand(
  program: Command,
  getTicketResolveUseCase: () => TicketResolvePort,
  projectRepo: ProjectRepository,
): void {
  const ticketCmd =
    program.commands.find((c) => c.name() === 'ticket') ??
    program.command('ticket').description('Ticket management commands');

  ticketCmd
    .command('resolve')
    .description('Resume an ESCALATED ticket after writing a decision in its escalation.md')
    .argument('<id>', 'Ticket ID (e.g. AEOS-1)')
    .action(async (ticketId: string) => {
      try {
        const projectPath = projectRepo.findRoot(process.cwd());
        const successMsg = `✓ Ticket ${ticketId} resolved — sub-state set to READY; your guidance will be injected on the next run`;

        if (!projectPath) {
          // eslint-disable-next-line no-console
          console.error('Error: No AEOS project found. Run "aeos project init" first.');
          process.exitCode = 1;
          return;
        }

        const project = projectRepo.read(projectPath);
        const run = (confirmed?: boolean) =>
          getTicketResolveUseCase().execute({
            projectId: project.id,
            projectPath,
            ticketId,
            confirmed,
          });

        let result = run();

        if (!result.ok && 'needsConfirmation' in result && result.needsConfirmation) {
          const confirmed = await askConfirmation(
            'Warning: escalation file does not appear to have been modified. Continue anyway? [y/N] ',
          );
          if (!confirmed) {
            // eslint-disable-next-line no-console
            console.error('Aborted.');
            return;
          }
          result = run(true);
        }

        if (!result.ok) {
          // eslint-disable-next-line no-console
          console.error(`Error: ${'error' in result ? result.error : 'Unknown error'}`);
          process.exitCode = 1;
          return;
        }

        // eslint-disable-next-line no-console
        console.log(successMsg);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.error(`Error: ${message}`);
        process.exitCode = 1;
      }
    });
}
