// Domain model — Check: one thing that must hold before a model is asked to
// review. A check is an interface, not a command: the stage that runs checks
// knows nothing about processes or exit codes.

export interface CheckContext {
  readonly projectPath: string;
}

export interface CheckResult {
  readonly name: string;
  readonly passed: boolean;
  readonly durationMs: number;
  readonly timedOut: boolean;
  /** The end of what the check printed; what the next worker attempt is given. */
  readonly outputTail: string;
}

export interface Check {
  readonly name: string;
  readonly phase: 'post-worker';
  run(ctx: CheckContext): Promise<CheckResult>;
}
