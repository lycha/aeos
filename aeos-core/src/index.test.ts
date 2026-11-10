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
});
