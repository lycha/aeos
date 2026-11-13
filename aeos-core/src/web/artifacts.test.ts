// Criteria traced here: @AC-32 (serve only by ticket + artifact name, never a request path).
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolve } from './artifacts.js';

let tmpDir: string;
let ticketDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-artifacts-test-'));
  ticketDir = path.join(tmpDir, '.aeos', 'tickets', 'AEOS-1');
  fs.mkdirSync(ticketDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('resolve', () => {
  it('returns the content of an artifact present in the ticket listing', () => {
    fs.writeFileSync(path.join(ticketDir, 'AEOS-1-spec.md'), '# Spec\ncontent', 'utf-8');

    const result = resolve(tmpDir, 'AEOS-1', 'AEOS-1-spec.md');

    expect(result).toEqual({ ok: true, content: '# Spec\ncontent' });
  });

  it('refuses a name not present in the ticket listing', () => {
    fs.writeFileSync(path.join(ticketDir, 'AEOS-1-spec.md'), '# Spec', 'utf-8');

    const result = resolve(tmpDir, 'AEOS-1', 'AEOS-1-other.md');

    expect(result).toEqual({ ok: false, reason: 'ARTIFACT_NOT_FOUND' });
  });

  it('refuses a traversal attempt without reading outside the allowlist', () => {
    fs.writeFileSync(path.join(tmpDir, 'secret.txt'), 'top secret', 'utf-8');

    const result = resolve(tmpDir, 'AEOS-1', '../../secret.txt');

    expect(result).toEqual({ ok: false, reason: 'ARTIFACT_NOT_FOUND' });
  });

  it('refuses when the ticket has no artifact directory at all', () => {
    const result = resolve(tmpDir, 'AEOS-2', 'AEOS-2-spec.md');

    expect(result).toEqual({ ok: false, reason: 'ARTIFACT_NOT_FOUND' });
  });
});
