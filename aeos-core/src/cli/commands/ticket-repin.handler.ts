// CLI command — aeos ticket repin

import type { Handlers } from '../generated/commands.gen.js';
import { done, failed } from '../result.js';

export const ticketRepin: Handlers['ticketRepin'] = async ({ id: ticketId }, _options, context) => {
  const { projectPath } = context;
  const project = context.container.projectRepo.read(projectPath);
  const result = context.container.ticketRepin.execute({
    projectId: project.id,
    projectPath,
    ticketId,
  });
  if (!result.ok) return failed(result.error);

  const { fromCommit, toCommit, gateRecordId } = result;
  return done(
    { ticketId: result.ticketId, fromCommit, toCommit, gateRecordId },
    `✓ ${result.epicId} repinned: ${fromCommit.slice(0, 7)} → ${toCommit.slice(0, 7)} (${gateRecordId})`,
  );
};
