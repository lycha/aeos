// Web client — the release gate form (AC-20, AC-21): a dry-run preview of
// the conformance table and pull request, letting the person vouch for each
// still-unverified criterion, then a decision (approve/reject + reason)
// proved against the dry-run's own `reviewHash`. A report that changed
// between the two calls comes back `CONFORMANCE_CHANGED` (AC-21) — the fix is
// a fresh dry-run, never resubmitting the stale hash.

import { useCallback, useEffect, useState } from 'react';

import type { ConformanceReport } from '../../cli/generated/types.gen.js';
import { postCli } from './api.js';
import { buildDecisionParameters, unverifiedCriteriaIds } from './dod-gate-data.js';

export interface DodGateFormProps {
  readonly projectKey: string;
  readonly ticketId: string;
  readonly gitIdentity?: string | null;
  readonly onDone: () => void;
}

interface DryRunData {
  readonly report: ConformanceReport | null;
  readonly prUrl: string | null;
  readonly reviewHash: string | null;
}

export function DodGateForm({ projectKey, ticketId, gitIdentity, onDone }: DodGateFormProps) {
  const [dryRun, setDryRun] = useState<DryRunData | null>(null);
  const [verified, setVerified] = useState<Set<string>>(new Set());
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadDryRun = useCallback(async () => {
    const envelope = await postCli(
      'ticket dod-approve',
      { id: ticketId, 'dry-run': true, verified: [...verified] },
      projectKey,
    );
    if (!envelope.ok) {
      setError(envelope.error?.message ?? 'Failed to load the conformance report.');
      return;
    }
    setError(null);
    setDryRun(envelope.data as DryRunData);
  }, [projectKey, ticketId, verified]);

  // Only on mount: toggling a vouch checkbox updates `verified` locally
  // without re-fetching, since the decision call must match the dry-run's
  // own reviewHash, not a hash from after the toggle.
  useEffect(() => {
    void loadDryRun();
  }, []);

  const toggleVerified = (id: string): void => {
    setVerified((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async (event: { preventDefault: () => void }): Promise<void> => {
    event.preventDefault();
    if (!dryRun) return;
    setBusy(true);
    setError(null);
    const envelope = await postCli(
      'ticket dod-approve',
      buildDecisionParameters({
        ticketId,
        decision,
        reviewHash: dryRun.reviewHash,
        reason,
        verified,
      }),
      projectKey,
    );
    setBusy(false);
    if (!envelope.ok) {
      if (envelope.error?.code === 'CONFORMANCE_CHANGED') {
        setError('The conformance report changed since it was reviewed. Reloading it.');
        void loadDryRun();
        return;
      }
      setError(envelope.error?.message ?? 'The decision failed.');
      return;
    }
    onDone();
  };

  if (!dryRun) return <p>{error ?? 'Loading…'}</p>;

  const unverified = unverifiedCriteriaIds(dryRun.report);

  return (
    <form onSubmit={(event) => void submit(event)}>
      {gitIdentity !== undefined && (
        <p>Recorded as: {gitIdentity ?? 'no git identity configured'}</p>
      )}
      <table>
        <tbody>
          {(dryRun.report?.criteria ?? []).map((criterion) => (
            <tr key={criterion.id}>
              <td>{criterion.id}</td>
              <td>{criterion.verdict}</td>
              <td>
                {unverified.includes(criterion.id) && (
                  <label>
                    Vouch for this
                    <input
                      type="checkbox"
                      checked={verified.has(criterion.id)}
                      onChange={() => toggleVerified(criterion.id)}
                    />
                  </label>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>Pull request: {dryRun.prUrl ?? 'none'}</p>
      <label>
        Decision
        <select
          value={decision}
          onChange={(event) => setDecision(event.target.value as 'approve' | 'reject')}
        >
          <option value="approve">Approve</option>
          <option value="reject">Reject</option>
        </select>
      </label>
      <label>
        Reason
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy}>
        Record decision
      </button>
    </form>
  );
}
