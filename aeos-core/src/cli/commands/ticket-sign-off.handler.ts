// CLI command — aeos ticket sign-off

import type { Handlers } from '../generated/commands.gen.js';

export const ticketSignOff: Handlers['ticketSignOff'] = async (
  { id: ticketId },
  options,
  context,
) => {
  try {
    const { projectPath } = context;

    const project = context.container.projectRepo.read(projectPath);
    const result = context.container.ticketSignOff.execute({
      projectId: project.id,
      projectPath,
      ticketId,
      reason: options.reason,
    });

    switch (result.status) {
      case 'signed_off':
        // eslint-disable-next-line no-console
        console.log(
          `✓ Ticket ${result.ticketId} signed off (previous state: ${result.previousSubState ?? 'NONE'})`,
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
