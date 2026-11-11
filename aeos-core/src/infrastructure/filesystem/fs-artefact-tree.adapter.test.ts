import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { FsArtefactTree } from './fs-artefact-tree.adapter.js';

describe('FsArtefactTree', () => {
  let project: string;
  const tree = new FsArtefactTree();

  const writeConfig = (config: object) => {
    fs.mkdirSync(path.join(project, '.aeos'), { recursive: true });
    fs.writeFileSync(path.join(project, '.aeos', 'project.json'), JSON.stringify(config));
  };

  beforeEach(() => {
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-tree-'));
  });

  afterEach(() => {
    fs.rmSync(project, { recursive: true, force: true });
  });

  it('defaults to .aeos under the project', () => {
    writeConfig({});

    expect(tree.root(project)).toBe(path.join(project, '.aeos'));
    expect(tree.featureDir(project, 'checkout')).toBe(
      path.join(project, '.aeos', 'features', 'checkout'),
    );
  });

  it('uses artefactTree from project.json, relative to the project root', () => {
    writeConfig({ artefactTree: 'docs/specs' });

    expect(tree.root(project)).toBe(path.join(project, 'docs', 'specs'));
    expect(tree.featureDir(project, 'checkout')).toBe(
      path.join(project, 'docs', 'specs', 'features', 'checkout'),
    );
  });

  it('says whether a feature exists and lists the ones that do', () => {
    writeConfig({});
    expect(tree.exists(project, 'checkout')).toBe(false);
    expect(tree.listFeatures(project)).toEqual([]);

    fs.mkdirSync(path.join(project, '.aeos', 'features', 'checkout'), { recursive: true });
    fs.mkdirSync(path.join(project, '.aeos', 'features', 'billing'));
    fs.writeFileSync(path.join(project, '.aeos', 'features', 'notes.md'), '');

    expect(tree.exists(project, 'checkout')).toBe(true);
    expect(tree.listFeatures(project)).toEqual(['billing', 'checkout']);
  });
});
