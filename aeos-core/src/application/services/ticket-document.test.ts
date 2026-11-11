import { describe, it, expect } from 'vitest';

import { buildInitialTicketDocument } from './ticket-document.js';
import { TicketKind } from '../../domain/model/ticket-kind.js';
import type { Ticket } from '../../domain/model/ticket.js';

function ticket(overrides: Partial<Ticket> = {}): Ticket {
  const now = new Date().toISOString();
  return {
    id: 'AEOS-2',
    projectId: 'p',
    title: 'Add password hashing',
    kind: TicketKind.TASK,
    parentId: 'AEOS-1',
    taskKey: 'T-001',
    column: 'BACKLOG',
    subState: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('buildInitialTicketDocument — lineage metadata', () => {
  it('records kind, parent, and task key for a decomposed task', () => {
    const doc = buildInitialTicketDocument(ticket());
    expect(doc).toContain('- Kind: TASK');
    expect(doc).toContain('- Parent: AEOS-1');
    expect(doc).toContain('- Task key: T-001');
  });

  it('omits parent and task-key lines for an epic', () => {
    const doc = buildInitialTicketDocument(
      ticket({ kind: TicketKind.EPIC, parentId: null, taskKey: null }),
    );
    expect(doc).toContain('- Kind: EPIC');
    expect(doc).not.toContain('- Parent:');
    expect(doc).not.toContain('- Task key:');
  });
});

describe('buildInitialTicketDocument — spec pin', () => {
  it('records the pin of a spec-backed epic', () => {
    const doc = buildInitialTicketDocument(
      ticket({
        kind: TicketKind.EPIC,
        parentId: null,
        taskKey: null,
        specPin: { repo: 'AEOS-aeos', commit: 'c0ffee1', path: 'features/checkout' },
      }),
    );

    expect(doc).toContain('- Spec: AEOS-aeos@c0ffee1 (features/checkout)');
  });

  it('records the criteria a task claims', () => {
    const doc = buildInitialTicketDocument(ticket({ implements: ['AC-1', 'AC-2'] }));

    expect(doc).toContain('- Implements: AC-1, AC-2');
    expect(buildInitialTicketDocument(ticket())).not.toContain('- Implements:');
  });

  it('has no spec line without a pin', () => {
    expect(buildInitialTicketDocument(ticket())).not.toContain('- Spec:');
  });
});

describe('buildInitialTicketDocument — body', () => {
  it('uses the provided body as the Description, verbatim', () => {
    const body = [
      '**Depends on:** none',
      '**Touches:** lib/auth/hash.ts',
      '',
      '**Acceptance criteria**',
      '- [ ] bcrypt with cost 12',
    ].join('\n');

    const doc = buildInitialTicketDocument(ticket(), body);

    expect(doc).toContain('bcrypt with cost 12');
    expect(doc).toContain('**Touches:** lib/auth/hash.ts');
    // The placeholder must be gone — the engineer sees the real spec.
    expect(doc).not.toContain('Fill in the ticket description here');
  });

  it('falls back to placeholders when no body is given', () => {
    const doc = buildInitialTicketDocument(ticket());
    expect(doc).toContain('Fill in the ticket description here');
  });
});
