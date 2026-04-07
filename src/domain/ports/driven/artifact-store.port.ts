// Driven port — ArtifactStore: read/write/list markdown artifacts in .aeos/

export interface ArtifactStore {
  /** Writes an artifact file into .aeos/tickets/<ticketId>/<filename> */
  writeArtifact(projectPath: string, ticketId: string, filename: string, content: string): void;
  /** Removes an artifact file (used for compensating rollback) */
  removeArtifact(projectPath: string, ticketId: string, filename: string): void;
}
