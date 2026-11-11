// CLI command — aeos ticket ready

import type { Handlers } from '../generated/commands.gen.js';

export const ticketReady: Handlers['ticketReady'] = async ({ id: ticketId }, options, context) => {
  try {
    const { projectPath } = context;

    const project = context.container.projectRepo.read(projectPath);
    const result = context.container.ticketReady.execute({
      projectId: project.id,
      projectPath,
      ticketId,
    });

    switch (result.status) {
      case 'readied':
        // eslint-disable-next-line no-console
        console.log(
          `✓ Ticket ${result.ticketId} marked READY (previous state: ${result.previousSubState ?? 'NONE'})`,
        );
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
};
