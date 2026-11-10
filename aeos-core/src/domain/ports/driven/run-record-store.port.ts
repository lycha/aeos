// Driven port — RunRecordStore: persist and list run records for a ticket

import type { RunRecord } from '../../model/run-record.js';

export interface RunRecordStore {
  /**
   * Writes the record, the brief (when the run had a prompt) and the raw
   * output under `.aeos/tickets/<ticket>/runs/`. Returns the absolute paths of
   * the files written, for the caller to commit.
   */
  write(
    projectPath: string,
    record: RunRecord,
    files: { brief?: string; transcript: string },
  ): string[];

  /** Records for a ticket, oldest first. Does not read briefs or logs. */
  list(projectPath: string, ticketId: string): RunRecord[];
}
