// Adapter — Filesystem implementation of ProjectRepository port (JSON files + registry)

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Project } from '../../domain/model/project.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';

const AEOS_DIR = '.aeos';
const PROJECT_JSON = 'project.json';
const COLUMN_SPECS_DIR = 'column-specs';

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
}
