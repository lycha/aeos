// Driven port — CostRepository: record and query LLM cost entries

import type { CostRecord } from '../../model/cost-record.js';

export interface CostFilters {
  readonly projectId?: string;
  readonly ticketId?: string;
  /** An epic and every one of its child tasks. */
  readonly epicId?: string;
  /** Records from this date on (`YYYY-MM-DD`). */
  readonly since?: string;
}

export interface CostRepository {
  /** Persist a cost record after an executor invocation */
  record(cost: CostRecord): void;

  /** Return all cost records for a given project */
  findByProject(projectId: string): CostRecord[];

  /** Return all cost records for a given ticket */
  findByTicket(projectId: string, ticketId: string): CostRecord[];

  /** Return the cost records of every project that match all given filters */
  findByFilters(filters: CostFilters): CostRecord[];
}
