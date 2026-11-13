// CLI command — aeos project board

import type { Handlers } from '../generated/commands.gen.js';
import type { ProjectBoardData } from '../generated/types.gen.js';
import { done } from '../result.js';
import { withColumnLabels } from '../../domain/services/column-labels.js';

export const projectBoard: Handlers['projectBoard'] = async (_args, _options, context) => {
  const result = context.container.projectBoard.execute();

  const projects: ProjectBoardData['projects'] = result.projects.map((project) => {
    // Labels come from the project's own column specs; an unavailable project
    // (its directory gone) has no tickets to label, so '' yields the fallback.
    const labels = context.container.columnLabelsOfProject(project.tickets[0]?.projectId ?? '');
    return {
      key: project.key,
      name: project.name,
      path: project.path,
      available: project.available,
      tickets: project.tickets.map((ticket) => ({
        id: ticket.id,
        title: ticket.title,
        kind: ticket.kind,
        parentId: ticket.parentId,
        column: ticket.column,
        columnLabel: withColumnLabels(ticket.column, labels),
        subState: ticket.subState,
        needsHuman: ticket.needsHuman,
      })),
    };
  });

  const text =
    projects.length === 0
      ? 'No projects registered.'
      : projects
          .map(
            (project) =>
              `${project.key}  ${project.name}${project.available ? '' : '  (unavailable)'}  ${project.tickets.length} ticket(s)`,
          )
          .join('\n');

  return done({ projects }, text);
};
