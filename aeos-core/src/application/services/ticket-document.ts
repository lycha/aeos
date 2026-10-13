// Application service — helpers for the canonical ticket markdown document

import * as path from 'node:path';
import type { Ticket } from '../../domain/model/ticket.js';
import type { ArtifactStore } from '../../domain/ports/driven/artifact-store.port.js';

const METADATA_START = '<!-- AEOS:METADATA START -->';
const METADATA_END = '<!-- AEOS:METADATA END -->';

function renderMetadataBlock(ticket: Ticket): string {
  const lines = [
    METADATA_START,
    '## AEOS Metadata',
    `- Kind: ${ticket.kind}`,
    `- Column: ${ticket.column}`,
    `- Sub-state: ${ticket.subState ?? 'NONE'}`,
  ];
  // Lineage — a task is meaningless without the epic it decomposes; surface the
  // parent (and its stable key) so the document is self-describing.
  if (ticket.parentId) {
    lines.push(`- Parent: ${ticket.parentId}`);
  }
  if (ticket.taskKey) {
    lines.push(`- Task key: ${ticket.taskKey}`);
  }
  lines.push(METADATA_END);
  return lines.join('\n');
}

function upsertMetadataBlock(content: string, ticket: Ticket): string {
  const metadataBlock = renderMetadataBlock(ticket);
  const startIndex = content.indexOf(METADATA_START);
  const endIndex = content.indexOf(METADATA_END);

  if (startIndex >= 0 && endIndex > startIndex) {
    const afterBlockIndex = endIndex + METADATA_END.length;
    return `${content.slice(0, startIndex)}${metadataBlock}${content.slice(afterBlockIndex)}`;
  }

  const lines = content.split('\n');
  if (lines[0]?.startsWith('# ')) {
    return [lines[0], '', metadataBlock, '', ...lines.slice(1)].join('\n');
  }

  return `${metadataBlock}\n\n${content}`;
}

export function ticketDocumentPath(projectPath: string, ticketId: string): string {
  return path.join(projectPath, '.aeos', 'tickets', ticketId, `${ticketId}-ticket.md`);
}

export function buildInitialTicketDocument(ticket: Ticket, body?: string): string {
  // A decomposed task arrives with its full breakdown (description, acceptance
  // criteria, touches, out-of-scope) in `body`; use it verbatim as the
  // Description so the engineer implements from the real spec, not a bare title.
  // Without a body (a hand-created ticket), fall back to editable placeholders.
  const trimmedBody = body?.trim();
  const description = trimmedBody ? trimmedBody : '<!-- Fill in the ticket description here -->';
  const definitionOfDone = trimmedBody
    ? '<!-- Acceptance criteria are covered in the Description above (from the task breakdown). -->'
    : '<!-- Define acceptance criteria — evaluated at DoD Gate -->';

  return [
    `# Ticket: ${ticket.id}`,
    '',
    renderMetadataBlock(ticket),
    '',
    '## Title',
    ticket.title,
    '',
    '## Description',
    description,
    '',
    '## Definition of Done',
    definitionOfDone,
    '',
    '## Notes',
    '<!-- Additional context, links, constraints -->',
    '',
  ].join('\n');
}

export function syncTicketDocument(
  artifactStore: ArtifactStore,
  projectPath: string,
  ticket: Ticket,
): string {
  const filename = `${ticket.id}-ticket.md`;
  const currentContent = artifactStore.readArtifact(projectPath, ticket.id, filename);
  const nextContent = upsertMetadataBlock(currentContent, ticket);
  artifactStore.writeArtifact(projectPath, ticket.id, filename, nextContent);
  return ticketDocumentPath(projectPath, ticket.id);
}
