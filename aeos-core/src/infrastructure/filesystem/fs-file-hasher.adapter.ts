// Adapter — filesystem implementation of the FileHasher port

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { FileHasher } from '../../domain/ports/driven/file-hasher.port.js';

export class FsFileHasher implements FileHasher {
  sha256(dir: string, paths: readonly string[]): Record<string, string | null> {
    return Object.fromEntries(
      paths.map((file) => {
        try {
          const content = fs.readFileSync(path.join(dir, file));
          return [file, createHash('sha256').update(content).digest('hex')];
        } catch {
          return [file, null];
        }
      }),
    );
  }
}
