// Adapter — Filesystem implementation of RubricLoader port

import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { RubricLoader } from '../../domain/ports/driven/rubric-loader.port.js';

const AEOS_DIR = '.aeos';

export class FsRubricLoader implements RubricLoader {
  async load(rubricPath: string, projectPath: string): Promise<string | null> {
    const fullPath = path.join(projectPath, AEOS_DIR, rubricPath);
    try {
      return await readFile(fullPath, 'utf-8');
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        'code' in err &&
        (err as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return null;
      }
      throw err;
    }
  }
}
