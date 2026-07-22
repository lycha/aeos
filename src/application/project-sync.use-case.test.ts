import { describe, it, expect, beforeEach } from 'vitest';

import { ProjectSyncUseCase } from './project-sync.use-case.js';
import type {
  TemplateCatalog,
  TemplateEntry,
} from '../domain/ports/driven/template-catalog.port.js';

class FakeCatalog implements TemplateCatalog {
  writes: Array<{ relativePath: string; content: string }> = [];
  backups: string[] = [];

  constructor(
    private readonly templates: TemplateEntry[],
    private readonly project: Map<string, string>,
  ) {}

  list(): TemplateEntry[] {
    return this.templates;
  }
  readProjectCopy(_projectPath: string, relativePath: string): string | null {
    return this.project.get(relativePath) ?? null;
  }
  write(_projectPath: string, relativePath: string, content: string): void {
    this.writes.push({ relativePath, content });
    this.project.set(relativePath, content);
  }
  backup(_projectPath: string, relativePath: string): string {
    this.backups.push(relativePath);
    return `${relativePath}.bak`;
  }
}

const templates: TemplateEntry[] = [
  { relativePath: 'agents/pm.yaml', content: 'pm v2' },
  { relativePath: 'column-specs/task-breakdown.yaml', content: 'mode: agentic' },
  { relativePath: 'column-specs/qa.yaml', content: 'qa v1' },
];

let project: Map<string, string>;

beforeEach(() => {
  project = new Map([
    ['agents/pm.yaml', 'pm v2'], // unchanged
    ['column-specs/task-breakdown.yaml', 'mode: artifact'], // drifted
    // qa.yaml absent → missing
  ]);
});

describe('ProjectSyncUseCase', () => {
  it('classifies unchanged, drifted, and missing files', () => {
    const catalog = new FakeCatalog(templates, project);
    const result = new ProjectSyncUseCase(catalog).execute({
      projectPath: '/p',
      apply: false,
      force: false,
    });

    const byPath = Object.fromEntries(result.files.map((f) => [f.relativePath, f.status]));
    expect(byPath['agents/pm.yaml']).toBe('unchanged');
    expect(byPath['column-specs/task-breakdown.yaml']).toBe('drifted');
    expect(byPath['column-specs/qa.yaml']).toBe('missing');
  });

  it('writes nothing on a dry run', () => {
    const catalog = new FakeCatalog(templates, project);
    new ProjectSyncUseCase(catalog).execute({ projectPath: '/p', apply: false, force: false });
    expect(catalog.writes).toEqual([]);
    expect(catalog.backups).toEqual([]);
  });

  it('adds missing files under --apply but leaves drift untouched', () => {
    const catalog = new FakeCatalog(templates, project);
    const result = new ProjectSyncUseCase(catalog).execute({
      projectPath: '/p',
      apply: true,
      force: false,
    });

    expect(catalog.writes).toEqual([{ relativePath: 'column-specs/qa.yaml', content: 'qa v1' }]);
    expect(catalog.backups).toEqual([]);
    expect(result.files.find((f) => f.relativePath === 'column-specs/qa.yaml')?.action).toBe(
      'added',
    );
    expect(
      result.files.find((f) => f.relativePath === 'column-specs/task-breakdown.yaml')?.action,
    ).toBe('none');
  });

  it('overwrites drifted files under --force, backing them up first', () => {
    const catalog = new FakeCatalog(templates, project);
    const result = new ProjectSyncUseCase(catalog).execute({
      projectPath: '/p',
      apply: false,
      force: true,
    });

    // Both the missing add and the drifted overwrite happen; the drifted one is backed up.
    expect(catalog.backups).toEqual(['column-specs/task-breakdown.yaml']);
    const drifted = result.files.find((f) => f.relativePath === 'column-specs/task-breakdown.yaml');
    expect(drifted?.action).toBe('updated');
    expect(drifted?.backupPath).toBe('column-specs/task-breakdown.yaml.bak');
    // Missing file still added (force implies apply).
    expect(result.files.find((f) => f.relativePath === 'column-specs/qa.yaml')?.action).toBe(
      'added',
    );
  });
});
