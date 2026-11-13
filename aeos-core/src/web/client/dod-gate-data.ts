// Web client — pure logic for DodGateForm (AC-20): which criteria of a
// dry-run conformance report still need a person to vouch for them, and the
// `parameters` object the `--decision` call sends. Kept pure and tested for
// the same reason as decision-form-data.ts.

import type { ConformanceReport } from '../../cli/generated/types.gen.js';

/** Criteria still unverified: the only ones AC-20 lets a person vouch for. */
export function unverifiedCriteriaIds(report: ConformanceReport | null): string[] {
  if (!report) return [];
  return report.criteria.filter((c) => c.verdict === 'unverified').map((c) => c.id);
}

export interface DecisionParametersInput {
  readonly ticketId: string;
  readonly decision: 'approve' | 'reject';
  readonly reviewHash: string | null;
  readonly reason: string;
  readonly verified: ReadonlySet<string>;
}

/** The exact `parameters` object for `ticket dod-approve`'s `--decision` call (contract-named keys). */
export function buildDecisionParameters(
  input: DecisionParametersInput,
): Record<string, string | string[]> {
  const parameters: Record<string, string | string[]> = {
    id: input.ticketId,
    decision: input.decision,
  };
  if (input.reviewHash !== null) parameters['review-hash'] = input.reviewHash;
  if (input.reason.trim().length > 0) parameters.reason = input.reason;
  if (input.verified.size > 0) parameters.verified = [...input.verified];
  return parameters;
}
