// CLI command — aeos ticket ready

import type { Handlers } from '../generated/commands.gen.js';
import { done, failed } from '../result.js';

export const ticketReady: Handlers['ticketReady'] = async ({ id: ticketId }, _options, context) => {
  const { projectPath } = context;

  const project = context.container.projectRepo.read(projectPath);
  const result = context.container.ticketReady.execute({
    projectId: project.id,
    projectPath,
    ticketId,
  });

  if (result.status === 'error') return failed(result.error);
  return done(
    { ticketId: result.ticketId, subState: 'READY' },
    `✓ Ticket ${result.ticketId} marked READY (previous state: ${result.previousSubState ?? 'NONE'})`,
  );
};
