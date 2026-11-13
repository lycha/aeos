// Web client — the costs view (AC-26): spend by project and by role, via
// the existing `costs` command through the generic proxy. `costs` itself is
// project-independent (CostsUseCase aggregates across every project from
// the global state.db), but `server.ts`'s generic proxy route requires a
// `projectKey` on every `/api/cli/*path` call regardless of whether the
// target command needs one, so a valid `projectKey` is still required here
// to pick a project whose directory the proxy can spawn the CLI from — it
// has no effect on the (global) data returned. An unknown cost renders as
// "unknown" and is never folded into a total — `CostsUseCase` already
// computes every total that way; this view only has to display it as given.

import { useEffect, useState } from 'react';

import type { CostsData } from '../../cli/generated/types.gen.js';
import { postCli } from './api.js';

export interface CostsProps {
  readonly projectKey: string;
}

function formatUsd(amount: number | null): string {
  return amount === null ? 'unknown' : `$${amount.toFixed(2)}`;
}

function BreakdownRows({ breakdown }: { readonly breakdown: Record<string, number | null> }) {
  return (
    <ul>
      {Object.entries(breakdown).map(([name, costUsd]) => (
        <li key={name}>
          {name}: {formatUsd(costUsd)}
        </li>
      ))}
    </ul>
  );
}

export function Costs({ projectKey }: CostsProps) {
  const [report, setReport] = useState<CostsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void postCli('costs', {}, projectKey).then((envelope) => {
      if (!envelope.ok) {
        setError(envelope.error?.message ?? 'Failed to load costs.');
        return;
      }
      setReport(envelope.data as CostsData);
    });
  }, [projectKey]);

  if (error) return <p role="alert">{error}</p>;
  if (!report) return <p>Loading…</p>;

  return (
    <section aria-label="Costs">
      <h2>Costs</h2>
      {report.byProject.length === 0 ? (
        <p>No cost data recorded yet.</p>
      ) : (
        report.byProject.map((project) => (
          <article key={project.projectId}>
            <h3>
              {project.projectId} — {formatUsd(project.totalUsd)}
            </h3>
            {project.byTicket.map((ticket) => (
              <div key={ticket.ticketId}>
                <h4>
                  {ticket.ticketId} — {formatUsd(ticket.totalUsd)}
                </h4>
                <p>By role:</p>
                <BreakdownRows breakdown={ticket.byRole} />
              </div>
            ))}
          </article>
        ))
      )}
      <p>Total: {formatUsd(report.totalUsd)}</p>
      {report.unknownRecords > 0 && (
        <p>{report.unknownRecords} record(s) with unknown cost are not included.</p>
      )}
    </section>
  );
}
