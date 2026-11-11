// Value Object — ExecutorResult (raw output returned from an executor)

/** Token usage reported by the model API */
export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Null when the executor reports tokens but no cost */
  readonly costUsd: number | null;
}

export type ExecutorResult = ExecutorSuccess | ExecutorFailure;

interface ExecutorSuccess {
  readonly ok: true;
  /** Absolute path of the written artifact */
  readonly artifactPath: string;
  /** Raw output text (used by preflight for NO_BLOCKERS check) */
  readonly content?: string;
  /** Token usage if available from the model API; undefined means unknown */
  readonly usage?: TokenUsage;
  /** Full raw executor output stream, when the executor has one */
  readonly transcript?: string;
}

interface ExecutorFailure {
  readonly ok: false;
  /** Human-readable error description */
  readonly reason: string;
}
