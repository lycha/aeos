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

  /**
   * Stage everything in `dir` and commit it, if there is anything to commit.
   * Returns true when a commit was created, false when the tree was clean.
   *
   * Unlike `commit`, this never creates an empty commit — it operates on a
   * user's source repository, where empty commits are noise.
   */
  commitAll(dir: string, message: string): boolean;

  /** Return the output of `git diff HEAD` in the given directory. */
  diff(dir: string): string;

  /** True when `dir` is inside a git working tree. */
  isRepo(dir: string): boolean;

  /**
   * Ensures the working tree is on branch `name`, creating it from the current
   * HEAD if it does not exist. Preserves uncommitted changes. No-op if already
   * on it. Used to give an epic its own `aeos/<epicId>` feature branch so task
   * commits accumulate in isolation.
   */
  ensureOnBranch(dir: string, name: string): void;

  /**
   * Creates a lightweight tag at the current HEAD if it does not already exist.
   * Used to mark an epic branch's base commit (`aeos-base/<epicId>`) so the
   * whole-feature diff can be computed later without stored state.
   */
  tagHere(dir: string, name: string): void;

  /** Returns `git diff <from> <to>` (e.g. a tag..HEAD range). */
  diffRange(dir: string, from: string, to: string): string;

  /** True when `ref` resolves in the repo (branch, tag, or commit). */
  refExists(dir: string, ref: string): boolean;
}
