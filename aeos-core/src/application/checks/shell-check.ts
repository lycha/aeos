// A check that is a shell command from `.aeos/project.json`. Command strings
// and exit codes live here and nowhere else.

import type { Check, CheckContext, CheckResult } from '../../domain/model/check.js';
import type { CheckConfig } from '../../domain/model/project-executor-config.js';
import type { ChecksRunner } from '../../domain/ports/driven/checks-runner.port.js';

export class ShellCheck implements Check {
  readonly phase = 'post-worker';

  constructor(
    private readonly config: CheckConfig,
    private readonly runner: ChecksRunner,
  ) {}

  get name(): string {
    return this.config.name;
  }

  async run(ctx: CheckContext): Promise<CheckResult> {
    const { exitCode, durationMs, timedOut, outputTail } = await this.runner.run(
      { command: this.config.command, timeoutSeconds: this.config.timeoutSeconds },
      ctx.projectPath,
    );
    return {
      name: this.config.name,
      passed: exitCode === 0 && !timedOut,
      durationMs,
      timedOut,
      outputTail,
    };
  }
}
