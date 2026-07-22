// Value Object — ColumnSpec (loaded from YAML: agent, output artifact, rubrics, preflight config)

export interface ColumnSpec {
  readonly column: string;
  readonly executorMode?: 'artifact' | 'agentic';
  /**
   * Whether an agentic run must leave a git diff to pass validation.
   *
   * True is the IMPLEMENTATION guarantee — agentic code work that changes
   * nothing is a failure. False is for agentic columns whose work is not a
   * repo edit (TASK_BREAKDOWN creates tickets and writes to gitignored .aeos/).
   * Undefined defaults to true, so IMPLEMENTATION keeps its guarantee unstated.
   */
  readonly requiresRepoDiff?: boolean;
  readonly workerAgentFile: string;
  readonly reviewerAgentFile: string;
  readonly outputArtifact: string;
  readonly minWordCount: number;
  readonly requiredSections: string[];
  readonly reviewerRubrics: string[];
  /** Per-column revision cap. Undefined inherits the global `reviewLoop.maxIterations`. */
  readonly maxIterations?: number;
  readonly escalation: 'escalate_to_human' | 'mark_done';
  readonly advanceMode: 'manual' | 'auto';
  readonly preflight: {
    readonly enabled: boolean;
    readonly questionsArtifact: string;
  };
}
