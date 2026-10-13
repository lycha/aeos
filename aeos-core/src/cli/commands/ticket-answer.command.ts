// CLI command — aeos ticket answer

import * as readline from 'node:readline';
import type { Command } from 'commander';
import type { TicketAnswerPort } from '../../domain/ports/driving/ticket-answer.port.js';
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

export function registerTicketAnswerCommand(
  program: Command,
  getTicketAnswerUseCase: () => TicketAnswerPort,
  projectRepo: ProjectRepository,
): void {
  const ticketCmd =
    program.commands.find((c) => c.name() === 'ticket') ??
    program.command('ticket').description('Ticket management commands');

  ticketCmd
    .command('answer')
    .description('Unblock a BLOCKED ticket after answering preflight questions')
    .argument('<id>', 'Ticket ID (e.g. AEOS-1)')
    .action(async (ticketId: string) => {
      try {
        const cwd = process.cwd();
        const projectPath = projectRepo.findRoot(cwd);
        const successMsg = `✓ Ticket ${ticketId} unblocked — sub-state set to READY`;

        if (!projectPath) {
          // eslint-disable-next-line no-console
          console.error('Error: No AEOS project found. Run "aeos project init" first.');
          process.exitCode = 1;
          return;
        }

        const project = projectRepo.read(projectPath);

        const result = getTicketAnswerUseCase().execute({
          projectId: project.id,
          projectPath,
          ticketId,
        });

        if (!result.ok && result.needsConfirmation) {
          const confirmed = await askConfirmation(
            'Warning: questions file does not appear to have been modified. Continue anyway? [y/N] ',
          );
          if (!confirmed) {
            // eslint-disable-next-line no-console
            console.error('Aborted.');
            return;
          }
          const retryResult = getTicketAnswerUseCase().execute({
            projectId: project.id,
            projectPath,
            ticketId,
            confirmed: true,
          });

          if (!retryResult.ok) {
            // eslint-disable-next-line no-console
            console.error(`Error: ${'error' in retryResult ? retryResult.error : 'Unknown error'}`);
            process.exitCode = 1;
            return;
          }

          retryResult.warnings?.forEach((warning) => {
            // eslint-disable-next-line no-console
            console.warn(`Warning: ${warning}`);
          });

          // eslint-disable-next-line no-console
          console.log(successMsg);
          return;
        }

        if (!result.ok) {
          // eslint-disable-next-line no-console
          console.error(`Error: ${'error' in result ? result.error : 'Unknown error'}`);
          process.exitCode = 1;
          return;
        }

        result.warnings?.forEach((warning) => {
          // eslint-disable-next-line no-console
          console.warn(`Warning: ${warning}`);
        });

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
