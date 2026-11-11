import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { readTemplates } from './template-source.js';
import { FsProjectRepository } from './fs-project.repository.js';
import { YamlColumnSpecLoader } from '../spec-loader/yaml-column-spec-loader.adapter.js';
import { YamlAgentSpecLoader } from '../spec-loader/yaml-agent-spec-loader.adapter.js';
import yaml from 'js-yaml';
import { Column, displayOrder } from '../../domain/model/column.js';
import { YamlPipelineLoader } from '../spec-loader/yaml-pipeline-loader.adapter.js';
import { COLUMN_ROLES } from '../../domain/model/column-spec.js';
import { ProjectSyncUseCase } from '../../application/project-sync.use-case.js';
import { FsTemplateCatalog } from './fs-template-catalog.js';

/** Columns with no agent pipeline, and therefore no column spec. */
const SPECLESS: readonly Column[] = [Column.BACKLOG, Column.DONE];

describe('readTemplates', () => {
  it('finds the shipped templates', () => {
    const templates = readTemplates();
    expect(templates.length).toBeGreaterThan(0);
  });

  it('ships templates under the expected top-level directories', () => {
    const dirs = new Set(readTemplates().map((t) => t.relativePath.split(path.sep)[0]));

    expect(dirs).toEqual(
      new Set(['column-specs', 'agents', 'rubrics', 'schemas', 'pipelines.yaml']),
    );
  });

  it('ships the approved pipelines file, whose role vocabulary is what the code has', () => {
    const pipelines = readTemplates().find((t) => t.relativePath === 'pipelines.yaml')!.content;

    expect(pipelines.split('\n')[0]).toBe(
      '# Approved by Kris, 10 Nov 2026 (signed off as drafted).',
    );
    // The roles a column spec may declare are the ones the file names, and no other.
    expect([...new Set([...pipelines.matchAll(/^#\s+role: (\S+)/gm)].map((m) => m[1]))]).toEqual([
      ...COLUMN_ROLES,
    ]);
  });

  it('declares the role and the diff of every column, as the engine used to infer them from names', () => {
    const declared = Object.fromEntries(
      readTemplates()
        .filter((t) => t.relativePath.startsWith('column-specs'))
        .map((t) => yaml.load(t.content) as { column: string; role?: string; diffContext?: string })
        .map((spec) => [spec.column, `${spec.role} ${spec.diffContext}`]),
    );

    expect(declared).toEqual({
      SPEC_REVIEW: 'spec-review none',
      TECH_SPEC: 'standard none',
      TASK_BREAKDOWN: 'decomposition none',
      IMPLEMENTATION: 'standard none',
      CODE_REVIEW: 'standard task',
      QA: 'standard none',
      INTEGRATION_REVIEW: 'integration epic',
      DOD_GATE: 'final-gate epic',
    });
  });

  it('reports a column spec from before roles as drifted in project sync', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-sync-'));
    try {
      new FsProjectRepository().scaffoldDefaults(tmp);
      const spec = path.join(tmp, '.aeos', 'column-specs', 'tech-spec.yaml');
      fs.writeFileSync(
        spec,
        fs.readFileSync(spec, 'utf-8').replace(/^(role|diffContext): .*\n/gm, ''),
      );

      const { files } = new ProjectSyncUseCase(new FsTemplateCatalog()).execute({
        projectPath: tmp,
        apply: false,
        force: false,
      });

      expect(files.filter((file) => file.status !== 'unchanged')).toMatchObject([
        { relativePath: 'column-specs/tech-spec.yaml', status: 'drifted' },
      ]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('has no agent that drafts requirements: a person writes the spec', () => {
    for (const template of readTemplates()) {
      expect(template.content, template.relativePath).not.toMatch(
        /Product Requirements Document|\bPRD\b/,
      );
    }
    expect(readTemplates().map((t) => t.relativePath)).not.toContain('agents/pm-agent.yaml');
  });
});

describe('scaffolded project integrity', () => {
  let tmpDir: string;
  let repo: FsProjectRepository;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-scaffold-'));
    repo = new FsProjectRepository();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('scaffolds a project whose every column spec loads and resolves', () => {
    repo.scaffoldDefaults(tmpDir);

    const columnLoader = new YamlColumnSpecLoader();
    const agentLoader = new YamlAgentSpecLoader();

    // Loading the scaffolded pipelines also holds them to the loader's rules.
    for (const column of displayOrder(new YamlPipelineLoader(columnLoader).load(tmpDir))) {
      if (SPECLESS.includes(column)) continue;

      // Every column an epic or task can reach must have a loadable spec...
      const spec = columnLoader.load(column, tmpDir);
      expect(spec.column).toBe(column);

      // The checks stage is on where code is built or assembled, and nowhere else.
      expect(spec.runChecks === true, `runChecks for ${column}`).toBe(
        column === 'IMPLEMENTATION' || column === 'INTEGRATION_REVIEW',
      );

      // ...whose agents resolve...
      expect(() => agentLoader.load(spec.workerAgentFile, tmpDir)).not.toThrow();
      expect(() => agentLoader.load(spec.reviewerAgentFile, tmpDir)).not.toThrow();

      // ...and whose rubrics are actually on disk.
      for (const rubric of spec.reviewerRubrics) {
        const rubricPath = path.join(tmpDir, '.aeos', rubric);
        expect(fs.existsSync(rubricPath), `missing rubric ${rubric} for ${column}`).toBe(true);
      }
    }
  });

  it('has the code reviewer of a single task check fidelity to the spec', () => {
    repo.scaffoldDefaults(tmpDir);

    const rubrics = new YamlColumnSpecLoader().load('CODE_REVIEW', tmpDir).reviewerRubrics;

    expect(rubrics).toContain('rubrics/drift/spec-fidelity.md');
    const rubric = fs.readFileSync(path.join(tmpDir, '.aeos', 'rubrics/drift/spec-fidelity.md'));
    expect(rubric.toString()).toMatch(/^## When reviewing a single task/m);
  });

  it('gives the final gate a worker of its own: no placeholder agents, no TODO', () => {
    repo.scaffoldDefaults(tmpDir);
    const inAeos = (file: string): string =>
      fs.readFileSync(path.join(tmpDir, '.aeos', file), 'utf-8');

    expect(inAeos('column-specs/dod-gate.yaml')).not.toMatch(/TODO|placeholder/i);
    const spec = new YamlColumnSpecLoader().load('DOD_GATE', tmpDir);
    expect(spec.workerAgentFile).toBe('agents/conformance-agent.yaml');
    // The worker judges criteria and says so in the block the engine parses...
    const agent = new YamlAgentSpecLoader().load(spec.workerAgentFile, tmpDir);
    expect(agent.taskInstruction).toContain('Judge exactly these criteria');
    expect(agent.outputFormat).toContain('<!-- AEOS-CONFORMANCE');
    // ...and the reviewer checks those judgements, not a pipeline checklist.
    expect(spec.reviewerRubrics).toEqual(['rubrics/dod/dod-evaluation.md']);
    expect(inAeos('rubrics/dod/dod-evaluation.md')).toMatch(/justified by evidence/i);
    expect(inAeos('rubrics/dod/dod-evaluation.md')).toMatch(/argued away/i);
  });

  it('gives the engineer the two instructions of the bug track', () => {
    repo.scaffoldDefaults(tmpDir);

    const { bugTrack } = new YamlAgentSpecLoader().load('agents/engineer-agent.yaml', tmpDir);

    expect(bugTrack?.reproduce).toContain('<!-- AEOS-REPRO');
    expect(bugTrack?.reproduce).toMatch(/failing test/i);
    expect(bugTrack?.fix).toMatch(/without editing/i);
  });

  it('reports what it created', () => {
    const created = repo.scaffoldDefaults(tmpDir);

    expect(created).toContain('agents/spec-reviewer-agent.yaml');
    expect(created.some((p) => p.startsWith('column-specs/'))).toBe(true);
    expect(created.some((p) => p.startsWith('rubrics/'))).toBe(true);
  });

  it('never overwrites a file the user has edited', () => {
    repo.scaffoldDefaults(tmpDir);
    const edited = path.join(tmpDir, '.aeos', 'agents', 'spec-reviewer-agent.yaml');
    fs.writeFileSync(edited, 'name: my-own-agent\n', 'utf-8');

    const created = repo.scaffoldDefaults(tmpDir);

    expect(fs.readFileSync(edited, 'utf-8')).toBe('name: my-own-agent\n');
    expect(created).not.toContain('agents/spec-reviewer-agent.yaml');
  });

  it('restores only what is missing on a re-run', () => {
    repo.scaffoldDefaults(tmpDir);
    fs.rmSync(path.join(tmpDir, '.aeos', 'column-specs', 'qa.yaml'));

    const created = repo.scaffoldDefaults(tmpDir);

    // Re-running init is the repair path, not a reset.
    expect(created).toEqual(['column-specs/qa.yaml']);
  });
});
