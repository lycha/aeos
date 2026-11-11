// Driven port — DecisionsFile: amending a feature's decision log.

/** A decision a person made after the spec was pinned. */
export interface Amendment {
  readonly question: string;
  /** The person's answer. */
  readonly resolution: string;
  /** Where the decision was made: the ticket and its questions file. */
  readonly evidence: string;
}

/** The ids an amendment was given in `decisions.yaml`. */
export interface AmendedDecision {
  /** `NEW-<n>`: a decision about something the inventory never listed. */
  readonly absence: string;
  /** `AC-<n>`: the criterion spec.md still has to gain. */
  readonly becomes: string;
}

export interface DecisionsFile {
  /**
   * Appends each amendment to `decisions.yaml` of the feature as a `DECIDED`
   * entry decided by a human, with the next free ids of the file. Writes the
   * file and nothing else: the caller lints and commits.
   */
  amend(featureDir: string, amendments: readonly Amendment[]): AmendedDecision[];
}
