// Criteria traced here: @AC-4 (board of every project) @AC-6 (needs-you area) @AC-35 (needsHuman from state).
import { describe, expect, it } from 'vitest';

import { buildBoardView } from './board-data.js';
import type { ProjectBoardData } from '../../cli/generated/types.gen.js';

function ticket(
  overrides: Partial<ProjectBoardData['projects'][number]['tickets'][number]> = {},
): ProjectBoardData['projects'][number]['tickets'][number] {
  return {
    id: 'WEB-1',
    title: 'A ticket',
    kind: 'TASK',
    parentId: null,
    column: 'IMPLEMENTATION',
    columnLabel: 'Implementation',
    subState: null,
    needsHuman: false,
    ...overrides,
  };
}

describe('buildBoardView', () => {
  it('gathers needsHuman tickets from every project, tagged with their project', () => {
    const data: ProjectBoardData = {
      projects: [
        {
          key: 'A',
          name: 'Project A',
          path: '/a',
          available: true,
          tickets: [ticket({ id: 'A-1', needsHuman: true }), ticket({ id: 'A-2' })],
        },
        {
          key: 'B',
          name: 'Project B',
          path: '/b',
          available: true,
          tickets: [ticket({ id: 'B-1', needsHuman: true })],
        },
      ],
    };

    const view = buildBoardView(data);

    expect(view.needsHuman.map((t) => t.id)).toEqual(['A-1', 'B-1']);
    expect(view.needsHuman[0]).toMatchObject({ projectKey: 'A', projectName: 'Project A' });
    expect(view.needsHuman[1]).toMatchObject({ projectKey: 'B', projectName: 'Project B' });
  });

  it('returns an empty needsHuman list when nothing is awaiting a human', () => {
    const data: ProjectBoardData = {
      projects: [{ key: 'A', name: 'Project A', path: '/a', available: true, tickets: [ticket()] }],
    };

    expect(buildBoardView(data).needsHuman).toEqual([]);
  });

  it('keeps an unavailable project and its tickets in the board (AC-5)', () => {
    const data: ProjectBoardData = {
      projects: [
        {
          key: 'A',
          name: 'Project A',
          path: '/gone',
          available: false,
          tickets: [ticket({ id: 'A-1' })],
        },
      ],
    };

    const view = buildBoardView(data);

    expect(view.projects).toHaveLength(1);
    expect(view.projects[0]).toMatchObject({ available: false });
    expect(view.projects[0]?.tickets).toHaveLength(1);
  });
});
