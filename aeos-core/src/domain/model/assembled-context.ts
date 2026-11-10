// Value Object — AssembledContext (collected inputs for executor invocation)

import type { SpecPin } from './spec-pin.js';

export interface PriorArtifact {
  name: string; // e.g. "AEOS-1-tech-spec.md"
  content: string;
}

export interface AssembledContext {
  ticketContent: string;
  settledDecisions: string | null;
  priorArtifacts: PriorArtifact[];
  /**
   * The parent epic's tech spec for
   * a child task, so the task can be implemented against — and not contradict —
   * the decisions that scoped it. Empty for an epic, or a task whose parent has
   * none.
   */
  epicContext: PriorArtifact[];
  /**
   * The human-written spec of a spec-backed ticket, as it was at the pinned
   * commit: `spec.md`, `decisions.yaml`, every `.feature`, the context's
   * glossary. Empty for a ticket with no pin.
   */
  spec: PriorArtifact[];
  /** The revision `spec` was read at; null for a ticket with no pin. */
  specPin: SpecPin | null;
  constraints: string | null;
  codeDiff: string | null;
}
