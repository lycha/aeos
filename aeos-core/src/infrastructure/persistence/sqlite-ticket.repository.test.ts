import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type BetterSqlite3 from 'better-sqlite3';

import { initSchema, resetDb } from './database.js';
import { SqliteTicketRepository } from './sqlite-ticket.repository.js';
import { Column } from '../../domain/model/column.js';
import { SubState } from '../../domain/model/sub-state.js';
import { TicketKind } from '../../domain/model/ticket-kind.js';
import { EscalationReason } from '../../domain/model/escalation.js';
import type { Ticket } from '../../domain/model/ticket.js';

let db: BetterSqlite3.Database;
let repo: SqliteTicketRepository;

function ticket(overrides: Partial<Ticket> = {}): Ticket {
  const now = new Date().toISOString();
  return {
    id: 'AEOS-1',
    projectId: 'p',
    title: 'Epic',
    kind: TicketKind.EPIC,
    parentId: null,
    column: Column.TECH_SPEC,
    subState: SubState.WORKING,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  // initSchema short-circuits on a module-level flag; reset it so each fresh
  // in-memory db actually gets migrated.
  resetDb();
  db = new Database(':memory:');
  initSchema(db);
  repo = new SqliteTicketRepository(db);
});

afterEach(() => {
  db.close();
  resetDb();
});

describe('SqliteTicketRepository — escalation', () => {
  it('round-trips a recorded escalation', () => {
    repo.save(ticket({ subState: SubState.ESCALATED }));
    repo.setEscalation('p', 'AEOS-1', {
      reason: EscalationReason.ITERATIONS_EXHAUSTED,
      message: 'Reviewer never cleared its blockers.',
      artifactPath: 'AEOS-1-tech-spec-review.md',
    });

    const found = repo.findById('p', 'AEOS-1');
    expect(found?.escalation).toEqual({
      reason: EscalationReason.ITERATIONS_EXHAUSTED,
      message: 'Reviewer never cleared its blockers.',
      artifactPath: 'AEOS-1-tech-spec-review.md',
    });
  });

  it('has no escalation on a freshly saved ticket', () => {
    repo.save(ticket());
    expect(repo.findById('p', 'AEOS-1')?.escalation).toBeNull();
  });

  it('retains the escalation while the ticket stays ESCALATED', () => {
    repo.save(ticket({ subState: SubState.ESCALATED }));
    repo.setEscalation('p', 'AEOS-1', {
      reason: EscalationReason.NOT_CONVERGING,
      message: 'Same blockers each attempt.',
    });

    // Re-affirming ESCALATED (or moving to BLOCKED) must not wipe the reason.
    repo.updateSubState('p', 'AEOS-1', SubState.ESCALATED);
    expect(repo.findById('p', 'AEOS-1')?.escalation?.reason).toBe(EscalationReason.NOT_CONVERGING);
  });

  it('clears the escalation when the ticket returns to READY', () => {
    repo.save(ticket({ subState: SubState.ESCALATED }));
    repo.setEscalation('p', 'AEOS-1', {
      reason: EscalationReason.NOT_CONVERGING,
      message: 'Same blockers each attempt.',
    });

    repo.updateSubState('p', 'AEOS-1', SubState.READY);
    expect(repo.findById('p', 'AEOS-1')?.escalation).toBeNull();
  });

  it('clears the escalation via setEscalation(null)', () => {
    repo.save(ticket({ subState: SubState.ESCALATED }));
    repo.setEscalation('p', 'AEOS-1', {
      reason: EscalationReason.UNPARSEABLE_VERDICT,
      message: 'No verdict trailer.',
    });

    repo.setEscalation('p', 'AEOS-1', null);
    expect(repo.findById('p', 'AEOS-1')?.escalation).toBeNull();
  });
});
