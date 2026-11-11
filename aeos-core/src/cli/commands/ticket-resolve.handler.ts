// CLI command — aeos ticket resolve

import * as readline from 'node:readline';
import type { Handlers } from '../generated/commands.gen.js';

function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

export const ticketResolve: Handlers['ticketResolve'] = async (
  { id: ticketId },
  options,
  context,
) => {
  try {
    const { projectPath } = context;
    const successMsg = `✓ Ticket ${ticketId} resolved — sub-state set to READY; your guidance will be injected on the next run`;

    const project = context.container.projectRepo.read(projectPath);
    const run = (confirmed?: boolean) =>
      context.container.ticketResolve.execute({
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
};
