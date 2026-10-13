// Driven port — CostRepository: record and query LLM cost entries

import type { CostRecord } from '../../model/cost-record.js';

export interface CostRepository {
  /** Persist a cost record after an executor invocation */
  record(cost: CostRecord): void;

  /** Return all cost records for a given project */
  findByProject(projectId: string): CostRecord[];

  /** Return all cost records for a given ticket */
  findByTicket(projectId: string, ticketId: string): CostRecord[];
}
