// CLI command — aeos ticket dod-approve

import * as readline from 'node:readline';
import type { Command } from 'commander';
import type { TicketDodApprovePort } from '../../domain/ports/driving/ticket-dod-approve.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';
import type { RubricLoader } from '../../domain/ports/driven/rubric-loader.port.js';
import type { ArtifactStore } from '../../domain/ports/driven/artifact-store.port.js';

/** Prompt Y/N interactively. Returns true for 'y'/'Y', false otherwise. */
function promptYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

export function registerTicketDodApproveCommand(
  program: Command,
  getUseCase: () => TicketDodApprovePort,
  projectRepo: ProjectRepository,
  rubricLoader: RubricLoader,
  artifactStore: ArtifactStore,
): void {
  const ticketCmd =
    program.commands.find((c) => c.name() === 'ticket') ??
    program.command('ticket').description('Ticket management commands');

  ticketCmd
    .command('dod-approve')
    .description('Review DoD checklist and approve a DOD_GATE ticket as DONE')
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

        // 1. Load and display DoD rubric
        const rubricContent = await rubricLoader.load('rubrics/dod/dod-evaluation.md', projectPath);
        if (rubricContent) {
          // eslint-disable-next-line no-console
          console.log('\n── DoD Checklist ──────────────────────────────');
          // eslint-disable-next-line no-console
          console.log(rubricContent);
          // eslint-disable-next-line no-console
          console.log('───────────────────────────────────────────────\n');
        }

        // 2. List artifact files
        const artifacts = artifactStore.listArtifacts(projectPath, ticketId);
        if (artifacts.length > 0) {
          // eslint-disable-next-line no-console
          console.log('Artifacts:');
          for (const filename of artifacts) {
            // eslint-disable-next-line no-console
            console.log(`  .aeos/tickets/${ticketId}/${filename}`);
          }
          // eslint-disable-next-line no-console
          console.log('');
        }

        // 3. Prompt for confirmation
        const approved = await promptYesNo(
          `All DoD criteria above must be met. Approve ticket ${ticketId} as DONE? [y/N] `,
        );

        // 4. Execute use case
        const result = getUseCase().execute(project.id, projectPath, ticketId, approved);

        switch (result.status) {
          case 'approved':
            // eslint-disable-next-line no-console
            console.log(
              `✓ Ticket ${result.ticketId} approved: DOD_GATE → DONE (total cost: $${result.totalCostUsd.toFixed(4)})`,
            );
            break;
          case 'cancelled':
            // eslint-disable-next-line no-console
            console.log('DoD approval cancelled.');
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
