import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextAssembler } from './context-assembler.js';
import type { ArtifactStore } from '../../domain/ports/driven/artifact-store.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';

function createMockArtifactStore(): ArtifactStore {
  return {
    artifactExists: vi.fn().mockReturnValue(false),
    readArtifact: vi.fn().mockReturnValue(''),
    getArtifactMtime: vi.fn().mockReturnValue(null),
    writeArtifact: vi.fn(),
    removeArtifact: vi.fn(),
    listArtifacts: vi.fn().mockReturnValue([]),
  };
}

function createMockProjectRepo(): ProjectRepository {
  return {
    exists: vi.fn().mockReturnValue(false),
    read: vi.fn(),
    writeProject: vi.fn(),
    ensureColumnSpecsDir: vi.fn(),
    findRoot: vi.fn().mockReturnValue(null),
    readConstraints: vi.fn().mockReturnValue(null),
    writeConstraintsPlaceholder: vi.fn(),
  };
}

describe('ContextAssembler', () => {
  let artifactStore: ReturnType<typeof createMockArtifactStore>;
  let projectRepo: ReturnType<typeof createMockProjectRepo>;
  let assembler: ContextAssembler;

  const TICKET_ID = 'AEOS-1';
  const PROJECT_ROOT = '/projects/test';

  beforeEach(() => {
    artifactStore = createMockArtifactStore();
    projectRepo = createMockProjectRepo();
    assembler = new ContextAssembler(artifactStore, projectRepo);
  });

  it('reads ticket content via readArtifact', async () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue('# Ticket content');
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue(['AEOS-1-ticket.md']);

    const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT);

    expect(artifactStore.readArtifact).toHaveBeenCalledWith(
      PROJECT_ROOT,
      TICKET_ID,
      'AEOS-1-ticket.md',
    );
    expect(result.ticketContent).toBe('# Ticket content');
  });

  it('returns 2 prior artifacts in lexicographic order', async () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockImplementation(
      (_proj: string, _ticket: string, filename: string) => {
        if (filename === 'AEOS-1-ticket.md') return '# Ticket';
        if (filename === 'AEOS-1-prd.md') return '# PRD content';
        if (filename === 'AEOS-1-tech-spec.md') return '# Tech Spec content';
        return '';
      },
    );
    // listArtifacts returns sorted filenames (port contract)
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue([
      'AEOS-1-prd.md',
      'AEOS-1-tech-spec.md',
      'AEOS-1-ticket.md',
    ]);

    const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT);

    expect(result.priorArtifacts).toHaveLength(2);
    expect(result.priorArtifacts[0]).toEqual({ name: 'AEOS-1-prd.md', content: '# PRD content' });
    expect(result.priorArtifacts[1]).toEqual({
      name: 'AEOS-1-tech-spec.md',
      content: '# Tech Spec content',
    });
  });

  it('filters out the ticket file from priorArtifacts', async () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue('content');
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue([
      'AEOS-1-prd.md',
      'AEOS-1-ticket.md',
    ]);

    const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT);

    const names = result.priorArtifacts.map((a) => a.name);
    expect(names).not.toContain('AEOS-1-ticket.md');
    expect(names).toContain('AEOS-1-prd.md');
  });

  it('returns empty priorArtifacts when no artifacts exist besides ticket', async () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue('# Ticket');
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue(['AEOS-1-ticket.md']);

    const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT);

    expect(result.priorArtifacts).toEqual([]);
  });

  it('returns constraints as null when CONSTRAINTS.md is not present', async () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue('# Ticket');
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue(['AEOS-1-ticket.md']);
    (projectRepo.readConstraints as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT);

    expect(result.constraints).toBeNull();
  });

  it('returns constraints content when CONSTRAINTS.md is present', async () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue('# Ticket');
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue(['AEOS-1-ticket.md']);
    (projectRepo.readConstraints as ReturnType<typeof vi.fn>).mockReturnValue(
      '# Project Constraints\n- Use TypeScript',
    );

    const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT);

    expect(result.constraints).toBe('# Project Constraints\n- Use TypeScript');
    expect(projectRepo.readConstraints).toHaveBeenCalledWith(PROJECT_ROOT);
  });

  it('returns empty priorArtifacts when listArtifacts returns empty array', async () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue('# Ticket');
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue([]);

    const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT);

    expect(result.priorArtifacts).toEqual([]);
  });
});
