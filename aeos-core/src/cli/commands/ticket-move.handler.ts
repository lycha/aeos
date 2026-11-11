// CLI command — aeos ticket move

import type { Handlers } from '../generated/commands.gen.js';
import { resolveColumn, withColumnLabels } from '../../domain/services/column-labels.js';

export const ticketMove: Handlers['ticketMove'] = async (
  { id: ticketId, status: rawStatus },
  options,
  context,
) => {
  try {
    const { projectPath } = context;

    // An identifier or a label; only the identifier goes any further.
    const labels = context.container.columnLabels(projectPath);
    // An unknown one goes on as typed: the use case answers with the
    // columns of this ticket's pipeline.
    const targetColumn = resolveColumn(rawStatus, labels) ?? rawStatus;

    const project = context.container.projectRepo.read(projectPath);
    const result = context.container.ticketMove.execute({
      projectId: project.id,
      projectPath,
      ticketId,
      targetColumn,
      reason: options.reason,
    });

    switch (result.status) {
      case 'moved':
        // eslint-disable-next-line no-console
        console.log(
          `✓ Ticket ${result.ticketId} moved: ${labels[result.fromColumn]} → ${labels[result.toColumn]}`,
        );
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
