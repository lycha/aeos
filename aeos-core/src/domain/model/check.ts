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
  /**
   * Files the check wrote into the ticket directory, the one to read first
   * first. They are committed with the stage's run record.
   */
  readonly artifacts?: readonly string[];
}

export interface Check {
  readonly name: string;
  /**
   * `post-worker`: after the worker, before the reviewer; a failure goes back
   * to the worker. `pre-worker`: before any agent runs; a failure cannot be
   * fixed by a worker that has not run, so it escalates to a person.
   */
  readonly phase: 'post-worker' | 'pre-worker';
  run(ctx: CheckContext): Promise<CheckResult>;
}
