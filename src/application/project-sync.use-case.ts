// Use case — ProjectSync: reconcile a project's scaffolded templates with the
// current package templates.
//
// A project scaffolded by an older `project init` keeps its original column
// specs, agents, and rubrics forever — template improvements never reach it,
// and the drift only surfaces when a ticket reaches the affected column. This
// use case makes the drift visible (and, on request, applies it).
//
// There is deliberately no three-way merge: AEOS does not store the template
// version a file was scaffolded from, so it cannot tell a local edit from a
// template change within the same file. Instead sync reports drift, and only
// overwrites a drifted file under `--force`, backing up the prior content so a
// local edit (e.g. a changed `advanceMode`) is recoverable.

import type { TemplateCatalog } from '../domain/ports/driven/template-catalog.port.js';
import type {
  ProjectSyncInput,
  ProjectSyncPort,
  ProjectSyncResult,
  SyncFileOutcome,
  SyncStatus,
} from '../domain/ports/driving/project-sync.port.js';

export class ProjectSyncUseCase implements ProjectSyncPort {
  constructor(private readonly catalog: TemplateCatalog) {}

  execute(input: ProjectSyncInput): ProjectSyncResult {
    const { projectPath, apply, force } = input;
    const files: SyncFileOutcome[] = [];

    for (const template of this.catalog.list()) {
      const projectContent = this.catalog.readProjectCopy(projectPath, template.relativePath);
      const status: SyncStatus =
        projectContent === null
          ? 'missing'
          : projectContent === template.content
            ? 'unchanged'
            : 'drifted';

      let action: SyncFileOutcome['action'] = 'none';
      let backupPath: string | undefined;

      // Missing files are always safe to add — restoring them can only fix a
      // project. Drifted files are only touched under --force because the
      // overwrite discards whatever the user changed.
      if (status === 'missing' && (apply || force)) {
        this.catalog.write(projectPath, template.relativePath, template.content);
        action = 'added';
      } else if (status === 'drifted' && force) {
        backupPath = this.catalog.backup(projectPath, template.relativePath);
        this.catalog.write(projectPath, template.relativePath, template.content);
        action = 'updated';
      }

      files.push({
        relativePath: template.relativePath,
        status,
        action,
        backupPath,
        templateContent: template.content,
        projectContent,
      });
    }

    return { files };
  }
}
