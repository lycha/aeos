// Adapter — runs a check command through the shell

import { spawn } from 'node:child_process';
import type { ChecksRunner } from '../../domain/ports/driven/checks-runner.port.js';

const TAIL_LINES = 200;

export class ShellChecksRunner implements ChecksRunner {
  run(
    check: { command: string; timeoutSeconds: number },
    cwd: string,
  ): ReturnType<ChecksRunner['run']> {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      let output = '';
      let timedOut = false;
      // Detached, so the timeout can kill the whole process group: `npm test`
      // is a shell that starts npm that starts the test runner.
      const child = spawn(check.command, { cwd, shell: true, detached: true });
      const collect = (chunk: Buffer): void => {
        output = (output + chunk.toString('utf-8'))
          .split('\n')
          .slice(-(TAIL_LINES + 1))
          .join('\n');
      };
      child.stdout.on('data', collect);
      child.stderr.on('data', collect);

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          process.kill(-child.pid!, 'SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
      }, check.timeoutSeconds * 1000);

      const settle = (exitCode: number | null, extra = ''): void => {
        clearTimeout(timer);
        resolve({
          exitCode,
          durationMs: Date.now() - startedAt,
          timedOut,
          outputTail: (output + extra).trimEnd().split('\n').slice(-TAIL_LINES).join('\n'),
        });
      };
      child.on('error', (err) => settle(null, `\n${err.message}`));
      child.on('close', (code) => settle(code));
    });
  }
}
