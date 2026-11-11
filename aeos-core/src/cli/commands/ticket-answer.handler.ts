// CLI command — aeos ticket answer

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

export const ticketAnswer: Handlers['ticketAnswer'] = async (
  { id: ticketId },
  options,
  context,
) => {
  try {
    const { projectPath } = context;
    const successMsg = (amended?: string[]): string =>
      amended
        ? `Decision recorded as ${amended.join(', ')}. Update spec.md (spec-writer), commit, then run \`aeos ticket repin ${ticketId}\`.`
        : `✓ Ticket ${ticketId} unblocked — sub-state set to READY`;

    const project = context.container.projectRepo.read(projectPath);

    const result = context.container.ticketAnswer.execute({
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
      const retryResult = context.container.ticketAnswer.execute({
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
      console.log(successMsg(retryResult.amendedDecisions));
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
    console.log(successMsg(result.amendedDecisions));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(`Error: ${message}`);
    process.exitCode = 1;
  }
};
