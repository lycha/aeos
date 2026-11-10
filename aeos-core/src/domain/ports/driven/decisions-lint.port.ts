// Driven port — DecisionsLint: is a feature's decision log fit to build from?

export interface DecisionsLintResult {
  /** The schema validator's messages. */
  readonly schemaErrors: string[];
  /** Errors from `lint_decisions.py` that are not schema errors. */
  readonly lintErrors: string[];
  /** Ids of decisions, conflicts and questions whose outcome is `ESCALATED`. */
  readonly escalated: string[];
}

export interface DecisionsLint {
  /** Which of the files an epic needs (`spec.md`, `decisions.yaml`) the feature lacks. */
  missingFiles(featureDir: string): string[];
  /**
   * Validates and lints `features/<feature>` of the tree at `treeRoot`.
   * Throws, naming the resource, when the linter cannot run (no `python3`).
   */
  lint(treeRoot: string, feature: string): DecisionsLintResult;
}
