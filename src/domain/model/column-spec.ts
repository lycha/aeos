// Value Object — ColumnSpec (loaded from YAML: agent, output artifact, rubrics, preflight config)

export interface ColumnSpec {
  readonly column: string;
  readonly phase?: 'PLAN' | 'PREPARE' | 'BUILD' | 'DEPLOY';
  readonly workerAgentFile: string;
  readonly reviewerAgentFile: string;
  readonly outputArtifact: string;
  readonly minWordCount: number;
  readonly requiredSections: string[];
  readonly reviewerRubrics: string[];
  readonly maxIterations: number;
  readonly escalation: 'escalate_to_human' | 'mark_done';
  readonly advanceMode: 'manual' | 'auto';
  readonly preflight: {
    readonly enabled: boolean;
    readonly questionsArtifact: string;
  };
}
