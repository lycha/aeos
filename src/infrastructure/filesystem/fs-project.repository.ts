// Adapter — Filesystem implementation of ProjectRepository port (JSON files + registry)

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Project } from '../../domain/model/project.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';
import {
  ProjectRootNotFoundError,
  ProjectConfigNotFoundError,
  ProjectConfigCorruptError,
} from '../../shared/errors.js';

const AEOS_DIR = '.aeos';
const PROJECT_JSON = 'project.json';
const COLUMN_SPECS_DIR = 'column-specs';
const MAX_WALK_DEPTH = 256;

/**
 * Walks up from `startDir` (defaults to process.cwd()) looking for .aeos/.
 * Returns the absolute path of the directory containing .aeos/.
 * Throws ProjectRootNotFoundError if none is found before hitting filesystem root.
 */
export function projectRoot(startDir?: string): string {
  let current = path.resolve(startDir ?? process.cwd());

  for (let depth = 0; depth < MAX_WALK_DEPTH; depth++) {
    if (fs.existsSync(path.join(current, AEOS_DIR))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new ProjectRootNotFoundError();
    }
    current = parent;
  }

  throw new ProjectRootNotFoundError('Max directory depth (256) exceeded — possible symlink loop');
}

/** Returns the absolute path to the .aeos/ directory for the project. */
export function aeosDir(root?: string): string {
  return path.join(projectRoot(root), AEOS_DIR);
}

/** Reads and parses .aeos/project.json. Throws if not found or invalid JSON. */
export function readProjectConfig(root?: string): Project {
  const dir = aeosDir(root);
  const configPath = path.join(dir, PROJECT_JSON);

  let raw: string;
  try {
    raw = fs.readFileSync(configPath, 'utf-8');
  } catch {
    throw new ProjectConfigNotFoundError();
  }

  try {
    return JSON.parse(raw) as Project;
  } catch {
    throw new ProjectConfigCorruptError();
  }
}

export class FsProjectRepository implements ProjectRepository {
  exists(projectPath: string): boolean {
    const filePath = path.join(projectPath, AEOS_DIR, PROJECT_JSON);
    return fs.existsSync(filePath);
  }

  read(projectPath: string): Project {
    const filePath = path.join(projectPath, AEOS_DIR, PROJECT_JSON);
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as Project;
  }

  writeProject(project: Project): void {
    const aeosDir = path.join(project.path, AEOS_DIR);
    fs.mkdirSync(aeosDir, { recursive: true });
    const filePath = path.join(aeosDir, PROJECT_JSON);
    fs.writeFileSync(filePath, JSON.stringify(project, null, 2) + '\n', 'utf-8');
  }

  ensureColumnSpecsDir(projectPath: string): void {
    const dir = path.join(projectPath, AEOS_DIR, COLUMN_SPECS_DIR);
    fs.mkdirSync(dir, { recursive: true });
  }

  findRoot(startDir: string): string | null {
    let current = path.resolve(startDir);
    const root = path.parse(current).root;

    for (let depth = 0; depth < MAX_WALK_DEPTH; depth++) {
      const candidate = path.join(current, AEOS_DIR, PROJECT_JSON);
      if (fs.existsSync(candidate)) {
        return current;
      }
      if (current === root) {
        return null;
      }
      current = path.dirname(current);
    }

    return null;
  }
}
