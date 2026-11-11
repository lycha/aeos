// CLI command — aeos ticket show

import type { Handlers } from '../generated/commands.gen.js';
import { done, stopped } from '../result.js';
import { escalationOf, knownTotal, summaryOf } from '../ticket-data.js';
import { formatCostUsd } from '../../domain/model/cost-record.js';
import { withColumnLabels } from '../../domain/services/column-labels.js';

export const ticketShow: Handlers['ticketShow'] = async ({ id }, _options, context) => {
  // Validate ticket ID format at CLI boundary
  if (!/^[A-Za-z]+-[0-9]+$/.test(id)) {
    return stopped(
      'usage',
      'INVALID_ARGUMENT',
      `Invalid ticket ID '${id}'. Expected format: PREFIX-123 (e.g. AEOS-1).`,
    );
  }

  // 1. Resolve project root
  const { projectPath } = context;

  const project = context.container.projectRepo.read(projectPath);
  const labels = context.container.columnLabels(projectPath);

  // 2. Call use case (case-insensitive via ticketId uppercasing handled in repo)
  const result = context.container.ticketShow.execute({
    projectId: project.id,
    ticketId: id,
    projectPath,
  });

  // 3. Handle not-found
  if (!result.ok) {
    return stopped(
      'error',
      'TICKET_NOT_FOUND',
      `Ticket '${id}' not found. Run 'aeos ticket list' to see available tickets.`,
    );
  }

  // 4. Format the structured output
  const subState = result.ticket.subState ?? '—';

  const out = [
    `Ticket: ${result.ticket.id}`,
    `Title:  ${result.ticket.title}`,
    `Kind:   ${result.ticket.kind}`,
  ];
  if (result.parent) {
    out.push(`Parent: ${result.parent.id} — ${result.parent.title}`);
  }
  // The one place the identifier is shown, so a person can always find it.
  out.push(`Column: ${labels[result.ticket.column]} (${result.ticket.column})`);
  out.push(`State:  ${subState}`);
  if (result.specPin) {
    out.push(`Spec:   ${result.specPin.repo}@${result.specPin.commit} (${result.specPin.path})`);
    if (result.specMoved) {
      out.push('        Warning: spec has moved since this epic was pinned');
    }
  }
  if (result.ticket.prUrl) {
    out.push(`PR:     ${result.ticket.prUrl}`);
  }

  // The whole point of ESCALATED/BLOCKED is "a human must look" — so tell the
  // human why, right here, instead of making them open the review artifact.
  const escalation = result.ticket.escalation;
  if (escalation) {
    out.push(`Reason: ${escalation.reason} — ${escalation.message}`);
    if (escalation.artifactPath) {
      out.push(`        See: ${escalation.artifactPath}`);
    }
    // Point the operator at the file-based resolve flow.
    if (subState === 'ESCALATED') {
      out.push(
        `        Respond in ${result.ticket.id}-escalation.md, then: aeos ticket resolve ${result.ticket.id}`,
      );
    } else if (subState === 'BLOCKED') {
      out.push(
        `        Answer ${result.ticket.id}-questions.md, then: aeos ticket answer ${result.ticket.id}`,
      );
    }
  }

  if (result.children.length > 0) {
    const finished = result.children.filter((child) => child.column === 'DONE').length;
    out.push('', `Tasks (${finished}/${result.children.length} done):`);
    for (const child of result.children) {
      const mark = child.column === 'DONE' ? '✓' : ' ';
      out.push(
        `  ${mark} ${child.id.padEnd(10)} ${labels[child.column].padEnd(16)} ${child.subState ?? '—'}  ${child.title}`,
      );
    }
  }

  if (result.artifacts.length > 0) {
    out.push('', 'Artifacts:');
    for (const artifact of result.artifacts) {
      out.push(`  • ${artifact}`);
    }
  }

  if (result.executions.length > 0) {
    out.push('', 'Executions:');
    for (const execution of result.executions) {
      const modelInfo = execution.model === 'unknown' ? '(unknown)' : execution.model;
      out.push(
        `  • ${withColumnLabels(execution.column, labels)} (${execution.agent}): ${execution.executor} / ${modelInfo} — ${formatCostUsd(execution.costUsd)}`,
      );
    }
  }

  if (result.runs.length > 0) {
    out.push('', 'Runs:');
    for (const runId of result.runs) {
      out.push(`  • ${runId}`);
    }
  }

  return done(
    {
      ticket: {
        ...summaryOf(result.ticket, labels),
        escalation: escalationOf(escalation),
        specPin: result.specPin,
        pullRequestUrl: result.ticket.prUrl ?? null,
      },
      artifacts: result.artifacts,
      costUsd: knownTotal(result.executions.map((execution) => execution.costUsd)),
    },
    out.join('\n'),
  );
};
