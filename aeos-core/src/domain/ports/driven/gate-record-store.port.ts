// Driven port — GateRecordStore: the append-only log of human gate decisions.

import type { GateRecord } from '../../model/gate-record.js';

export interface GateRecordStore {
  /**
   * Appends the record to the gates file of its feature (`spec_pin`) or, with
   * no pin, of its ticket, gives it the next `GATE-<n>` of that file, and
   * commits the file. Earlier records are never rewritten. Throws when the
   * record cannot be written; nothing is left behind then.
   */
  append(projectPath: string, record: Omit<GateRecord, 'id'>): GateRecord;

  /** Records in file order, of one feature, of one ticket, or all of them. */
  list(projectPath: string, filter?: { feature?: string; ticketId?: string }): GateRecord[];
}
