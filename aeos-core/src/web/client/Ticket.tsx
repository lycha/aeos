// Web client — the ticket detail page (AC-8, AC-9, AC-15, AC-16, AC-17,
// AC-18, AC-22, AC-23): column, sub-state, pinned spec with a spec-moved
// warning, contract change, children, artifacts (rendered inertly, AC-31),
// run records with cost, gate records and pull request, plus every decision
// form `ticket.availableActions` lists — no others (AC-9). When the ticket
// offers a spec approval, the spec-review it rests on is shown inside the
// Decisions section, right beside the approve form (AC-16).

import { useCallback, useEffect, useState } from 'react';

import type { Contract } from '../../cli/contract/contract-schema.js';
import type { AvailableActionId, TicketShowData } from '../../cli/generated/types.gen.js';
import { getContract, postCli } from './api.js';
import { AnswerForm } from './AnswerForm.js';
import { DecisionForm } from './DecisionForm.js';
import { DodGateForm } from './DodGateForm.js';

export interface TicketProps {
  readonly projectKey: string;
  readonly ticketId: string;
}

async function fetchArtifact(projectKey: string, ticketId: string, name: string): Promise<string> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectKey)}/tickets/${encodeURIComponent(ticketId)}/artifacts/${encodeURIComponent(name)}`,
  );
  return res.text();
}

function ArtifactList({
  projectKey,
  ticketId,
  names,
}: {
  readonly projectKey: string;
  readonly ticketId: string;
  readonly names: readonly string[];
}) {
  const [open, setOpen] = useState<Record<string, string>>({});

  const toggle = async (name: string): Promise<void> => {
    if (name in open) {
      setOpen((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
      return;
    }
    const content = await fetchArtifact(projectKey, ticketId, name);
    setOpen((prev) => ({ ...prev, [name]: content }));
  };

  return (
    <ul>
      {names.map((name) => (
        <li key={name}>
          <button type="button" onClick={() => void toggle(name)}>
            {name}
          </button>
          {name in open && <pre>{open[name]}</pre>}
        </li>
      ))}
    </ul>
  );
}

function formatUsd(amount: number | null): string {
  return amount === null ? 'unknown' : `$${amount.toFixed(2)}`;
}

/**
 * The spec-review the approval rests on, shown beside the approve form so the spec
 * is approved from under its review (AC-16) rather than from a generic artifact list.
 */
function SpecReviewBeside({
  projectKey,
  ticketId,
  name,
}: {
  readonly projectKey: string;
  readonly ticketId: string;
  readonly name: string;
}) {
  const [content, setContent] = useState<string | null>(null);
  useEffect(() => {
    void fetchArtifact(projectKey, ticketId, name).then(setContent);
  }, [projectKey, ticketId, name]);
  return (
    <section aria-label="Spec review">
      <h4>Review this approval rests on — {name}</h4>
      {content === null ? <p>Loading…</p> : <pre>{content}</pre>}
    </section>
  );
}

function renderAction(
  action: AvailableActionId,
  ticket: TicketShowData['ticket'],
  projectKey: string,
  ticketId: string,
  contract: Contract,
  refresh: () => void,
) {
  switch (action) {
    case 'ticketApprove': {
      const contractPending =
        ticket.contractChange !== null && ticket.contractChange.approvedBy === null;
      return (
        <DecisionForm
          key={action}
          projectKey={projectKey}
          commandPath="ticket approve"
          command={contract.commands['ticket approve']}
          fixedValues={{ id: ticketId }}
          fields={{ contract: { value: contractPending } }}
          gitIdentity={ticket.gitIdentity}
          submitLabel={contractPending ? 'Approve contract change' : 'Approve'}
          onDone={refresh}
        />
      );
    }
    case 'ticketSignOff':
      return (
        <DecisionForm
          key={action}
          projectKey={projectKey}
          commandPath="ticket sign-off"
          command={contract.commands['ticket sign-off']}
          fixedValues={{ id: ticketId }}
          gitIdentity={ticket.gitIdentity}
          submitLabel="Sign off"
          onDone={refresh}
        />
      );
    case 'ticketReady':
      return (
        <DecisionForm
          key={action}
          projectKey={projectKey}
          commandPath="ticket ready"
          command={contract.commands['ticket ready']}
          fixedValues={{ id: ticketId }}
          submitLabel="Mark ready"
          onDone={refresh}
        />
      );
    case 'ticketRepin':
      return (
        <DecisionForm
          key={action}
          projectKey={projectKey}
          commandPath="ticket repin"
          command={contract.commands['ticket repin']}
          fixedValues={{ id: ticketId }}
          gitIdentity={ticket.gitIdentity}
          submitLabel="Repin"
          onDone={refresh}
        />
      );
    case 'ticketMove':
      return (
        <DecisionForm
          key={action}
          projectKey={projectKey}
          commandPath="ticket move"
          command={contract.commands['ticket move']}
          fixedValues={{ id: ticketId }}
          fields={{
            status: {
              options: (ticket.availableColumns ?? []).map((column) => ({
                value: column.id,
                label: column.label,
              })),
            },
          }}
          gitIdentity={ticket.gitIdentity}
          submitLabel="Move"
          onDone={refresh}
        />
      );
    case 'ticketAnswer':
      return (
        <AnswerForm
          key={action}
          kind="answer"
          projectKey={projectKey}
          ticketId={ticketId}
          gitIdentity={ticket.gitIdentity}
          onDone={refresh}
        />
      );
    case 'ticketResolve':
      return (
        <AnswerForm
          key={action}
          kind="resolve"
          projectKey={projectKey}
          ticketId={ticketId}
          gitIdentity={ticket.gitIdentity}
          onDone={refresh}
        />
      );
    case 'ticketDodApprove':
      return (
        <DodGateForm
          key={action}
          projectKey={projectKey}
          ticketId={ticketId}
          gitIdentity={ticket.gitIdentity}
          onDone={refresh}
        />
      );
    default:
      return null;
  }
}

export function Ticket({ projectKey, ticketId }: TicketProps) {
  const [data, setData] = useState<TicketShowData | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const envelope = await postCli('ticket show', { id: ticketId }, projectKey);
    if (!envelope.ok) {
      setError(envelope.error?.message ?? 'Failed to load the ticket.');
      return;
    }
    setError(null);
    setData(envelope.data as TicketShowData);
  }, [projectKey, ticketId]);

  useEffect(() => {
    void refresh();
    void getContract().then(setContract);
  }, [refresh]);

  if (error) return <p role="alert">{error}</p>;
  if (!data || !contract) return <p>Loading…</p>;

  const { ticket, artifacts, costUsd, children = [], runs = [], gateRecords = [] } = data;
  const specReviewArtifact = artifacts.find((name) => /-spec-review\.md$/.test(name));

  return (
    <article>
      <h2>{ticket.title}</h2>
      <p>
        {ticket.columnLabel}
        {ticket.subState ? ` · ${ticket.subState}` : ''}
      </p>
      {ticket.specPin && (
        <p>
          Spec pin: {ticket.specPin.repo}@{ticket.specPin.commit} ({ticket.specPin.path})
          {ticket.specMoved && <strong> — the pinned spec has moved since</strong>}
        </p>
      )}
      {ticket.contractChange && (
        <section aria-label="Contract change">
          <h3>Contract change</h3>
          <ul>
            {ticket.contractChange.paths.map((path) => (
              <li key={path}>{path}</li>
            ))}
          </ul>
          <p>
            {ticket.contractChange.approvedBy
              ? `Approved (gate ${ticket.contractChange.approvedBy})`
              : 'Not yet approved'}
          </p>
        </section>
      )}
      {ticket.escalation && (
        <section aria-label="Escalation">
          <h3>Escalation</h3>
          <p>{ticket.escalation.reason}</p>
          <p>{ticket.escalation.message}</p>
        </section>
      )}
      <p>
        {ticket.pullRequestUrl ? (
          <a href={ticket.pullRequestUrl}>Pull request</a>
        ) : (
          'No pull request'
        )}
      </p>
      <p>Cost: {formatUsd(costUsd)}</p>

      <section aria-label="Children">
        <h3>Children</h3>
        <ul>
          {children.map((child) => (
            <li key={child.id}>
              {child.id} — {child.title} ({child.columnLabel}
              {child.subState ? ` · ${child.subState}` : ''})
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Artifacts">
        <h3>Artifacts</h3>
        <ArtifactList projectKey={projectKey} ticketId={ticketId} names={artifacts} />
      </section>

      <section aria-label="Runs">
        <h3>Runs</h3>
        <ul>
          {runs.map((run) => (
            <li key={run.run_id}>
              {run.column} · {run.role} · {run.agent ?? run.executor}
              {run.model ? ` · ${run.model}` : ''}
              {run.mode ? ` · ${run.mode}` : ''} · attempt {run.attempt} · {run.verdict ?? run.exit}{' '}
              · {formatUsd(run.cost_usd)}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Gate records">
        <h3>Gate records</h3>
        <ul>
          {gateRecords.map((record) => (
            <li key={record.id}>
              {record.gate} · {record.verdict} · {record.decided_by} · {record.decided_at}
              {record.reason ? ` — ${record.reason}` : ''}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Decisions">
        <h3>Decisions</h3>
        {(ticket.availableActions ?? []).includes('ticketApprove') && specReviewArtifact && (
          <SpecReviewBeside projectKey={projectKey} ticketId={ticketId} name={specReviewArtifact} />
        )}
        {(ticket.availableActions ?? []).map((action) =>
          renderAction(action, ticket, projectKey, ticketId, contract, () => void refresh()),
        )}
      </section>
    </article>
  );
}
