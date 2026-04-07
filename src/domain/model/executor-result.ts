// Value Object — ExecutorResult (raw output returned from an executor)

/** Token usage reported by the model API */
export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
}

export type ExecutorResult = ExecutorSuccess | ExecutorFailure;

interface ExecutorSuccess {
  readonly ok: true;
  /** Absolute path of the written artifact */
  readonly artifactPath: string;
  /** Token usage if available from the model API */
  readonly usage?: TokenUsage;
}

interface ExecutorFailure {
  readonly ok: false;
  /** Human-readable error description */
  readonly reason: string;
}
