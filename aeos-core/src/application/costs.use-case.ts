// Use case — Costs (spend report)

import type { CostRecord } from '../domain/model/cost-record.js';
import type { ConfigStore } from '../domain/ports/driven/config-store.port.js';
import type { CostRepository } from '../domain/ports/driven/cost-repository.port.js';
import type {
  CostBreakdown,
  CostsInput,
  CostsPort,
  CostsResult,
} from '../domain/ports/driving/costs.port.js';

/** Sum of the known costs. Null when there are records and none is known: unknown is not zero. */
function total(records: CostRecord[]): number | null {
  const known = records.flatMap((record) => (record.costUsd === null ? [] : [record.costUsd]));
  if (records.length > 0 && known.length === 0) return null;
  return known.reduce((sum, cost) => sum + cost, 0);
}

function groupBy(
  records: CostRecord[],
  key: (record: CostRecord) => string,
): [string, CostRecord[]][] {
  const groups = new Map<string, CostRecord[]>();
  for (const record of records) {
    const group = groups.get(key(record));
    if (group) group.push(record);
    else groups.set(key(record), [record]);
  }
  return [...groups];
}

function breakdown(records: CostRecord[], key: (record: CostRecord) => string): CostBreakdown {
  return Object.fromEntries(groupBy(records, key).map(([name, group]) => [name, total(group)]));
}

export class CostsUseCase implements CostsPort {
  constructor(
    private readonly costRepo: CostRepository,
    private readonly configStore: ConfigStore,
  ) {}

  execute(input: CostsInput): CostsResult {
    let projectId: string | undefined;
    if (input.projectKey) {
      const key = input.projectKey.toUpperCase();
      projectId = this.configStore.readRegistry().find((entry) => entry.key === key)?.id;
      if (!projectId) return { ok: false, reason: 'PROJECT_NOT_FOUND' };
    }

    const records = this.costRepo.findByFilters({
      projectId,
      epicId: input.epicId,
      ticketId: input.ticketId,
      since: input.since,
    });

    return {
      ok: true,
      report: {
        totalUsd: total(records),
        unknownRecords: records.filter((record) => record.costUsd === null).length,
        byProject: groupBy(records, (record) => record.projectId).map(([id, ofProject]) => ({
          projectId: id,
          totalUsd: total(ofProject),
          byTicket: groupBy(ofProject, (record) => record.ticketId).map(([ticketId, ofTicket]) => ({
            ticketId,
            totalUsd: total(ofTicket),
            byColumn: breakdown(ofTicket, (record) => record.column),
            // Records from before migration v7 carry no role.
            byRole: breakdown(ofTicket, (record) => record.role ?? 'unrecorded'),
          })),
        })),
      },
    };
  }
}
