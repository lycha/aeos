// Adapter — filesystem implementation of the ArtefactTree port.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ArtefactTree } from '../../domain/ports/driven/artefact-tree.port.js';
import type { ProjectExecutorConfig } from '../../domain/model/project-executor-config.js';

export class FsArtefactTree implements ArtefactTree {
  root(projectPath: string): string {
    let configured: string | undefined;
    try {
      const raw = fs.readFileSync(path.join(projectPath, '.aeos', 'project.json'), 'utf-8');
      configured = (JSON.parse(raw) as ProjectExecutorConfig).artefactTree;
    } catch {
      // No readable project.json: the default applies.
    }
    return path.resolve(projectPath, configured ?? '.aeos');
  }

  featureDir(projectPath: string, feature: string): string {
    return path.join(this.root(projectPath), 'features', feature);
  }

  exists(projectPath: string, feature: string): boolean {
    return fs.existsSync(this.featureDir(projectPath, feature));
  }

  listFeatures(projectPath: string): string[] {
    const dir = path.join(this.root(projectPath), 'features');
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  }
}
