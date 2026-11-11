// CLI command — aeos ticket approve

import type { Handlers } from '../generated/commands.gen.js';
import { done, failed, stopped } from '../result.js';
import { withColumnLabels } from '../../domain/services/column-labels.js';

export const ticketApprove: Handlers['ticketApprove'] = async (
  { id: ticketId },
  options,
  context,
) => {
  const { projectPath } = context;

  const project = context.container.projectRepo.read(projectPath);
  const labels = context.container.columnLabels(projectPath);

  const result = context.container.ticketApprove.execute(project.id, projectPath, ticketId, {
    contract: options.contract === true,
  });

  switch (result.status) {
    case 'advanced':
      return done(
        {
          ticketId: result.ticketId,
          fromColumn: result.fromColumn,
          toColumn: result.toColumn,
          pullRequestUrl: result.pullRequestUrl,
          // A person's approval, which this is, is always recorded.
          gateRecordId: result.gateRecordId!,
        },
        // READY, not BLOCKED — approve resets the new column to READY so
        // it awaits its first `ticket run`.
        `✓ Ticket ${result.ticketId} advanced: ${labels[result.fromColumn]} → ${labels[result.toColumn]} (sub-state: READY)`,
      );
    case 'already_done': {
      // Nothing moved and nothing was recorded, so there is no result to return.
      const message = `Ticket ${result.ticketId} is already ${labels.DONE} — nothing to advance.`;
      return stopped('error', 'ALREADY_DONE', message, { text: message, stream: 'stdout' });
    }
    case 'error':
      return failed(result.error, (text) => withColumnLabels(text, labels));
  }
};
