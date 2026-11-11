// CLI command — aeos ticket repin

import type { Handlers } from '../generated/commands.gen.js';

export const ticketRepin: Handlers['ticketRepin'] = async ({ id: ticketId }, options, context) => {
  try {
    const { projectPath } = context;
    const project = context.container.projectRepo.read(projectPath);
    const result = context.container.ticketRepin.execute({
      projectId: project.id,
      projectPath,
      ticketId,
    });
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.error(`Error: ${result.error}`);
      process.exitCode = 1;
      return;
    }
    // eslint-disable-next-line no-console
    console.log(
      `✓ ${result.epicId} repinned: ${result.fromCommit.slice(0, 7)} → ${result.toCommit.slice(0, 7)} (${result.gateRecordId})`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(`Error: ${message}`);
    process.exitCode = 1;
  }
};
