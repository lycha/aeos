// Criteria traced here: @AC-4 (one entry per project) @AC-35 (needsHuman judged from state, not records).
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectBoardUseCase } from './project-board.use-case.js';
import type {
  ConfigStore,
  ProjectRegistryEntry,
} from '../domain/ports/driven/config-store.port.js';
import type { TicketRepository } from '../domain/ports/driven/ticket-repository.port.js';
import type { Ticket } from '../domain/model/ticket.js';

function entry(overrides: Partial<ProjectRegistryEntry> = {}): ProjectRegistryEntry {
  return {
    uuid: 'uuid-1',
    id: 'proj-1',
    name: 'Project One',
    key: 'P1',
    path: '/tmp/does-not-matter',
    aeos_path: '/tmp/does-not-matter/.aeos',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'AEOS-1',
    projectId: 'proj-1',
    title: 'Test ticket',
    kind: 'TASK',
    parentId: null,
    column: 'IMPLEMENTATION',
    subState: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function createMockTicketRepo(byProject: Record<string, Ticket[]> = {}): TicketRepository {
  return {
    nextId: vi.fn(),
    save: vi.fn(),
    createAtomic: vi.fn(),
    deleteById: vi.fn(),
    findById: vi.fn().mockReturnValue(null),
    findByProject: vi.fn((projectId: string) => byProject[projectId] ?? []),
    findChildren: vi.fn().mockReturnValue([]),
    updateColumn: vi.fn(),
    updateSubState: vi.fn(),
    setEscalation: vi.fn(),
    setPrUrl: vi.fn(),
    setSpecCommit: vi.fn(),
    setContractChange: vi.fn(),
  };
}

describe('ProjectBoardUseCase', () => {
  const projectDir = path.join(os.tmpdir(), 'aeos-project-board-test');

  beforeEach(() => {
    fs.mkdirSync(path.join(projectDir, '.aeos'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, '.aeos', 'project.json'), '{}');
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('returns one entry per registered project', () => {
    const configStore = {
      readRegistry: () => [
        entry({ id: 'proj-1', key: 'P1', path: projectDir }),
        entry({ id: 'proj-2', key: 'P2', path: projectDir }),
      ],
    } as unknown as ConfigStore;
    const useCase = new ProjectBoardUseCase(createMockTicketRepo(), configStore);

    const result = useCase.execute();

    expect(result.ok).toBe(true);
    expect(result.projects.map((p) => p.key)).toEqual(['P1', 'P2']);
  });

  it('marks a project unavailable when its directory is gone', () => {
    const configStore = {
      readRegistry: () => [entry({ path: path.join(projectDir, 'nope') })],
    } as unknown as ConfigStore;
    const useCase = new ProjectBoardUseCase(createMockTicketRepo(), configStore);

    const result = useCase.execute();

    expect(result.projects[0].available).toBe(false);
  });

  it('marks a project unavailable when .aeos/project.json is gone', () => {
    fs.rmSync(path.join(projectDir, '.aeos', 'project.json'));
    const configStore = {
      readRegistry: () => [entry({ path: projectDir })],
    } as unknown as ConfigStore;
    const useCase = new ProjectBoardUseCase(createMockTicketRepo(), configStore);

    const result = useCase.execute();

    expect(result.projects[0].available).toBe(false);
  });

  it('marks a project available when its directory and project.json exist', () => {
    const configStore = {
      readRegistry: () => [entry({ path: projectDir })],
    } as unknown as ConfigStore;
    const useCase = new ProjectBoardUseCase(createMockTicketRepo(), configStore);

    const result = useCase.execute();

    expect(result.projects[0].available).toBe(true);
  });

  it.each([['BLOCKED'], ['ESCALATED'], ['SIGNED_OFF']])(
    'flags needsHuman for sub-state %s',
    (subState) => {
      const configStore = {
        readRegistry: () => [entry({ id: 'proj-1', path: projectDir })],
      } as unknown as ConfigStore;
      const ticketRepo = createMockTicketRepo({
        'proj-1': [makeTicket({ subState: subState as Ticket['subState'] })],
      });
      const useCase = new ProjectBoardUseCase(ticketRepo, configStore);

      const result = useCase.execute();

      expect(result.projects[0].tickets[0].needsHuman).toBe(true);
    },
  );

  it.each([['READY'], ['WORKING'], ['IN_REVIEW'], ['FAILED'], ['INTERRUPTED'], [null]])(
    'does not flag needsHuman for sub-state %s with no contract change',
    (subState) => {
      const configStore = {
        readRegistry: () => [entry({ id: 'proj-1', path: projectDir })],
      } as unknown as ConfigStore;
      const ticketRepo = createMockTicketRepo({
        'proj-1': [makeTicket({ subState: subState as Ticket['subState'] })],
      });
      const useCase = new ProjectBoardUseCase(ticketRepo, configStore);

      const result = useCase.execute();

      expect(result.projects[0].tickets[0].needsHuman).toBe(false);
    },
  );

  it('flags needsHuman for an unapproved contract change, regardless of sub-state', () => {
    const configStore = {
      readRegistry: () => [entry({ id: 'proj-1', path: projectDir })],
    } as unknown as ConfigStore;
    const ticketRepo = createMockTicketRepo({
      'proj-1': [
        makeTicket({
          subState: 'WORKING',
          contractChange: { paths: ['src/foo.ts'], approvedBy: null },
        }),
      ],
    });
    const useCase = new ProjectBoardUseCase(ticketRepo, configStore);

    const result = useCase.execute();

    expect(result.projects[0].tickets[0].needsHuman).toBe(true);
  });

  it('does not flag needsHuman once a contract change is approved', () => {
    const configStore = {
      readRegistry: () => [entry({ id: 'proj-1', path: projectDir })],
    } as unknown as ConfigStore;
    const ticketRepo = createMockTicketRepo({
      'proj-1': [
        makeTicket({
          subState: 'WORKING',
          contractChange: { paths: ['src/foo.ts'], approvedBy: 'GATE-1' },
        }),
      ],
    });
    const useCase = new ProjectBoardUseCase(ticketRepo, configStore);

    const result = useCase.execute();

    expect(result.projects[0].tickets[0].needsHuman).toBe(false);
  });

  it('looks up tickets by the registry entry id, not key', () => {
    const configStore = {
      readRegistry: () => [entry({ id: 'proj-1', key: 'P1', path: projectDir })],
    } as unknown as ConfigStore;
    const ticketRepo = createMockTicketRepo();
    const useCase = new ProjectBoardUseCase(ticketRepo, configStore);

    useCase.execute();

    expect(ticketRepo.findByProject).toHaveBeenCalledWith('proj-1');
  });
});
