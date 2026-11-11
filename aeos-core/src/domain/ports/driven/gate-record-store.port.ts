// Driven port — GateRecordStore: the append-only log of human gate decisions.

import type { GateRecord } from '../../model/gate-record.js';

export interface GateRecordStore {
  /**
   * Appends the record to the gates file of its feature (`spec_pin`) or, with
   * no pin, of its ticket, gives it the next `GATE-<n>` of that file, and
   * commits the file. Earlier records are never rewritten. Throws when the
   * record cannot be written; nothing is left behind then.
   *
   * `alongside` is given the numbered record and returns files (name →
   * content) to write beside the gates file and commit with it, for what must
   * be in the same commit as the decision.
   */
  append(
    projectPath: string,
    record: Omit<GateRecord, 'id'>,
    alongside?: (numbered: GateRecord) => Readonly<Record<string, string>>,
  ): GateRecord;

  /** Records in file order, of one feature, of one ticket, or all of them. */
  list(projectPath: string, filter?: { feature?: string; ticketId?: string }): GateRecord[];
}
