// CLI command — aeos ticket approve

import type { Handlers } from '../generated/commands.gen.js';
import { withColumnLabels } from '../../domain/services/column-labels.js';

export const ticketApprove: Handlers['ticketApprove'] = async (
  { id: ticketId },
  options,
  context,
) => {
  try {
    const { projectPath } = context;

    const project = context.container.projectRepo.read(projectPath);
    const labels = context.container.columnLabels(projectPath);

    const result = context.container.ticketApprove.execute(project.id, projectPath, ticketId);

    switch (result.status) {
      case 'advanced':
        // eslint-disable-next-line no-console
        console.log(
          // READY, not BLOCKED — approve resets the new column to READY so
          // it awaits its first `ticket run`.
          `✓ Ticket ${result.ticketId} advanced: ${labels[result.fromColumn]} → ${labels[result.toColumn]} (sub-state: READY)`,
        );
        break;
      case 'already_done':
        // eslint-disable-next-line no-console
        console.log(`Ticket ${result.ticketId} is already ${labels.DONE} — nothing to advance.`);
        break;
      case 'error':
        // eslint-disable-next-line no-console
        console.error(`Error: ${withColumnLabels(result.error, labels)}`);
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
