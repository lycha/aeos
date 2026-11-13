// Web client — the create-ticket form (AC-24): a DecisionForm over `ticket
// create` whose `spec` field is restricted to the features present in the
// project's artefact tree (`GET …/features`, T-009's `listFeatures`) instead
// of a free text field, so the operator can only pick a spec that exists.

import { useEffect, useState } from 'react';

import type { Contract } from '../../cli/contract/contract-schema.js';
import { getContract, getFeatures } from './api.js';
import { DecisionForm } from './DecisionForm.js';

export interface CreateTicketProps {
  readonly projectKey: string;
  readonly onDone: () => void;
}

export function CreateTicket({ projectKey, onDone }: CreateTicketProps) {
  const [contract, setContract] = useState<Contract | null>(null);
  const [features, setFeatures] = useState<string[] | null>(null);

  useEffect(() => {
    void getContract().then(setContract);
    void getFeatures(projectKey).then(setFeatures);
  }, [projectKey]);

  if (!contract || !features) return <p>Loading…</p>;

  return (
    <DecisionForm
      projectKey={projectKey}
      commandPath="ticket create"
      command={contract.commands['ticket create']}
      fixedValues={{}}
      fields={{
        spec: { options: features.map((feature) => ({ value: feature, label: feature })) },
      }}
      submitLabel="Create ticket"
      onDone={onDone}
    />
  );
}
