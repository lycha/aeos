import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { VitestJsonReader } from './vitest-json-reader.adapter.js';

describe('VitestJsonReader', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-report-'));
    file = path.join(dir, 'test-report.json');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns the name, file and status of every test in a Vitest JSON report', () => {
    // The shape `vitest run --reporter=json` writes.
    fs.writeFileSync(
      file,
      JSON.stringify({
        numTotalTests: 4,
        testResults: [
          {
            name: '/repo/src/greeting.test.ts',
            status: 'failed',
            assertionResults: [
              { fullName: 'greeting AC-1 greets a stranger', title: 'x', status: 'passed' },
              { fullName: 'greeting AC-2 greets by name', title: 'x', status: 'failed' },
              { fullName: 'greeting later', title: 'x', status: 'skipped' },
            ],
          },
          {
            name: '/repo/src/other.test.ts',
            assertionResults: [{ fullName: 'other todo', title: 'x', status: 'todo' }],
          },
        ],
      }),
    );

    expect(new VitestJsonReader().read(file, 'vitest-json')).toEqual([
      {
        name: 'greeting AC-1 greets a stranger',
        file: '/repo/src/greeting.test.ts',
        status: 'pass',
      },
      { name: 'greeting AC-2 greets by name', file: '/repo/src/greeting.test.ts', status: 'fail' },
      { name: 'greeting later', file: '/repo/src/greeting.test.ts', status: 'skipped' },
      { name: 'other todo', file: '/repo/src/other.test.ts', status: 'skipped' },
    ]);
  });

  it('refuses a format it does not read, and a file that is not a report', () => {
    fs.writeFileSync(file, '{"tests": []}');

    expect(() => new VitestJsonReader().read(file, 'junit')).toThrow(/junit.*vitest-json/);
    expect(() => new VitestJsonReader().read(file, 'vitest-json')).toThrow(/not a Vitest JSON/);
    expect(() => new VitestJsonReader().read(path.join(dir, 'none.json'), 'vitest-json')).toThrow(
      /none\.json/,
    );
  });
});
