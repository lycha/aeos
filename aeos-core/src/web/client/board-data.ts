// Web client — pure board-shaping logic (AC-4/AC-6), kept out of Board.tsx so
// it is testable with no DOM: the "needs you" area is exactly the tickets
// `project board`'s own `needsHuman` flag already marks, gathered across every
// project ahead of the rest of the board.

import type { ProjectBoardData } from '../../cli/generated/types.gen.js';

export type ProjectRow = ProjectBoardData['projects'][number];
export type TicketRow = ProjectRow['tickets'][number];

export interface NeedsHumanRow extends TicketRow {
  readonly projectKey: string;
  readonly projectName: string;
}

export interface BoardView {
  readonly needsHuman: readonly NeedsHumanRow[];
  readonly projects: readonly ProjectRow[];
}

export function buildBoardView(data: ProjectBoardData): BoardView {
  const needsHuman = data.projects.flatMap((project) =>
    project.tickets
      .filter((ticket) => ticket.needsHuman)
      .map((ticket) => ({ ...ticket, projectKey: project.key, projectName: project.name })),
  );
  return { needsHuman, projects: data.projects };
}
