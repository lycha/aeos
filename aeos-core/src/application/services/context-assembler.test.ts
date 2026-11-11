import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextAssembler, MAX_DIFF_CHARS } from './context-assembler.js';
import type { ArtifactStore } from '../../domain/ports/driven/artifact-store.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';
import type { GitGateway } from '../../domain/ports/driven/git-gateway.port.js';

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
    isRepo: vi.fn().mockReturnValue(true),
    ensureOnBranch: vi.fn(),
    tagHere: vi.fn(),
    diffRange: vi.fn().mockReturnValue(''),
    refExists: vi.fn().mockReturnValue(false),
    changedFiles: vi.fn().mockReturnValue([]),
    restoreFiles: vi.fn(),
    push: vi.fn(),
    currentBranch: vi.fn().mockReturnValue('aeos/AEOS-1'),
    defaultBranch: vi.fn().mockReturnValue('main'),
    hasRemote: vi.fn().mockReturnValue(true),
    headCommit: vi.fn().mockReturnValue('c0ffee1'),
    commitOf: vi.fn().mockReturnValue(null),
    showFile: vi.fn().mockReturnValue(''),
    pathChangedSince: vi.fn().mockReturnValue(false),
    userIdentity: vi.fn().mockReturnValue('Test <test@test.com>'),
    listFiles: vi.fn().mockReturnValue([]),
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
  const NON_REVIEW_COLUMN = 'none';

  beforeEach(() => {
    artifactStore = createMockArtifactStore();
    projectRepo = createMockProjectRepo();
    gitGateway = createMockGitGateway();
    assembler = new ContextAssembler(artifactStore, projectRepo, gitGateway, {
      root: () => '/projects/test/.aeos',
      featureDir: () => '',
      exists: () => true,
      listFeatures: () => [],
    });
  });

  describe('pinned spec', () => {
    const pin = { repo: 'AEOS-aeos', commit: 'c0ffee1', path: 'features/checkout' };
    const TREE = '/projects/test/.aeos';
    /** The tree as it is at the pinned commit. */
    const atPin = (files: Record<string, string>): void => {
      (gitGateway.showFile as ReturnType<typeof vi.fn>).mockImplementation(
        (_dir: string, _commit: string, file: string) => {
          if (!(file in files)) throw new Error(`fatal: path '${file}' does not exist`);
          return files[file];
        },
      );
      (gitGateway.listFiles as ReturnType<typeof vi.fn>).mockImplementation(
        (_dir: string, _commit: string, dir: string) =>
          Object.keys(files).filter((file) => file.startsWith(`${dir}/`)),
      );
    };
    const tree = {
      'features/checkout/spec.md': '---\nfeature: checkout\ncontext: payments\n---\n# Checkout',
      'features/checkout/decisions.yaml': 'schema_version: 1\nmeta:\n  feature: checkout\n',
      'features/checkout/feature-inventory.yaml': 'not for agents',
      'features/checkout/features/pay.feature': 'Feature: Pay',
      'features/checkout/features/refund.feature': 'Feature: Refund',
      'features/checkout/features/notes.md': 'not a scenario',
      'contexts/payments/glossary.md': '# Glossary',
      'contexts/payments/CONSTRAINTS.md': 'Money is integer minor units.',
    };

    beforeEach(() => {
      (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue('# Ticket');
      (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue([
        'AEOS-1-ticket.md',
      ]);
    });

    it('gives a task that claims criteria only the scenarios tagged with them', async () => {
      atPin({
        ...tree,
        'features/checkout/features/pay.feature':
          'Feature: Pay\n\n  @AC-1\n  Scenario: By card\n    Given a card\n\n  @AC-2\n  Scenario: By voucher\n    Given a voucher\n',
        'features/checkout/features/refund.feature':
          'Feature: Refund\n\n  @AC-3\n  Scenario: Full refund\n    Given a payment\n',
      });
      (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue(
        '# Ticket\n- Parent: AEOS-9\n- Implements: AC-1\n',
      );

      const context = await assembler.assemble('AEOS-1', '/projects/test', 'none', pin);

      const features = context.spec.filter((file) => file.name.endsWith('.feature'));
      expect(features.map((file) => file.name)).toEqual(['features/pay.feature']);
      expect(features[0]!.content).toContain('Feature: Pay');
      expect(features[0]!.content).toContain('Scenario: By card');
      expect(features[0]!.content).not.toContain('By voucher');
    });

    it('reads spec.md, decisions.yaml, every .feature and the glossary at the pinned commit', async () => {
      atPin(tree);

      const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT, NON_REVIEW_COLUMN, pin);

      expect(result.specPin).toEqual(pin);
      expect(result.spec).toEqual([
        { name: 'spec.md', content: tree['features/checkout/spec.md'] },
        { name: 'decisions.yaml', content: tree['features/checkout/decisions.yaml'] },
        { name: 'features/pay.feature', content: 'Feature: Pay' },
        { name: 'features/refund.feature', content: 'Feature: Refund' },
        { name: 'contexts/payments/glossary.md', content: '# Glossary' },
      ]);
      for (const call of (gitGateway.showFile as ReturnType<typeof vi.fn>).mock.calls) {
        expect(call.slice(0, 2)).toEqual([TREE, 'c0ffee1']);
      }
    });

    it('puts the project constraints first, then those of the context', async () => {
      atPin(tree);
      (projectRepo.readConstraints as ReturnType<typeof vi.fn>).mockReturnValue('Use strict mode.');

      const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT, NON_REVIEW_COLUMN, pin);

      expect(result.constraints).toBe('Use strict mode.\n\nMoney is integer minor units.');
    });

    it('uses the context constraints alone when the project has none', async () => {
      atPin(tree);
      (projectRepo.readConstraints as ReturnType<typeof vi.fn>).mockReturnValue(null);

      const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT, NON_REVIEW_COLUMN, pin);

      expect(result.constraints).toBe('Money is integer minor units.');
    });

    it('takes the context from decisions.yaml meta when the spec has no front matter', async () => {
      atPin({
        ...tree,
        'features/checkout/spec.md': '# Checkout',
        'features/checkout/decisions.yaml':
          'schema_version: 1\nmeta:\n  feature: checkout\n  context: "payments"\nsummary: {}\n',
      });

      const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT, NON_REVIEW_COLUMN, pin);

      expect(result.spec.map((file) => file.name)).toContain('contexts/payments/glossary.md');
    });

    it('adds no context files when none is named, or the named one has none', async () => {
      atPin(
        Object.fromEntries(Object.entries(tree).filter(([file]) => !file.startsWith('contexts/'))),
      );
      (projectRepo.readConstraints as ReturnType<typeof vi.fn>).mockReturnValue('Use strict mode.');

      const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT, NON_REVIEW_COLUMN, pin);

      expect(result.spec.map((file) => file.name)).toEqual([
        'spec.md',
        'decisions.yaml',
        'features/pay.feature',
        'features/refund.feature',
      ]);
      expect(result.constraints).toBe('Use strict mode.');
    });

    it('fails, naming the commit, when the pinned commit cannot be read', async () => {
      (gitGateway.showFile as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('fatal: invalid object name');
      });

      await expect(
        assembler.assemble(TICKET_ID, PROJECT_ROOT, NON_REVIEW_COLUMN, pin),
      ).rejects.toThrow(/AEOS-aeos@c0ffee1.*never read from the working tree/s);
    });

    it('reads nothing from git and changes nothing for a ticket with no pin', async () => {
      (projectRepo.readConstraints as ReturnType<typeof vi.fn>).mockReturnValue('Use strict mode.');

      const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT, NON_REVIEW_COLUMN);

      expect(result).toMatchObject({ spec: [], specPin: null, constraints: 'Use strict mode.' });
      expect(gitGateway.showFile).not.toHaveBeenCalled();
      expect(gitGateway.listFiles).not.toHaveBeenCalled();
    });
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

  it('keeps gate records out of priorArtifacts: they are a log, not an input', async () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue('content');
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue([
      'AEOS-1-gates.yaml',
      'AEOS-1-tech-spec.md',
      'AEOS-1-ticket.md',
    ]);

    const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT, NON_REVIEW_COLUMN);

    expect(result.priorArtifacts.map((a) => a.name)).toEqual(['AEOS-1-tech-spec.md']);
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

    const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT, 'none');

    expect(result.codeDiff).toBeNull();
    expect(gitGateway.diff).not.toHaveBeenCalled();
  });

  it('injects git diff when column is CODE_REVIEW', async () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue('# Ticket');
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue(['AEOS-1-ticket.md']);
    (gitGateway.diff as ReturnType<typeof vi.fn>).mockReturnValue(
      'diff --git a/foo.ts b/foo.ts\n+hello',
    );

    const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT, 'task');

    expect(gitGateway.diff).toHaveBeenCalledWith(PROJECT_ROOT);
    expect(result.codeDiff).toBe('diff --git a/foo.ts b/foo.ts\n+hello');
  });

  it('returns "No changes detected" when diff is empty in CODE_REVIEW', async () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue('# Ticket');
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue(['AEOS-1-ticket.md']);
    (gitGateway.diff as ReturnType<typeof vi.fn>).mockReturnValue('');

    const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT, 'task');

    expect(result.codeDiff).toBe('No changes detected');
  });

  it('returns "No changes detected" when diff is whitespace-only in CODE_REVIEW', async () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue('# Ticket');
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue(['AEOS-1-ticket.md']);
    (gitGateway.diff as ReturnType<typeof vi.fn>).mockReturnValue('  \n  \n');

    const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT, 'task');

    expect(result.codeDiff).toBe('No changes detected');
  });

  it('truncates large diffs at MAX_DIFF_CHARS with warning', async () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue('# Ticket');
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue(['AEOS-1-ticket.md']);
    const largeDiff = 'x'.repeat(MAX_DIFF_CHARS + 5000);
    (gitGateway.diff as ReturnType<typeof vi.fn>).mockReturnValue(largeDiff);

    const result = await assembler.assemble(TICKET_ID, PROJECT_ROOT, 'task');

    expect(result.codeDiff).toContain('[DIFF TRUNCATED');
    expect(result.codeDiff).toContain(`of ${largeDiff.length} total`);
    // The content before truncation marker should be MAX_DIFF_CHARS long
    const truncatedContent = result.codeDiff!.split('\n\n[DIFF TRUNCATED')[0];
    expect(truncatedContent).toHaveLength(MAX_DIFF_CHARS);
  });
});

describe('ContextAssembler — epic context (WI-3)', () => {
  let artifactStore: ReturnType<typeof createMockArtifactStore>;
  let projectRepo: ReturnType<typeof createMockProjectRepo>;
  let gitGateway: ReturnType<typeof createMockGitGateway>;
  let assembler: ContextAssembler;

  const PROJECT_ROOT = '/projects/test';

  // A child-task ticket document carries "- Parent: <id>" in its metadata block.
  const TASK_DOC = [
    '# Ticket: AEOS-2',
    '<!-- AEOS:METADATA START -->',
    '## AEOS Metadata',
    '- Kind: TASK',
    '- Parent: AEOS-1',
    '<!-- AEOS:METADATA END -->',
    '## Title',
    'Do a task',
  ].join('\n');

  beforeEach(() => {
    artifactStore = createMockArtifactStore();
    projectRepo = createMockProjectRepo();
    gitGateway = createMockGitGateway();
    assembler = new ContextAssembler(artifactStore, projectRepo, gitGateway, {
      root: () => '/projects/test/.aeos',
      featureDir: () => '',
      exists: () => true,
      listFeatures: () => [],
    });
  });

  it("injects the parent epic's tech spec, and nothing else of the epic's", async () => {
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockImplementation(
      (_root: string, ticketId: string) =>
        ticketId === 'AEOS-2'
          ? ['AEOS-2-ticket.md']
          : ['AEOS-1-tech-spec.md', 'AEOS-1-prd.md', 'AEOS-1-tasks.md'],
    );
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockImplementation(
      (_root: string, _id: string, filename: string) =>
        filename === 'AEOS-2-ticket.md'
          ? TASK_DOC
          : filename === 'AEOS-1-prd.md'
            ? '# PRD body'
            : filename === 'AEOS-1-tech-spec.md'
              ? '# Tech spec body'
              : 'other',
    );

    const result = await assembler.assemble('AEOS-2', PROJECT_ROOT, 'none');

    // The human-written spec arrives through the pin (`spec`), not from the epic's artifacts.
    expect(result.epicContext).toEqual([
      { name: 'AEOS-1-tech-spec.md', content: '# Tech spec body' },
    ]);
  });

  it('returns no epic context for an epic (no parent in metadata)', async () => {
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue(['AEOS-1-ticket.md']);
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue(
      '# Ticket: AEOS-1\n## AEOS Metadata\n- Kind: EPIC\n',
    );

    const result = await assembler.assemble('AEOS-1', PROJECT_ROOT, 'none');

    expect(result.epicContext).toEqual([]);
  });
});

describe('ContextAssembler — integration-review diff (WI-2)', () => {
  let artifactStore: ReturnType<typeof createMockArtifactStore>;
  let projectRepo: ReturnType<typeof createMockProjectRepo>;
  let gitGateway: ReturnType<typeof createMockGitGateway>;
  let assembler: ContextAssembler;

  beforeEach(() => {
    artifactStore = createMockArtifactStore();
    projectRepo = createMockProjectRepo();
    gitGateway = createMockGitGateway();
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue(['AEOS-1-ticket.md']);
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue('# Epic');
    assembler = new ContextAssembler(artifactStore, projectRepo, gitGateway, {
      root: () => '/projects/test/.aeos',
      featureDir: () => '',
      exists: () => true,
      listFeatures: () => [],
    });
  });

  it('diffs the epic base tag..HEAD when the base tag exists', async () => {
    (gitGateway.refExists as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (gitGateway.diffRange as ReturnType<typeof vi.fn>).mockReturnValue('diff --git a/x b/x');

    const result = await assembler.assemble('AEOS-1', '/root', 'epic');

    expect(gitGateway.refExists).toHaveBeenCalledWith('/root', 'aeos-base/AEOS-1');
    expect(gitGateway.diffRange).toHaveBeenCalledWith('/root', 'aeos-base/AEOS-1', 'HEAD');
    expect(result.codeDiff).toContain('diff --git');
  });

  it('falls back to the working-tree diff when the base tag is missing', async () => {
    (gitGateway.refExists as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (gitGateway.diff as ReturnType<typeof vi.fn>).mockReturnValue('');

    const result = await assembler.assemble('AEOS-1', '/root', 'epic');

    expect(gitGateway.diffRange).not.toHaveBeenCalled();
    expect(result.codeDiff).toBe('No changes detected');
  });

  it('gives any column that asks for the epic diff the base..HEAD range', async () => {
    (gitGateway.refExists as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (gitGateway.diffRange as ReturnType<typeof vi.fn>).mockReturnValue('diff --git a/x b/x');

    const result = await assembler.assemble('AEOS-1', '/root', 'epic');

    expect(gitGateway.diffRange).toHaveBeenCalledWith('/root', 'aeos-base/AEOS-1', 'HEAD');
    expect(result.codeDiff).toContain('diff --git');
  });

  it("keeps the engine's own record of a reproduction out of the context: repro.md says the same", async () => {
    (artifactStore.listArtifacts as ReturnType<typeof vi.fn>).mockReturnValue([
      'AEOS-1-ticket.md',
      'AEOS-1-repro.json',
      'AEOS-1-repro.md',
    ]);

    const result = await assembler.assemble('AEOS-1', '/root', 'task');

    expect(result.priorArtifacts.map((artifact) => artifact.name)).toEqual(['AEOS-1-repro.md']);
  });
});
