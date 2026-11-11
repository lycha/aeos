import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FsFileHasher } from './fs-file-hasher.adapter.js';

describe('FsFileHasher', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-hash-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('gives the SHA-256 of each file, and null for one that is not there', () => {
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'a.test.ts'), 'expect(1).toBe(2);\n');

    expect(new FsFileHasher().sha256(dir, ['src/a.test.ts', 'gone.ts'])).toEqual({
      'src/a.test.ts': createHash('sha256').update('expect(1).toBe(2);\n').digest('hex'),
      'gone.ts': null,
    });
  });
});
