// Domain model — CostRecord: tracks LLM spend per executor invocation

export interface CostRecord {
  readonly ticketId: string;
  readonly projectId: string;
  readonly column: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
  readonly recordedAt: string;
}
