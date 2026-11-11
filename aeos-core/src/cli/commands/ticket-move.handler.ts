// CLI command — aeos ticket move

import type { Handlers } from '../generated/commands.gen.js';
import { done, failed } from '../result.js';
import { resolveColumn, withColumnLabels } from '../../domain/services/column-labels.js';

export const ticketMove: Handlers['ticketMove'] = async (
  { id: ticketId, status: rawStatus },
  options,
  context,
) => {
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

  if (result.status === 'error') {
    return failed(result.error, (text) => withColumnLabels(text, labels));
  }
  const { fromColumn, toColumn, gateRecordId } = result;
  return done(
    { ticketId: result.ticketId, fromColumn, toColumn, gateRecordId },
    `✓ Ticket ${result.ticketId} moved: ${labels[fromColumn]} → ${labels[toColumn]}`,
  );
};
