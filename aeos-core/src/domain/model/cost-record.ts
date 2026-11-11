// Domain model — CostRecord: tracks LLM spend per executor invocation

export type CostRole = 'preflight' | 'worker' | 'reviewer';

export interface CostRecord {
  readonly ticketId: string;
  readonly projectId: string;
  readonly column: string;
  readonly agent: string;
  readonly executor: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Null means the executor did not report a cost. Never written as 0. */
  readonly costUsd: number | null;
  readonly recordedAt: string;
  /** Absent on records written before roles were stored (migration v7). */
  readonly role?: CostRole;
}

/** Display text for a cost: an unknown cost is never shown as $0. */
export function formatCostUsd(costUsd: number | null, digits = 4): string {
  return costUsd === null ? 'unknown' : `$${costUsd.toFixed(digits)}`;
}
