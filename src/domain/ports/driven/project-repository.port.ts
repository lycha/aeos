// Driven port — ProjectRepository: CRUD for projects (backed by JSON files + registry)

import type { Project } from '../../model/project.js';

export interface ProjectRepository {
  /** Returns true if .aeos/project.json already exists at the given path */
  exists(projectPath: string): boolean;
  /** Reads existing project.json from .aeos/ directory */
  read(projectPath: string): Project;
  /** Creates .aeos/ directory and writes project.json */
  writeProject(project: Project): void;
  /** Creates .aeos/column-specs/ directory */
  ensureColumnSpecsDir(projectPath: string): void;
  /** Walk up from `startDir` to find the nearest directory containing .aeos/project.json. Returns the project root path, or null if not found. */
  findRoot(startDir: string): string | null;
  /** Reads CONSTRAINTS.md from .aeos/ directory. Returns null if not present. */
  readConstraints(projectPath: string): string | null;
}
