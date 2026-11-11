// Value Object — ColumnSpec (loaded from YAML: agent, output artifact, rubrics, preflight config)

/**
 * What a column is for, whatever it is called. The vocabulary is the approved
 * one of `templates/pipelines.yaml`:
 *
 * - `standard`: worker → checks → reviewer → gate.
 * - `spec-review`: the worker reviews the pinned spec; the approval that follows is the spec gate.
 * - `decomposition`: the worker creates child tickets; the epic cannot leave until every child is DONE.
 * - `integration`: the worker reviews the whole epic; criteria are traced first, and approving out opens the pull request.
 * - `final-gate`: approval is `ticket dod-approve`, on the conformance report; never auto-advances.
 */
export const COLUMN_ROLES = [
  'standard',
  'spec-review',
  'decomposition',
  'integration',
  'final-gate',
] as const;
export type ColumnRole = (typeof COLUMN_ROLES)[number];

/** The diff a column's agents are given: none, one task's working tree, or the epic's `base..HEAD`. */
export const DIFF_CONTEXTS = ['none', 'task', 'epic'] as const;
export type DiffContext = (typeof DIFF_CONTEXTS)[number];

export interface ColumnSpec {
  readonly column: string;
  /** The name a person sees for the column. Absent means the identifier in sentence case. */
  readonly label?: string;
  /** Absent means `standard`. */
  readonly role?: ColumnRole;
  /** Absent means `none`. */
  readonly diffContext?: DiffContext;
  /** Absent means `artifact`: a column whose worker edits the repository says `agentic`. */
  readonly executorMode?: 'artifact' | 'agentic';
  /**
   * Whether an agentic run must leave a git diff to pass validation.
   *
   * True is the guarantee of a column that writes code — agentic work that
   * changes nothing is a failure. False is for agentic columns whose work is
   * not a repo edit (decomposition creates tickets and writes to gitignored
   * .aeos/). Undefined defaults to true.
   */
  readonly requiresRepoDiff?: boolean;
  /** Run the project's checks after validation and before the reviewer. Absent means false. */
  readonly runChecks?: boolean;
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
