// Driven port — ChecksRunner: runs one shell command for a ShellCheck

export interface ChecksRunner {
  /**
   * Runs the command in `cwd`, killing it at the timeout. `outputTail` is the
   * end of its combined stdout and stderr. `exitCode` is null when it was killed.
   */
  run(
    check: { command: string; timeoutSeconds: number },
    cwd: string,
  ): Promise<{
    exitCode: number | null;
    durationMs: number;
    timedOut: boolean;
    outputTail: string;
  }>;
}
