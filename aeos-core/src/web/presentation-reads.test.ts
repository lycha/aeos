// Criteria traced here: @AC-24 (create form's selectable specs are the features in the artefact tree).
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listFeatures } from './presentation-reads.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-presentation-reads-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('listFeatures', () => {
  it('returns the feature names present in the artefact tree, sorted', () => {
    const featuresDir = path.join(tmpDir, '.aeos', 'features');
    fs.mkdirSync(path.join(featuresDir, 'web-ui'), { recursive: true });
    fs.mkdirSync(path.join(featuresDir, 'billing'), { recursive: true });

    expect(listFeatures(tmpDir)).toEqual(['billing', 'web-ui']);
  });

  it('returns an empty array when the artefact tree has no features directory', () => {
    expect(listFeatures(tmpDir)).toEqual([]);
  });
});
