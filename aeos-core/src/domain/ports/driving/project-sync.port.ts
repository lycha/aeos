// Driving port — ProjectSync use case interface

/** How a project's copy compares to the current template. */
export type SyncStatus = 'missing' | 'drifted' | 'unchanged';

/** What sync did about it on this run. */
export type SyncAction = 'added' | 'updated' | 'none';

export interface SyncFileOutcome {
  readonly relativePath: string;
  readonly status: SyncStatus;
  readonly action: SyncAction;
  /** Set when a drifted file was overwritten and its prior content backed up. */
  readonly backupPath?: string;
  /** Current template content — carried for `--diff` rendering. */
  readonly templateContent: string;
  /** The project's copy, or null when missing — carried for `--diff`. */
  readonly projectContent: string | null;
}

export interface ProjectSyncInput {
  readonly projectPath: string;
  /** Write files that are missing from the project. */
  readonly apply: boolean;
  /** Also overwrite drifted files (each backed up first). Implies `apply`. */
  readonly force: boolean;
}

export interface ProjectSyncResult {
  readonly files: SyncFileOutcome[];
}

export interface ProjectSyncPort {
  execute(input: ProjectSyncInput): ProjectSyncResult;
}
