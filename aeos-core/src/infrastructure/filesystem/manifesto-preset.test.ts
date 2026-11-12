import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { FsProjectRepository } from './fs-project.repository.js';
import { YamlColumnSpecLoader } from '../spec-loader/yaml-column-spec-loader.adapter.js';
import { YamlAgentSpecLoader } from '../spec-loader/yaml-agent-spec-loader.adapter.js';
import { YamlPipelineLoader } from '../spec-loader/yaml-pipeline-loader.adapter.js';
import { Column, displayOrder } from '../../domain/model/column.js';

// The opt-in manifesto preset is overlaid on the standard scaffold by
// `scaffoldDefaults(path, 'manifesto')`. This test holds the scaffolded result
// to the same loader bar as the standard scaffold.
const SPECLESS: readonly Column[] = [Column.BACKLOG, Column.DONE];
const NEW_COLUMNS = ['API_CONTRACT', 'SCHEMA', 'SCAFFOLD'] as const;

describe('manifesto preset', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-manifesto-'));
    new FsProjectRepository().scaffoldDefaults(tmpDir, 'manifesto');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads as a valid pipeline with the three new EPIC columns in order', () => {
    const pipelines = new YamlPipelineLoader(new YamlColumnSpecLoader()).load(tmpDir);

    expect(pipelines.EPIC).toEqual([
      'BACKLOG',
      'SPEC_REVIEW',
      'TECH_SPEC',
      'API_CONTRACT',
      'SCHEMA',
      'SCAFFOLD',
      'TASK_BREAKDOWN',
      'INTEGRATION_REVIEW',
      'DOD_GATE',
      'DONE',
    ]);
    expect(pipelines.TASK).toEqual(['BACKLOG', 'IMPLEMENTATION', 'CODE_REVIEW', 'QA', 'DONE']);
  });

  it('gives every column a spec whose agents and rubrics resolve', () => {
    const columnLoader = new YamlColumnSpecLoader();
    const agentLoader = new YamlAgentSpecLoader();

    for (const column of displayOrder(new YamlPipelineLoader(columnLoader).load(tmpDir))) {
      if (SPECLESS.includes(column)) continue;

      const spec = columnLoader.load(column, tmpDir);
      expect(spec.column).toBe(column);
      expect(() => agentLoader.load(spec.workerAgentFile, tmpDir)).not.toThrow();
      expect(() => agentLoader.load(spec.reviewerAgentFile, tmpDir)).not.toThrow();
      for (const rubric of spec.reviewerRubrics) {
        expect(fs.existsSync(path.join(tmpDir, '.aeos', rubric)), `missing rubric ${rubric}`).toBe(
          true,
        );
      }
    }
  });

  it('declares the new columns as standard, human-owned review stages', () => {
    const columnLoader = new YamlColumnSpecLoader();
    const declared = Object.fromEntries(
      NEW_COLUMNS.map((column) => {
        const spec = columnLoader.load(column, tmpDir);
        return [column, `${spec.role} ${spec.diffContext}`];
      }),
    );

    expect(declared).toEqual({
      API_CONTRACT: 'standard none',
      SCHEMA: 'standard none',
      SCAFFOLD: 'standard epic',
    });
  });

  it('reuses the standard reviewer and keeps a dedicated worker per new column', () => {
    const columnLoader = new YamlColumnSpecLoader();

    for (const column of NEW_COLUMNS) {
      const spec = columnLoader.load(column, tmpDir);
      expect(spec.reviewerAgentFile).toBe('agents/reviewer-agent.yaml');
      expect(spec.workerAgentFile).not.toBe(spec.reviewerAgentFile);
      expect(spec.workerAgentFile).toMatch(/^agents\/.+-agent\.yaml$/);
    }
  });
});

describe('standard scaffold is unaffected by the preset', () => {
  it('has none of the manifesto columns', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-standard-'));
    try {
      new FsProjectRepository().scaffoldDefaults(tmpDir);
      const pipelines = new YamlPipelineLoader(new YamlColumnSpecLoader()).load(tmpDir);

      for (const column of NEW_COLUMNS) {
        expect(pipelines.EPIC).not.toContain(column);
        expect(fs.existsSync(path.join(tmpDir, '.aeos', 'column-specs', `${column}.yaml`))).toBe(
          false,
        );
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
