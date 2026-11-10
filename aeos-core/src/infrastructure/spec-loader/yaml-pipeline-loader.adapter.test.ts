import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FsProjectRepository } from '../filesystem/fs-project.repository.js';
import { YamlColumnSpecLoader } from './yaml-column-spec-loader.adapter.js';
import { YamlPipelineLoader } from './yaml-pipeline-loader.adapter.js';

const EPIC = [
  'BACKLOG',
  'SPEC_REVIEW',
  'TECH_SPEC',
  'TASK_BREAKDOWN',
  'INTEGRATION_REVIEW',
  'DOD_GATE',
  'DONE',
];
const TASK = ['BACKLOG', 'IMPLEMENTATION', 'CODE_REVIEW', 'QA', 'DONE'];

let tmpDir: string;
const loader = new YamlPipelineLoader(new YamlColumnSpecLoader());
const file = (): string => path.join(tmpDir, '.aeos', 'pipelines.yaml');
const write = (document: unknown): void => fs.writeFileSync(file(), yaml.dump(document), 'utf-8');

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-pipelines-test-'));
  new FsProjectRepository().scaffoldDefaults(tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('YamlPipelineLoader', () => {
  it('loads the scaffolded template', () => {
    expect(loader.load(tmpDir)).toEqual({ EPIC, TASK });
  });

  it('gives a project with no pipelines.yaml the template order', () => {
    fs.rmSync(file());

    expect(loader.load(tmpDir)).toEqual({ EPIC, TASK });
  });

  it('reads the order the project wrote', () => {
    const swapped = ['BACKLOG', 'IMPLEMENTATION', 'QA', 'CODE_REVIEW', 'DONE'];
    write({ pipelines_version: 0, pipelines: { EPIC, TASK: swapped } });

    expect(loader.load(tmpDir).TASK).toEqual(swapped);
  });

  it('refuses a ticket kind other than EPIC and TASK', () => {
    write({ pipelines_version: 0, pipelines: { EPIC, TASK, BUG: TASK } });

    expect(() => loader.load(tmpDir)).toThrow(/BUG.*new kinds are not supported/);
  });

  it('refuses an EPIC pipeline with no decomposition column, with that reason', () => {
    write({
      pipelines_version: 0,
      pipelines: { EPIC: EPIC.filter((column) => column !== 'TASK_BREAKDOWN'), TASK },
    });

    expect(() => loader.load(tmpDir)).toThrow(
      /EPIC pipeline has no column with role `decomposition`/,
    );
  });

  it('refuses a column with no column spec, naming the column', () => {
    write({
      pipelines_version: 0,
      pipelines: { EPIC, TASK: ['BACKLOG', 'IMPLEMENTATION', 'SECURITY_REVIEW', 'DONE'] },
    });

    expect(() => loader.load(tmpDir)).toThrow(/SECURITY_REVIEW.*no column spec/);
  });

  it('refuses a file that is not a pipelines document, naming the field', () => {
    write({ pipelines_version: 0, pipelines: { EPIC, TASK: 'QA' } });

    expect(() => loader.load(tmpDir)).toThrow(/pipelines\.yaml.*pipelines\.TASK/s);
  });
});
