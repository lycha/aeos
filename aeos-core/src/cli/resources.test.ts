// The guards of the resources that are found on this machine: python, gh.
// Neither test starts python3 or gh.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Container } from './container.js';
import { createResources } from './resources.js';
import { PythonDecisionsLint } from '../infrastructure/spec/decisions-lint.adapter.js';

const resources = createResources({} as Container);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('resource guards', () => {
  it('python is in place exactly when the lint adapter finds python3 and its modules', () => {
    const ready = vi.spyOn(PythonDecisionsLint.prototype, 'ready').mockReturnValue(false);
    expect(resources.inPlace('python', {})).toBe(false);

    ready.mockReturnValue(true);
    expect(resources.inPlace('python', {})).toBe(true);
  });

  it('gh is in place exactly when a `gh` file is on PATH, and is never run', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-path-'));
    vi.stubEnv('AEOS_EXECUTOR', '');
    vi.stubEnv('PATH', dir);
    expect(resources.inPlace('gh', {})).toBe(false);

    // Not executable and not a program: found is all the guard asks.
    fs.writeFileSync(path.join(dir, 'gh'), '');
    expect(resources.inPlace('gh', {})).toBe(true);
  });

  it('gh is not asked for under the stub, which never reaches the code host', () => {
    vi.stubEnv('AEOS_EXECUTOR', 'stub');
    vi.stubEnv('PATH', '');
    expect(resources.inPlace('gh', {})).toBe(true);
  });
});
