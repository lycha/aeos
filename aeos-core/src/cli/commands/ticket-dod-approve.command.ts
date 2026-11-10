// CLI command — aeos ticket dod-approve

import * as readline from 'node:readline';
import type { Command } from 'commander';
import type { TicketDodApprovePort } from '../../domain/ports/driving/ticket-dod-approve.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';
import { formatCostUsd } from '../../domain/model/cost-record.js';
import { renderConformanceTable } from '../../domain/services/conformance-builder.js';

/** Asks one question on the terminal and returns the trimmed answer. */
function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function registerTicketDodApproveCommand(
  program: Command,
  getUseCase: () => TicketDodApprovePort,
  projectRepo: ProjectRepository,
): void {
  const ticketCmd =
    program.commands.find((c) => c.name() === 'ticket') ??
    program.command('ticket').description('Ticket management commands');

  ticketCmd
    .command('dod-approve')
    .description('Review the conformance report and approve a final-gate ticket as DONE')
    .argument('<id>', 'Ticket ID (e.g. AEOS-1)')
    .option('--reason <text>', 'Required when any criterion is failed or unverified')
    .option(
      '--verified <ids>',
      'Criteria a person vouches for, comma-separated (e.g. AC-3,AC-7). Each gains a human instrument citing the gate record',
    )
    .action(async (ticketId: string, options: { reason?: string; verified?: string }) => {
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
        const useCase = getUseCase();

        // 1. What is being decided: a verdict per criterion, then the pull request.
        const verified = (options.verified ?? '')
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean);
        const shown = await useCase.review(project.id, projectPath, ticketId, verified);
        if (!shown.ok) {
          // eslint-disable-next-line no-console
          console.error(`Error: ${shown.error}`);
          process.exitCode = 1;
          return;
        }
        const { report, prUrl } = shown.review;
        if (report) {
          // eslint-disable-next-line no-console
          console.log(`\n── Conformance ────────────────────────────────\n`);
          // eslint-disable-next-line no-console
          console.log(renderConformanceTable(report));
          // eslint-disable-next-line no-console
          console.log('');
        }
        // eslint-disable-next-line no-console
        console.log(`Pull request: ${prUrl ?? 'none'}\n`);

        // 2. Prompt for the decision
        const answer = await prompt(`Approve ticket ${ticketId} as DONE? [y/N] `);
        const approved = answer.toLowerCase() === 'y';
        // A no is recorded as a gate decision, and a rejection needs its reason.
        const reason =
          approved || options.reason
            ? options.reason
            : await prompt('Why not? (recorded with the decision, at least ten characters) ');

        // 3. Execute use case
        const result = useCase.execute(
          project.id,
          projectPath,
          ticketId,
          approved,
          reason,
          shown.review,
        );

        switch (result.status) {
          case 'approved':
            // eslint-disable-next-line no-console
            console.log(
              `✓ Ticket ${result.ticketId} approved: DOD_GATE → DONE (total cost: ${formatCostUsd(result.totalCostUsd)})`,
            );
            if (result.warning) {
              // eslint-disable-next-line no-console
              console.error(`Warning: ${result.warning}`);
            }
            break;
          case 'cancelled':
            // eslint-disable-next-line no-console
            console.log('DoD approval declined; the decision is recorded.');
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
