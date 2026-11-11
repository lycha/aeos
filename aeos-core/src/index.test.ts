import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { describe, it, expect } from 'vitest';

const read = (file: string): string =>
  fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf-8');

describe('package', () => {
  it('declares the licence that the LICENSE file grants', () => {
    // LICENSE opens "Apache License / Version 2.0, January 2004".
    const [name, version] = read('LICENSE')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const spdx = `${name.split(' ')[0]}-${/Version ([\d.]+)/.exec(version)?.[1]}`;

    expect(spdx).toBe('Apache-2.0');
    expect((JSON.parse(read('package.json')) as { license: string }).license).toBe(spdx);
  });

  it('is published under the owner scope and keeps the aeos command', () => {
    const pkg = JSON.parse(read('package.json')) as { name: string; bin: Record<string, string> };

    expect(pkg.name).toBe('@lycha/aeos');
    expect(Object.keys(pkg.bin)).toEqual(['aeos']);
  });

  // Reads dist/, so it needs `npm run build` first, as CI and the gates run it.
  it('packs the built CLI and its data, and no compiled test', { timeout: 60_000 }, () => {
    const packed = JSON.parse(
      execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
        cwd: new URL('..', import.meta.url),
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    ) as [{ files: { path: string }[] }];
    const files = packed[0].files.map((file) => file.path);

    expect(files.filter((file) => /\.(test|smoke-test|fixture)\.|^dist\/e2e\//.test(file))).toEqual(
      [],
    );
    expect(files).toEqual(
      expect.arrayContaining(['dist/cli/index.js', 'cli-contract.yaml', 'skills/aeos/SKILL.md']),
    );
    expect(files.some((file) => file.startsWith('templates/'))).toBe(true);
  });
});
