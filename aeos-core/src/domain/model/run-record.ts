// Domain model — RunRecord: one executor invocation, as committed to
// .aeos/tickets/<ticket>/runs/. Mirrors run-record.schema.json field for field,
// which is why the field names are snake_case.

export interface RunRecord {
  readonly schema_version: 0;
  readonly run_id: string;
  readonly project: string;
  readonly ticket: string;
  readonly column: string;
  readonly role: 'preflight' | 'worker' | 'checks' | 'reviewer' | 'generator';
  readonly agent: string | null;
  readonly attempt: number;
  readonly executor: string;
  readonly model: string | null;
  readonly mode: 'artifact' | 'agentic' | null;
  readonly brief: { readonly path: string; readonly sha256: string } | null;
  readonly output: string | null;
  readonly transcript: string | null;
  readonly verdict:
    | 'APPROVED'
    | 'APPROVED_WITH_WARNINGS'
    | 'REJECTED'
    | 'UNPARSEABLE'
    | 'CHECKS_PASSED'
    | 'CHECKS_FAILED'
    | null;
  readonly started_at: string;
  readonly ended_at: string;
  readonly duration_ms: number;
  readonly exit: 'ok' | 'failed' | 'interrupted' | 'timeout';
  readonly usage: {
    readonly input_tokens: number;
    readonly output_tokens: number;
    readonly cache_creation_input_tokens?: number;
    readonly cache_read_input_tokens?: number;
  } | null;
  /** Null means unknown. Never 0 for unknown. */
  readonly cost_usd: number | null;
  readonly cost_basis: 'executor-estimate' | 'computed' | 'none' | 'unknown';
  readonly spec_pin: {
    readonly repo: string;
    readonly commit: string;
    readonly path: string;
  } | null;
  readonly error: string | null;
}

/** Where a run's three files live, relative to `.aeos/`. */
export function runRecordPaths(
  ticketId: string,
  runId: string,
): { record: string; brief: string; transcript: string } {
  const base = `tickets/${ticketId}/runs/${runId}`;
  return { record: `${base}.json`, brief: `${base}.brief.md`, transcript: `${base}.log` };
}
