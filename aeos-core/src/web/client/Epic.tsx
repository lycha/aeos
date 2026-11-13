// Web client — the epic detail page (AC-23, AC-25): status, budget, spend,
// and any halt with its reason, plus run/pause/resume/clear-budget. The
// live step-by-step view a run in progress would show, and the step history
// of a finished run, are the run-progress view's job (T-014, out of this
// ticket's scope per WEB-14 decision D-001/NEW-8) — while a run is in
// progress this page says so without rendering its steps.

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import type { Contract } from '../../cli/contract/contract-schema.js';
import type { OrchestratorStatusData } from '../../cli/generated/types.gen.js';
import { getContract, postCli, startOrchestratorRun } from './api.js';
import { DecisionForm } from './DecisionForm.js';
import { go } from './router.js';

export interface EpicProps {
  readonly projectKey: string;
  readonly epicId: string;
}

function formatUsd(amount: number | null): string {
  return amount === null ? 'unknown' : `$${amount.toFixed(2)}`;
}

export function Epic({ projectKey, epicId }: EpicProps) {
  const [state, setState] = useState<OrchestratorStatusData['epics'][number] | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [budget, setBudget] = useState('');
  const [maxSteps, setMaxSteps] = useState('');

  const refresh = useCallback(async () => {
    const envelope = await postCli('orchestrator status', { epicId }, projectKey);
    if (!envelope.ok) {
      setError(envelope.error?.message ?? 'Failed to load the epic.');
      return;
    }
    setError(null);
    const data = envelope.data as OrchestratorStatusData;
    setState(data.epics.find((epic) => epic.epicId === epicId) ?? null);
  }, [projectKey, epicId]);

  useEffect(() => {
    void refresh();
    void getContract().then(setContract);
  }, [refresh]);

  const startRun = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const result = await startOrchestratorRun(projectKey, epicId, {
      budget: budget ? Number(budget) : undefined,
      maxSteps: maxSteps ? Number(maxSteps) : undefined,
    });
    if (result.ok) {
      go({ view: 'run', jobId: result.jobId });
      return;
    }
    setRunMessage(result.error.message);
    void refresh();
  };

  if (error) return <p role="alert">{error}</p>;
  if (!state || !contract) return <p>Loading…</p>;

  return (
    <article>
      <h2>{epicId}</h2>
      <p>
        Status: {state.status}
        {state.paused ? ' (paused)' : ''}
      </p>
      <p>Budget: {state.budgetUsd === null ? 'none' : formatUsd(state.budgetUsd)}</p>
      <p>Spent: {formatUsd(state.spentUsd)}</p>
      {state.status === 'RUNNING' ? (
        <p>A run is currently in progress.</p>
      ) : (
        state.haltReason && (
          <p>
            Halted: {state.haltReason}
            {state.message && <> — {state.message}</>}
          </p>
        )
      )}

      <section aria-label="Run">
        <form onSubmit={(event) => void startRun(event)}>
          <label>
            Budget (USD)
            <input
              type="number"
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
            />
          </label>
          <label>
            Max steps
            <input
              type="number"
              value={maxSteps}
              onChange={(event) => setMaxSteps(event.target.value)}
            />
          </label>
          <button type="submit">Run</button>
        </form>
        {runMessage && <p>{runMessage}</p>}
      </section>

      <section aria-label="Pause, resume, clear budget">
        <DecisionForm
          projectKey={projectKey}
          commandPath="orchestrator pause"
          command={contract.commands['orchestrator pause']}
          fixedValues={{ epicId }}
          submitLabel="Pause"
          onDone={() => void refresh()}
        />
        <DecisionForm
          projectKey={projectKey}
          commandPath="orchestrator resume"
          command={contract.commands['orchestrator resume']}
          fixedValues={{ epicId }}
          submitLabel="Resume"
          onDone={() => void refresh()}
        />
        <DecisionForm
          projectKey={projectKey}
          commandPath="orchestrator clear-budget"
          command={contract.commands['orchestrator clear-budget']}
          fixedValues={{ epicId }}
          confirmMessage={`Clear the budget for ${epicId}?`}
          submitLabel="Clear budget"
          onDone={() => void refresh()}
        />
      </section>
    </article>
  );
}
