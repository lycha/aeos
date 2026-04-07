// Driven port — GitGateway: commit artifacts to .aeos/.git

export interface GitGateway {
  /** Initialise a git repository at the given directory */
  init(dir: string): void;
  /** Stage all changes and commit with the given message */
  commit(dir: string, message: string): void;
}
