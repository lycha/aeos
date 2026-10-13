// Driven port — ArtifactStore: read/write/list markdown artifacts in .aeos/

export interface ArtifactStore {
  /** Returns true if the artifact file exists on disk */
  artifactExists(projectPath: string, ticketId: string, filename: string): boolean;
  /** Reads artifact content. Throws if file does not exist. */
  readArtifact(projectPath: string, ticketId: string, filename: string): string;
  /** Returns the modification time of an artifact file, or null if it does not exist */
  getArtifactMtime(projectPath: string, ticketId: string, filename: string): Date | null;
  /** Writes an artifact file into .aeos/tickets/<ticketId>/<filename> */
  writeArtifact(projectPath: string, ticketId: string, filename: string, content: string): void;
  /** Removes an artifact file (used for compensating rollback) */
  removeArtifact(projectPath: string, ticketId: string, filename: string): void;
  /** Lists artifact filenames in .aeos/tickets/<ticketId>/ — returns empty array if dir does not exist */
  listArtifacts(projectPath: string, ticketId: string): string[];
}
