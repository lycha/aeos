// Application service — the text the engine writes into git and the code host:
// the task commit message and the pull request body.

import { formatCostUsd } from '../../domain/model/cost-record.js';
import type { SpecPin } from '../../domain/model/spec-pin.js';
import type { Ticket } from '../../domain/model/ticket.js';
import { formatSpecPin } from './spec-pin.js';

/**
 * `[AEOS-12] Title`, then `Ticket:` and, for a child task, `Epic:` trailers.
 * Later tasks pass their own (`Spec`, `Implements`) as `extraTrailers`.
 */
export function buildTaskCommitMessage(
  ticket: Pick<Ticket, 'id' | 'title' | 'parentId'>,
  extraTrailers: readonly (readonly [key: string, value: string])[] = [],
): string {
  const trailers: (readonly [string, string])[] = [['Ticket', ticket.id]];
  if (ticket.parentId) trailers.push(['Epic', ticket.parentId]);
  trailers.push(...extraTrailers);
  return [
    `[${ticket.id}] ${ticket.title}`,
    '',
    ...trailers.map(([key, value]) => `${key}: ${value}`),
  ].join('\n');
}

export interface PullRequestBodyInput {
  readonly ticketId: string;
  readonly title: string;
  /** "Integration review" for an epic, "Code review" for a task. */
  readonly reviewLabel: string;
  /** Path from the project root; `.aeos` has no remote, so it cannot be a link. */
  readonly reviewPath: string | null;
  readonly reviewSummary: string | null;
  /** The markdown table from `<ticket>-checks.md`, when a checks stage passed. */
  readonly checksTable: string | null;
  /** One entry per recorded run; null where the cost is unknown. */
  readonly costs: readonly (number | null)[];
  /** The pinned spec of a spec-backed ticket. */
  readonly specPin?: SpecPin | null;
}

export function buildPullRequestBody(input: PullRequestBodyInput): string {
  const known = input.costs.filter((cost): cost is number => cost !== null);
  const unknown = input.costs.length - known.length;
  const total =
    known.length === 0
      ? 'unknown'
      : formatCostUsd(known.reduce((sum, cost) => sum + cost, 0)) +
        (unknown > 0
          ? ` (${unknown} run${unknown === 1 ? '' : 's'} with unknown cost not included)`
          : '');
  const review = input.reviewPath
    ? `\`${input.reviewPath}\`${input.reviewSummary ? ` (${input.reviewSummary})` : ''}`
    : 'not found';

  return [
    `# [${input.ticketId}] ${input.title}`,
    '',
    `Opened by AEOS for ticket ${input.ticketId}. Artefact paths are relative to the project root.`,
    '',
    '## Spec',
    '',
    '<!-- aeos:spec-pin -->',
    input.specPin
      ? `Spec: \`${formatSpecPin(input.specPin)}\`, \`${input.specPin.path}\``
      : '_Spec pin: not recorded yet._',
    '',
    '## Review',
    '',
    `${input.reviewLabel}: ${review}`,
    '',
    '## Checks',
    '',
    input.checksTable ?? 'No checks were recorded for this ticket.',
    '',
    '## Conformance',
    '',
    '<!-- aeos:conformance -->',
    '_Conformance summary: not recorded yet._',
    '',
    '## Cost',
    '',
    `Total cost: ${total}`,
    '',
  ].join('\n');
}
