import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextAssembler, MAX_DIFF_CHARS } from './context-assembler.js';
import type { ArtifactStore } from '../../domain/ports/driven/artifact-store.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';
import type { GitGateway } from '../../domain/ports/driven/git-gateway.port.js';
import { Column } from '../../domain/model/column.js';

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
    scaffoldDefaults: vi.fn().mockReturnValue([]),
    findRoot: vi.fn().mockReturnValue(null),
    readExecutorConfig: vi.fn().mockReturnValue(null),
    readConstraints: vi.fn().mockReturnValue(null),
    writeConstraintsPlaceholder: vi.fn(),
  };
}

function createMockGitGateway(): GitGateway {
  return {
    init: vi.fn(),
    commit: vi.fn(),
    commitFiles: vi.fn(),
    stageAll: vi.fn(),
    commitAll: vi.fn().mockReturnValue(false),
    diff: vi.fn().mockReturnValue(''),
  };
}

describe('ContextAssembler', () => {
  let artifactStore: ReturnType<typeof createMockArtifactStore>;
  let projectRepo: ReturnType<typeof createMockProjectRepo>;
  let gitGateway: ReturnType<typeof createMockGitGateway>;
  let assembler: ContextAssembler;

  const TICKET_ID = 'AEOS-1';
  const PROJECT_ROOT = '/projects/test';
  const NON_REVIEW_COLUMN = Column.IMPLEMENTATION;

  beforeEach(() => {
    artifactStore = createMockArtifactStore();
    projectRepo = createMockProjectRepo();
    gitGateway = createMockGitGateway();
    assembler = new ContextAssembler(artifactStore, projectRepo, gitGateway);
  });

  it('reads ticket content via readArtifact', async () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue('# Ticket content');
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue(['AEOS-1-ticket.md']);

    const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT, NON_REVIEW_COLUMN);

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
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue([
      'AEOS-1-prd.md',
      'AEOS-1-tech-spec.md',
      'AEOS-1-ticket.md',
    ]);

    const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT, NON_REVIEW_COLUMN);

    expect(result.priorArtifacts).toHaveLength(2);
    expect(result.priorArtifacts[0]).toEqual({ name: 'AEOS-1-prd.md', content: '# PRD content' });
    expect(result.priorArtifacts[1]).toEqual({
      name: 'AEOS-1-tech-spec.md',
      content: '# Tech Spec content',
    });
    expect(result.settledDecisions).toBeNull();
  });

  it('reads settled decisions when decisions artifact exists', async () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockImplementation(
      (_proj: string, _ticket: string, filename: string) => {
        if (filename === 'AEOS-1-ticket.md') return '# Ticket';
        if (filename === 'AEOS-1-decisions.md') return '# AEOS Decisions\n...';
        return '';
      },
    );
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue([
      'AEOS-1-decisions.md',
      'AEOS-1-ticket.md',
    ]);

    const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT, NON_REVIEW_COLUMN);

    expect(result.settledDecisions).toBe('# AEOS Decisions\n...');
  });

  it('excludes decisions and questions from priorArtifacts once decisions exist', async () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockImplementation(
      (_proj: string, _ticket: string, filename: string) => {
        if (filename === 'AEOS-1-ticket.md') return '# Ticket';
        if (filename === 'AEOS-1-decisions.md') return '# AEOS Decisions';
        if (filename === 'AEOS-1-prd.md') return '# PRD';
        if (filename === 'AEOS-1-questions.md') return '# Questions';
        return '';
      },
    );
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue([
      'AEOS-1-decisions.md',
      'AEOS-1-prd.md',
      'AEOS-1-questions.md',
      'AEOS-1-ticket.md',
    ]);

    const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT, NON_REVIEW_COLUMN);

    expect(result.priorArtifacts).toEqual([{ name: 'AEOS-1-prd.md', content: '# PRD' }]);
  });

  it('filters out the ticket file from priorArtifacts', async () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue('content');
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue([
      'AEOS-1-prd.md',
      'AEOS-1-ticket.md',
    ]);

    const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT, NON_REVIEW_COLUMN);

    const names = result.priorArtifacts.map((a) => a.name);
    expect(names).not.toContain('AEOS-1-ticket.md');
    expect(names).toContain('AEOS-1-prd.md');
  });

  it('returns empty priorArtifacts when no artifacts exist besides ticket', async () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue('# Ticket');
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue(['AEOS-1-ticket.md']);

    const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT, NON_REVIEW_COLUMN);

    expect(result.priorArtifacts).toEqual([]);
  });

  it('returns constraints as null when CONSTRAINTS.md is not present', async () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue('# Ticket');
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue(['AEOS-1-ticket.md']);
    (projectRepo.readConstraints as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT, NON_REVIEW_COLUMN);

    expect(result.constraints).toBeNull();
  });

  it('returns constraints content when CONSTRAINTS.md is present', async () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue('# Ticket');
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue(['AEOS-1-ticket.md']);
    (projectRepo.readConstraints as ReturnType<typeof vi.fn>).mockReturnValue(
      '# Project Constraints\n- Use TypeScript',
    );

    const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT, NON_REVIEW_COLUMN);

    expect(result.constraints).toBe('# Project Constraints\n- Use TypeScript');
    expect(projectRepo.readConstraints).toHaveBeenCalledWith(PROJECT_ROOT);
  });

  it('returns empty priorArtifacts when listArtifacts returns empty array', async () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue('# Ticket');
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue([]);

    const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT, NON_REVIEW_COLUMN);

    expect(result.priorArtifacts).toEqual([]);
  });

  // --- Diff injection tests ---

  it('returns codeDiff as null for non-CODE_REVIEW columns', async () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue('# Ticket');
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue(['AEOS-1-ticket.md']);

    const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT, Column.IMPLEMENTATION);

    expect(result.codeDiff).toBeNull();
    expect(gitGateway.diff).not.toHaveBeenCalled();
  });

  it('injects git diff when column is CODE_REVIEW', async () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue('# Ticket');
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue(['AEOS-1-ticket.md']);
    (gitGateway.diff as ReturnType<typeof vi.fn>).mockReturnValue(
      'diff --git a/foo.ts b/foo.ts\n+hello',
    );

    const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT, Column.CODE_REVIEW);

    expect(gitGateway.diff).toHaveBeenCalledWith(PROJECT_ROOT);
    expect(result.codeDiff).toBe('diff --git a/foo.ts b/foo.ts\n+hello');
  });

  it('returns "No changes detected" when diff is empty in CODE_REVIEW', async () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue('# Ticket');
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue(['AEOS-1-ticket.md']);
    (gitGateway.diff as ReturnType<typeof vi.fn>).mockReturnValue('');

    const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT, Column.CODE_REVIEW);

    expect(result.codeDiff).toBe('No changes detected');
  });

  it('returns "No changes detected" when diff is whitespace-only in CODE_REVIEW', async () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue('# Ticket');
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue(['AEOS-1-ticket.md']);
    (gitGateway.diff as ReturnType<typeof vi.fn>).mockReturnValue('  \n  \n');

    const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT, Column.CODE_REVIEW);

    expect(result.codeDiff).toBe('No changes detected');
  });

  it('truncates large diffs at MAX_DIFF_CHARS with warning', async () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue('# Ticket');
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue(['AEOS-1-ticket.md']);
    const largeDiff = 'x'.repeat(MAX_DIFF_CHARS + 5000);
    (gitGateway.diff as ReturnType<typeof vi.fn>).mockReturnValue(largeDiff);

    const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT, Column.CODE_REVIEW);

    expect(result.codeDiff).toContain('[DIFF TRUNCATED');
    expect(result.codeDiff).toContain(`of ${largeDiff.length} total`);
    // The content before truncation marker should be MAX_DIFF_CHARS long
    const truncatedContent = result.codeDiff!.split('\n\n[DIFF TRUNCATED')[0];
    expect(truncatedContent).toHaveLength(MAX_DIFF_CHARS);
  });
});
