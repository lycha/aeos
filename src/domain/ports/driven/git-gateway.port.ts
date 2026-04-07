// Driven port — GitGateway: commit artifacts to .aeos/.git

export interface GitGateway {
  /** Initialise a git repository at the given directory */
  init(dir: string): void;
  /** Stage all changes and commit with the given message */
  commit(dir: string, message: string): void;

  /**
   * Stages the given files and commits them to the .aeos/.git repo.
   * Format-agnostic — message format construction is the caller's responsibility.
   *
   * @param message  Commit message (any string — callers use the system design format)
   * @param files    Array of absolute paths to stage (must be inside .aeos/)
   * @param root     Optional project root directory; defaults to auto-detected root
   */
  commitFiles(message: string, files: string[], root?: string): Promise<void>;
}
