// Domain model — ConformanceReport: a verdict per acceptance criterion, naming
// the instrument that produced it. Mirrors conformance.schema.json field for
// field, which is why the field names are snake_case.

import type { SpecPin } from './spec-pin.js';

export type ConformanceVerdict = 'pass' | 'fail' | 'unverified';

export interface ConformanceInstrument {
  readonly kind: 'test' | 'scenario' | 'check' | 'agent' | 'human';
  readonly name: string;
  readonly result: 'pass' | 'fail';
  /** Path to the report, run record or gate record. */
  readonly evidence?: string;
}

export interface ConformanceCriterion {
  /** `AC-12`, `AC-12a`. */
  readonly id: string;
  readonly verdict: ConformanceVerdict;
  /** Tasks that declared `Implements:` for this criterion. */
  readonly claimed_by?: readonly string[];
  /** What answered. Empty only when the verdict is `unverified`. */
  readonly instruments: readonly ConformanceInstrument[];
  readonly notes?: string;
}

export interface ConformanceReport {
  readonly schema_version: 0;
  readonly meta: {
    readonly feature: string;
    readonly epic: string;
    /** The pinned spec the code was judged against. */
    readonly spec: SpecPin;
    readonly code: { readonly repo: string; readonly commit: string; readonly base?: string };
    readonly generated_at: string;
  };
  readonly criteria: readonly ConformanceCriterion[];
  readonly non_goals?: readonly string[];
  readonly summary: {
    readonly total: number;
    readonly pass: number;
    readonly fail: number;
    readonly unverified: number;
  };
}
