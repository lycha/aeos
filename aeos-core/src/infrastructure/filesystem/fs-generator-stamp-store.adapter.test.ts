import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FsGeneratorStampStore } from './fs-generator-stamp-store.adapter.js';

describe('FsGeneratorStampStore', () => {
  let projectPath: string;
  beforeEach(() => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-stamps-'));
  });
  afterEach(() => {
    fs.rmSync(projectPath, { recursive: true, force: true });
  });

  it('reads nothing before anything ran, then what was written, from .aeos/tmp/', () => {
    const store = new FsGeneratorStampStore();
    expect(store.read(projectPath)).toEqual({});

    store.write(projectPath, { cli: 'abc' });

    expect(store.read(projectPath)).toEqual({ cli: 'abc' });
    expect(fs.existsSync(path.join(projectPath, '.aeos', 'tmp', 'generators.json'))).toBe(true);
  });
});
