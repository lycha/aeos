// Driven port — GitGateway: commit artifacts to .aeos/.git

export interface GitGateway {
  /** Initialise a git repository at the given directory */
  init(dir: string): void;
}
