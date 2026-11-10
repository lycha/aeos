import { describe, expect, it, vi } from 'vitest';

import type { ChecksRunner } from '../../domain/ports/driven/checks-runner.port.js';
import { ReproCheck } from './repro-check.js';

const runnerExiting = (exitCode: number | null, timedOut = false): ChecksRunner => ({
  run: vi.fn().mockResolvedValue({ exitCode, durationMs: 7, timedOut, outputTail: 'tail' }),
});

describe('ReproCheck', () => {
  it('runs the command in the project root and keeps its exit code', async () => {
    const runner = runnerExiting(1);
    const check = new ReproCheck('npx vitest run a.test.ts', 'red', runner);

    const result = await check.run({ projectPath: '/project' });

    expect(runner.run).toHaveBeenCalledWith(
      { command: 'npx vitest run a.test.ts', timeoutSeconds: 600 },
      '/project',
    );
    expect(result).toEqual({
      name: 'repro-red',
      passed: true,
      durationMs: 7,
      timedOut: false,
      outputTail: 'tail',
    });
    expect(check.exitCode).toBe(1);
  });

  it.each([
    ['red', 1, false, true],
    ['red', 0, false, false],
    // Killed at the timeout: the test was not seen to fail.
    ['red', null, true, false],
    ['green', 0, false, true],
    ['green', 1, false, false],
    ['green', null, true, false],
  ] as const)(
    'expecting %s, exit %s (timed out: %s) passes: %s',
    async (expected, exit, timedOut, passed) => {
      const check = new ReproCheck('cmd', expected, runnerExiting(exit, timedOut));

      expect((await check.run({ projectPath: '/project' })).passed).toBe(passed);
    },
  );
});
