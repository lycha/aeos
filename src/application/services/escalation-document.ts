// Application service — the human-facing escalation artifact and its response.
//
// Generalizes the preflight `questions.md` round-trip to every escalation: a run
// that escalates writes `<ticketId>-escalation.md` with the reason and a fenced
// `## Response` block; the operator writes their decision there and runs
// `aeos ticket resolve <id>`, which folds the response back as context and
// resumes the ticket.

export const ESCALATION_FILENAME_SUFFIX = '-escalation.md';

/** The filename of a ticket's escalation artifact. */
export function escalationFilename(ticketId: string): string {
  return `${ticketId}${ESCALATION_FILENAME_SUFFIX}`;
}

export interface EscalationDocumentInput {
  ticketId: string;
  column: string;
  reason: string;
  message: string;
  artifactPath?: string | null;
}

/** Builds the initial `<ticketId>-escalation.md` with an empty response block. */
export function buildEscalationDocument(input: EscalationDocumentInput): string {
  const { ticketId, column, reason, message, artifactPath } = input;
  const lines = [
    '# AEOS Escalation',
    'Format-Version: 1',
    `Ticket: ${ticketId}`,
    `Column: ${column}`,
    `Reason: ${reason}`,
    '',
    '## Why',
    message,
    '',
  ];
  if (artifactPath) {
    lines.push(`See: ${artifactPath}`, '');
  }
  lines.push(
    '## Response',
    '<!-- Write your decision below, then run: aeos ticket resolve ' + ticketId + ' -->',
    '<!-- The response is injected into the next run as authoritative operator guidance. -->',
    '```text',
    '',
    '```',
    '',
  );
  return lines.join('\n');
}

/**
 * Extracts the operator's response from the fenced block under `## Response`.
 * Returns null when the block is absent or empty (nothing to resolve).
 */
export function parseEscalationResponse(content: string): string | null {
  const responseIdx = content.indexOf('## Response');
  if (responseIdx === -1) return null;

  const after = content.slice(responseIdx);
  const fence = after.match(/```(?:text)?\n([\s\S]*?)```/);
  if (!fence) return null;

  const body = fence[1]
    // Drop the HTML comment guidance lines if they landed inside the fence.
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
  return body.length > 0 ? body : null;
}

/** Renders the operator's resolution as a context artifact for the retry. */
export function buildResolutionDocument(
  ticketId: string,
  reason: string,
  response: string,
): string {
  return [
    `# Operator Resolution: ${ticketId}`,
    '',
    `The prior run escalated (${reason}). A human resolved it with the following`,
    'authoritative guidance. Honor it in this run — it overrides earlier assumptions',
    'where they conflict.',
    '',
    '## Guidance',
    response,
    '',
  ].join('\n');
}
