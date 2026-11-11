// Driven port — TestReportReader: the results of the project's own test run.

export interface TestResult {
  /** The test's full name: its `describe` titles, then its own. */
  readonly name: string;
  /** The test file, as the report names it. */
  readonly file: string;
  readonly status: 'pass' | 'fail' | 'skipped';
}

export interface TestReportReader {
  /**
   * Every test in the report at `reportPath`. `format` is `criteria.testReport.format`
   * of `project.json`; a reader throws on a format it does not read, so a new
   * format is a new adapter and no caller changes.
   */
  read(reportPath: string, format: string): TestResult[];
}
