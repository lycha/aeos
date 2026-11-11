// Driven port — FileHasher: the content identity of files in a working tree

export interface FileHasher {
  /**
   * The SHA-256 (hex) of each of `paths`, relative to `dir`, as it is on disk
   * now; null for a path that is not a readable file.
   */
  sha256(dir: string, paths: readonly string[]): Record<string, string | null>;
}
