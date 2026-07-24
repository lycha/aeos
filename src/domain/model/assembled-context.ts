// Value Object — AssembledContext (collected inputs for executor invocation)

export interface PriorArtifact {
  name: string; // e.g. "AEOS-1-prd.md"
  content: string;
}

export interface AssembledContext {
  ticketContent: string;
  settledDecisions: string | null;
  priorArtifacts: PriorArtifact[];
  /**
   * The parent epic's authoritative specification artifacts (PRD, tech spec) for
   * a child task, so the task can be implemented against — and not contradict —
   * the decisions that scoped it. Empty for an epic, or a task whose parent has
   * no such artifacts.
   */
  epicContext: PriorArtifact[];
  constraints: string | null;
  codeDiff: string | null;
}
