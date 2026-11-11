// CLI command — aeos ticket sign-off

import type { Handlers } from '../generated/commands.gen.js';
import { done, failed } from '../result.js';

export const ticketSignOff: Handlers['ticketSignOff'] = async (
  { id: ticketId },
  options,
  context,
) => {
  const { projectPath } = context;

  const project = context.container.projectRepo.read(projectPath);
  const result = context.container.ticketSignOff.execute({
    projectId: project.id,
    projectPath,
    ticketId,
    reason: options.reason,
  });

  if (result.status === 'error') return failed(result.error);
  return done(
    { ticketId: result.ticketId, subState: 'SIGNED_OFF', gateRecordId: result.gateRecordId },
    `✓ Ticket ${result.ticketId} signed off (previous state: ${result.previousSubState ?? 'NONE'})`,
  );
};
