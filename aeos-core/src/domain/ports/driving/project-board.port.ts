// Driving port — ProjectBoard use case interface (cross-project board, AC-4/AC-5/AC-6)

import type { Ticket } from '../../model/ticket.js';

export interface ProjectBoardEntry {
  key: string;
  name: string;
  path: string;
  /** False when the project directory or its .aeos/project.json is gone (AC-5). */
  available: boolean;
  tickets: (Ticket & { needsHuman: boolean })[];
}

export interface ProjectBoardResult {
  ok: true;
  projects: ProjectBoardEntry[];
}

export interface ProjectBoardPort {
  execute(): ProjectBoardResult;
}
