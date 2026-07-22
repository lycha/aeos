// Driven port — GitGateway: commit artifacts to .aeos/.git

export interface GitGateway {
  /** Initialise a git repository at the given directory */
  init(dir: string): void;

  /** Stage all changes in `dir` and commit with the given message */
  commit(dir: string, message: string): void;

  /**
   * Stage specific files and commit them to the git repo at `dir`.
   * All files must be inside `dir`. Silently skips if nothing to commit.
   */
  commitFiles(dir: string, files: string[], message: string): void;

  /**
   * Stage every change in `dir` (`git add -A`) without committing.
   *
   * Used after an agentic implementation so newly created files become tracked:
   * `git diff HEAD` ignores untracked files, so a task that only adds files
   * (a migration, a new module) would otherwise look like it changed nothing,
   * and downstream review/QA would see the work as "untracked".
   */
  stageAll(dir: string): void;

  /** Return the output of `git diff HEAD` in the given directory. */
  diff(dir: string): string;
}
