import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { readTemplates } from './template-source.js';
import { FsProjectRepository } from './fs-project.repository.js';
import { YamlColumnSpecLoader } from '../spec-loader/yaml-column-spec-loader.adapter.js';
import { YamlAgentSpecLoader } from '../spec-loader/yaml-agent-spec-loader.adapter.js';
import { Column, COLUMN_ORDER } from '../../domain/model/column.js';

/** Columns with no agent pipeline, and therefore no column spec. */
const SPECLESS: readonly Column[] = [Column.BACKLOG, Column.DONE];

describe('readTemplates', () => {
  it('finds the shipped templates', () => {
    const templates = readTemplates();
    expect(templates.length).toBeGreaterThan(0);
  });

  it('ships templates under the expected top-level directories', () => {
    const dirs = new Set(readTemplates().map((t) => t.relativePath.split(path.sep)[0]));

    expect(dirs).toEqual(new Set(['column-specs', 'agents', 'rubrics']));
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

    for (const column of COLUMN_ORDER) {
      if (SPECLESS.includes(column)) continue;

      // Every column an epic or task can reach must have a loadable spec...
      const spec = columnLoader.load(column, tmpDir);
      expect(spec.column).toBe(column);

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

  it('reports what it created', () => {
    const created = repo.scaffoldDefaults(tmpDir);

    expect(created).toContain('agents/pm-agent.yaml');
    expect(created.some((p) => p.startsWith('column-specs/'))).toBe(true);
    expect(created.some((p) => p.startsWith('rubrics/'))).toBe(true);
  });

  it('never overwrites a file the user has edited', () => {
    repo.scaffoldDefaults(tmpDir);
    const edited = path.join(tmpDir, '.aeos', 'agents', 'pm-agent.yaml');
    fs.writeFileSync(edited, 'name: my-own-agent\n', 'utf-8');

    const created = repo.scaffoldDefaults(tmpDir);

    expect(fs.readFileSync(edited, 'utf-8')).toBe('name: my-own-agent\n');
    expect(created).not.toContain('agents/pm-agent.yaml');
  });

  it('restores only what is missing on a re-run', () => {
    repo.scaffoldDefaults(tmpDir);
    fs.rmSync(path.join(tmpDir, '.aeos', 'column-specs', 'qa.yaml'));

    const created = repo.scaffoldDefaults(tmpDir);

    // Re-running init is the repair path, not a reset.
    expect(created).toEqual(['column-specs/qa.yaml']);
  });
});
