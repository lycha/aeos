import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

// What a column does comes from its spec (role, diffContext, executorMode),
// never from what it is called. BACKLOG and DONE are structural and may be named.
const NAMED =
  '(SPEC_REVIEW|TECH_SPEC|TASK_BREAKDOWN|IMPLEMENTATION|CODE_REVIEW|QA|INTEGRATION_REVIEW|DOD_GATE)';
const COMPARISON = new RegExp(`Column\\.${NAMED}\\b|[!=]==? *'${NAMED}'|'${NAMED}' *[!=]==?`);

/** Where a column's name may appear: its definition, tests, and the test harness. */
const exempt = (file: string): boolean =>
  /\.test\.tsx?$|\.smoke-test\.ts$/.test(file) ||
  file.startsWith(`e2e${path.sep}`) ||
  file === path.join('domain', 'model', 'column.ts');

function sources(dir: string, root = dir): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(absolute, root);
    return /\.tsx?$/.test(entry.name) ? [path.relative(root, absolute)] : [];
  });
}

describe('column names', () => {
  it('are compared against nowhere outside the column model', () => {
    const offenders = sources(import.meta.dirname)
      .filter((file) => !exempt(file))
      .flatMap((file) =>
        fs
          .readFileSync(path.join(import.meta.dirname, file), 'utf-8')
          .split('\n')
          .map((line, index) => ({ line, at: `${file}:${index + 1}` }))
          .filter(({ line }) => COMPARISON.test(line))
          .map(({ line, at }) => `${at}  ${line.trim()}`),
      );

    expect(offenders).toEqual([]);
  });
});
