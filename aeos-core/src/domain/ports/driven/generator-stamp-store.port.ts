// Driven port — GeneratorStampStore: the hash of each generator's inputs as of
// its last successful run in this working copy (`.aeos/tmp/generators.json`)

export interface GeneratorStampStore {
  /** By generator name. Empty when nothing has run. */
  read(projectPath: string): Record<string, string>;
  write(projectPath: string, stamps: Record<string, string>): void;
}
