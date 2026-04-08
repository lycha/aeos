// Value Object — AssembledContext (collected inputs for executor invocation)

export interface PriorArtifact {
  name: string; // e.g. "AEOS-1-prd.md"
  content: string;
}

export interface AssembledContext {
  ticketContent: string;
  priorArtifacts: PriorArtifact[];
  constraints: string | null;
  codeDiff: string | null;
}
