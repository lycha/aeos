// Driving port — Costs use case interface (spend report)
//
// The report has the shape `cli-contract.yaml` declares for `aeos costs`.
// A null amount means every record behind it has an unknown cost.

export interface CostsInput {
  /** Project key as typed, e.g. `AEOS`. */
  projectKey?: string;
  /** An epic and its child tasks. */
  epicId?: string;
  ticketId?: string;
  /** `YYYY-MM-DD`. */
  since?: string;
}

/** A total per key: a column, or a run role. */
export type CostBreakdown = Record<string, number | null>;

export interface TicketCost {
  ticketId: string;
  totalUsd: number | null;
  byColumn: CostBreakdown;
  byRole: CostBreakdown;
}

export interface ProjectCost {
  projectId: string;
  totalUsd: number | null;
  byTicket: TicketCost[];
}

export interface CostReport {
  /** Sum of the known costs. */
  totalUsd: number | null;
  /** Records with an unknown cost; they are in no total. */
  unknownRecords: number;
  byProject: ProjectCost[];
}

export type CostsResult =
  | { ok: true; report: CostReport }
  | { ok: false; reason: 'PROJECT_NOT_FOUND' };

export interface CostsPort {
  execute(input: CostsInput): CostsResult;
}
