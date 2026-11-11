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

  /** Return the output of `git diff HEAD` in the given directory, of `paths` only when given. */
  diff(dir: string, paths?: readonly string[]): string;

  /** True when `dir` is inside a git working tree. */
  isRepo(dir: string): boolean;

  /**
   * Ensures the working tree is on branch `name`. An existing branch is checked
   * out; a new one is created from the default branch's local tip, wherever
   * HEAD is. No-op if already on it. Throws, changing nothing, when uncommitted
   * changes prevent the switch. Used to give an epic its own `aeos/<epicId>`
   * feature branch so task commits accumulate in isolation.
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

  /**
   * Every file that differs from HEAD in `dir`: tracked modifications, staged
   * changes and untracked files, as paths relative to `dir`. Empty when `dir`
   * is not in a repository.
   */
  changedFiles(dir: string): string[];

  /**
   * Puts `paths` (relative to `dir`) back as they are at HEAD: tracked paths
   * are checked out, paths HEAD does not have are deleted.
   */
  restoreFiles(dir: string, paths: string[]): void;

  /** Pushes `branch` to the `origin` remote and sets it as upstream. Throws on failure. */
  push(dir: string, branch: string): void;

  /** The checked-out branch, or '' when HEAD is detached or `dir` is not a repository. */
  currentBranch(dir: string): string;

  /**
   * The branch pull requests target: the remote's HEAD when known, otherwise
   * a local `main`, then `master`. Falls back to 'main'.
   */
  defaultBranch(dir: string): string;

  /** True when the repository at `dir` has at least one remote. */
  hasRemote(dir: string): boolean;

  /** The full hash of `HEAD` in the repository at `dir`. */
  headCommit(dir: string): string;

  /**
   * The content of `path` (relative to `dir`) as it was at `commit`. Throws
   * when the commit or the file cannot be read; never reads the working tree.
   */
  showFile(dir: string, commit: string, path: string): string;

  /**
   * Every file under `path` (relative to `dir`) as of `commit`, as paths
   * relative to `dir`, sorted. Empty when the commit has no such directory;
   * throws when the commit cannot be read.
   */
  listFiles(dir: string, commit: string, path: string): string[];

  /**
   * True when `path` (relative to `dir`) differs between `commit` and `HEAD`,
   * or when `commit` cannot be read. Paths in `excluding` are not compared.
   */
  pathChangedSince(dir: string, commit: string, path: string, excluding?: string[]): boolean;

  /**
   * `Name <email>` from `user.name` and `user.email` as git resolves them in
   * `dir`, or null when either is not configured.
   */
  userIdentity(dir: string): string | null;
}
