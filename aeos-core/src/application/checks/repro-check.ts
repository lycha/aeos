// The run of a bug's reproducing test: expected to fail before the fix (`red`)
// and to pass after it (`green`). Passing, here, means "as expected".

import type { Check, CheckContext, CheckResult } from '../../domain/model/check.js';
import type { ChecksRunner } from '../../domain/ports/driven/checks-runner.port.js';

/** One test, not a suite: generous, and still bounded. */
const REPRO_TIMEOUT_SECONDS = 600;

export class ReproCheck implements Check {
  readonly phase = 'post-worker';
  /** The exit code of the last run, for the evidence; null when it was killed. */
  exitCode: number | null = null;

  constructor(
    private readonly command: string,
    private readonly expected: 'red' | 'green',
    private readonly runner: ChecksRunner,
  ) {}

  get name(): string {
    return `repro-${this.expected}`;
  }

  async run(ctx: CheckContext): Promise<CheckResult> {
    const { exitCode, durationMs, timedOut, outputTail } = await this.runner.run(
      { command: this.command, timeoutSeconds: REPRO_TIMEOUT_SECONDS },
      ctx.projectPath,
    );
    this.exitCode = exitCode;
    // A run killed at the timeout showed neither a failing test nor a passing one.
    const sawExit = !timedOut && exitCode !== null;
    return {
      name: this.name,
      passed: sawExit && (this.expected === 'red' ? exitCode !== 0 : exitCode === 0),
      durationMs,
      timedOut,
      outputTail,
    };
  }
}
