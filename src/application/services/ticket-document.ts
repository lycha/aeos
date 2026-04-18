// Application service — helpers for the canonical ticket markdown document

import * as path from 'node:path';
import type { Ticket } from '../../domain/model/ticket.js';
import type { ArtifactStore } from '../../domain/ports/driven/artifact-store.port.js';

const METADATA_START = '<!-- AEOS:METADATA START -->';
const METADATA_END = '<!-- AEOS:METADATA END -->';

function renderMetadataBlock(ticket: Ticket): string {
  return [
    METADATA_START,
    '## AEOS Metadata',
    `- Column: ${ticket.column}`,
    `- Sub-state: ${ticket.subState ?? 'NONE'}`,
    METADATA_END,
  ].join('\n');
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

export function buildInitialTicketDocument(ticket: Ticket): string {
  return [
    `# Ticket: ${ticket.id}`,
    '',
    renderMetadataBlock(ticket),
    '',
    '## Title',
    ticket.title,
    '',
    '## Description',
    '<!-- Fill in the ticket description here -->',
    '',
    '## Definition of Done',
    '<!-- Define acceptance criteria — evaluated at DoD Gate -->',
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
