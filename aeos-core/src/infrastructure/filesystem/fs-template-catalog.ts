// Adapter — filesystem implementation of TemplateCatalog.

import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  TemplateCatalog,
  TemplateEntry,
} from '../../domain/ports/driven/template-catalog.port.js';
import { readTemplates } from './template-source.js';

const AEOS_DIR = '.aeos';

export class FsTemplateCatalog implements TemplateCatalog {
  list(): TemplateEntry[] {
    return readTemplates().map((t) => ({ relativePath: t.relativePath, content: t.content }));
  }

  readProjectCopy(projectPath: string, relativePath: string): string | null {
    const target = path.join(projectPath, AEOS_DIR, relativePath);
    try {
      return fs.readFileSync(target, 'utf-8');
    } catch {
      return null;
    }
  }

  write(projectPath: string, relativePath: string, content: string): void {
    const target = path.join(projectPath, AEOS_DIR, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf-8');
  }

  backup(projectPath: string, relativePath: string): string {
    const target = path.join(projectPath, AEOS_DIR, relativePath);
    const backupRelative = `${relativePath}.bak`;
    const backupTarget = path.join(projectPath, AEOS_DIR, backupRelative);
    // rename (not copy) so the subsequent write starts from a clean slate; an
    // earlier .bak is overwritten — the newest local version is what matters.
    fs.rmSync(backupTarget, { force: true });
    fs.renameSync(target, backupTarget);
    return backupRelative;
  }
}
