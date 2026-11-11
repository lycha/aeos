// Adapter — filesystem implementation of the GeneratorStampStore port

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { GeneratorStampStore } from '../../domain/ports/driven/generator-stamp-store.port.js';

// Under `tmp/`, which `.aeos/.gitignore` keeps out of the repository: a stamp
// describes this working copy, not the project.
const file = (projectPath: string): string =>
  path.join(projectPath, '.aeos', 'tmp', 'generators.json');

export class FsGeneratorStampStore implements GeneratorStampStore {
  read(projectPath: string): Record<string, string> {
    try {
      return JSON.parse(fs.readFileSync(file(projectPath), 'utf-8')) as Record<string, string>;
    } catch {
      return {};
    }
  }

  write(projectPath: string, stamps: Record<string, string>): void {
    fs.mkdirSync(path.dirname(file(projectPath)), { recursive: true });
    fs.writeFileSync(file(projectPath), `${JSON.stringify(stamps, null, 2)}\n`, 'utf-8');
  }
}
