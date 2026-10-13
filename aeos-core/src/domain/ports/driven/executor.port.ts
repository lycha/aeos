// Driven port — Executor: run(invocation): Promise<ExecutorResult>

import type { ExecutorInvocation } from '../../model/executor-invocation.js';
import type { ExecutorResult } from '../../model/executor-result.js';

export interface Executor {
  /** Execute a prompt and write the artifact to the specified output path. */
  run(invocation: ExecutorInvocation): Promise<ExecutorResult>;

  /**
   * Interrupt a running execution. Kills any in-flight process.
   * No-op if nothing is running. Used by `aeos ticket interrupt`.
   */
  interrupt(): Promise<void>;
}
