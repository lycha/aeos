// Domain model — GateRecord: one human decision at a gate, as committed to
// gates.yaml. Mirrors gates.schema.json field for field, which is why the
// field names are snake_case.

import type { SpecPin } from './spec-pin.js';

/** The gates this engine records. The schema lists more; their tasks add them. */
export type GateKind =
  | 'spec'
  | 'column-approval'
  | 'definition-of-done'
  | 'sign-off-override'
  | 'move-override'
  | 'answer'
  | 'escalation-resolution'
  | 'amendment'
  | 'repin';

export type GateVerdict = 'approved' | 'rejected' | 'overridden';

/** A reference triple, as in the artefact schemas. */
export interface GateRef {
  readonly repo: string;
  readonly commit: string;
  readonly path: string;
}

export interface GateRecord {
  /** `GATE-<n>`, sequential within its file. */
  readonly id: string;
  readonly gate: GateKind;
  readonly ticket: string;
  /** Column identifiers, never labels. */
  readonly column: string | null;
  readonly from_column: string | null;
  readonly to_column: string | null;
  /** The person, from the project repository's git identity. Never an agent. */
  readonly decided_by: string;
  readonly decided_at: string;
  readonly verdict: GateVerdict;
  /** Present on every override and rejection; at least ten characters. */
  readonly reason?: string;
  /** Run id of the review or checks verdict this decision overrode, if any. */
  readonly overrides: string | null;
  /** What the person was shown: review, checks, run records. */
  readonly evidence: readonly GateRef[];
  readonly spec_pin: SpecPin | null;
}
