import * as fs from 'node:fs';
import * as os from 'node:os';
import { describe, expect, it } from 'vitest';
import { ShellChecksRunner } from './shell-checks-runner.adapter.js';

describe('ShellChecksRunner', () => {
  const runner = new ShellChecksRunner();
  const cwd = fs.realpathSync(os.tmpdir());

  it('reports exit code 0 and the combined output of a passing command', async () => {
    const result = await runner.run(
      { command: `node -e "console.log('out'); console.error('err')"`, timeoutSeconds: 30 },
      cwd,
    );

    expect(result).toMatchObject({ exitCode: 0, timedOut: false });
    expect(result.outputTail).toContain('out');
    expect(result.outputTail).toContain('err');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('reports the exit code of a failing command', async () => {
    const result = await runner.run(
      { command: 'node -e "process.exit(3)"', timeoutSeconds: 30 },
      cwd,
    );

    expect(result).toMatchObject({ exitCode: 3, timedOut: false });
  });

  it('runs in the directory it is given', async () => {
    const result = await runner.run(
      { command: 'node -e "console.log(process.cwd())"', timeoutSeconds: 30 },
      cwd,
    );

    expect(result.outputTail.trim()).toBe(cwd);
  });

  it('keeps only the last 200 lines of output', async () => {
    const result = await runner.run(
      {
        command: `node -e "for (let i = 1; i <= 250; i++) console.log('line ' + i)"`,
        timeoutSeconds: 30,
      },
      cwd,
    );

    const lines = result.outputTail.trimEnd().split('\n');
    expect(lines).toHaveLength(200);
    expect(lines[0]).toBe('line 51');
    expect(lines.at(-1)).toBe('line 250');
  });

  it('kills a command that exceeds its timeout and reports timedOut', async () => {
    const result = await runner.run(
      { command: 'node -e "setTimeout(() => {}, 60000)"', timeoutSeconds: 0.2 },
      cwd,
    );

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
    expect(result.durationMs).toBeLessThan(10_000);
  });
});
