// Adapter — SQLite implementation of TicketRepository port

import type BetterSqlite3 from 'better-sqlite3';
import { Column } from '../../domain/model/column.js';
import type { ContractChange, Ticket, TicketEscalation } from '../../domain/model/ticket.js';
import type { EscalationReason } from '../../domain/model/escalation.js';
import { SubState } from '../../domain/model/sub-state.js';
import type { SubStateOrNull } from '../../domain/model/sub-state.js';
import type { TicketKind } from '../../domain/model/ticket-kind.js';
import type { TicketRepository } from '../../domain/ports/driven/ticket-repository.port.js';

const TICKET_COLUMNS = `id, project_id, title, kind, parent_id, task_key, "column", sub_state, created_at, updated_at, escalation_reason, escalation_message, escalation_artifact, pr_url, spec_feature, spec_commit, implements, track, contract_change`;

interface TicketRow {
  id: string;
  project_id: string;
  title: string;
  kind: TicketKind;
  parent_id: string | null;
  task_key: string | null;
  column: Column;
  sub_state: string | null;
  created_at: string;
  updated_at: string;
  escalation_reason: string | null;
  escalation_message: string | null;
  escalation_artifact: string | null;
  pr_url: string | null;
  spec_feature: string | null;
  spec_commit: string | null;
  /** Comma-separated criterion ids. */
  implements: string | null;
  track: 'bug' | null;
  /** A `ContractChange` as JSON. */
  contract_change: string | null;
}

const FEATURES_PREFIX = 'features/';

export class SqliteTicketRepository implements TicketRepository {
  constructor(private readonly db: BetterSqlite3.Database) {}

  private mapRowToTicket(row: TicketRow): Ticket {
    return {
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      // Rows written before the hierarchy migration are epics by definition.
      kind: row.kind ?? 'EPIC',
      parentId: row.parent_id ?? null,
      taskKey: row.task_key ?? null,
      column: row.column,
      // DONE has no sub-state. Rows approved into it before that was enforced
      // are stored READY, so it is settled here, on read, not by a migration.
      subState: row.column === Column.DONE ? null : ((row.sub_state as SubStateOrNull) ?? null),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      escalation: row.escalation_reason
        ? {
            reason: row.escalation_reason as EscalationReason,
            message: row.escalation_message ?? '',
            artifactPath: row.escalation_artifact,
          }
        : null,
      prUrl: row.pr_url ?? null,
      // Only the feature and the commit are stored. The repository's identity
      // is `<project key>-aeos`, and the key is the ticket id's prefix.
      specPin:
        row.spec_feature && row.spec_commit
          ? {
              repo: `${row.id.slice(0, row.id.lastIndexOf('-'))}-aeos`,
              commit: row.spec_commit,
              path: `${FEATURES_PREFIX}${row.spec_feature}`,
            }
          : null,
      implements: row.implements ? row.implements.split(',') : null,
      track: row.track ?? null,
      contractChange: row.contract_change
        ? (JSON.parse(row.contract_change) as ContractChange)
        : null,
    };
  }

  nextId(projectId: string): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(MAX(CAST(SUBSTR(id, INSTR(id, '-') + 1) AS INTEGER)), 0) + 1 AS next_num
         FROM tickets WHERE project_id = ?`,
      )
      .get(projectId) as { next_num: number } | undefined;
    return row?.next_num ?? 1;
  }

  save(ticket: Ticket): void {
    this.db
      .prepare(
        `INSERT INTO tickets (id, project_id, title, kind, parent_id, task_key, "column", sub_state, created_at, updated_at, spec_feature, spec_commit, implements, track)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        ticket.id,
        ticket.projectId,
        ticket.title,
        ticket.kind,
        ticket.parentId,
        ticket.taskKey ?? null,
        ticket.column,
        ticket.subState,
        ticket.createdAt,
        ticket.updatedAt,
        ticket.specPin ? ticket.specPin.path.slice(FEATURES_PREFIX.length) : null,
        ticket.specPin?.commit ?? null,
        ticket.implements?.length ? ticket.implements.join(',') : null,
        ticket.track ?? null,
      );
  }

  /** Atomically allocates the next ticket ID and inserts the ticket. */
  createAtomic(projectId: string, buildTicket: (nextNum: number) => Ticket): Ticket {
    const txn = this.db.transaction(() => {
      const nextNum = this.nextId(projectId);
      const ticket = buildTicket(nextNum);
      this.save(ticket);
      return ticket;
    });
    return txn();
  }

  deleteById(projectId: string, ticketId: string): void {
    this.db.prepare('DELETE FROM tickets WHERE project_id = ? AND id = ?').run(projectId, ticketId);
  }

  findById(projectId: string, ticketId: string): Ticket | null {
    const row = this.db
      .prepare(
        `SELECT ${TICKET_COLUMNS}
         FROM tickets WHERE project_id = ? AND UPPER(id) = UPPER(?)`,
      )
      .get(projectId, ticketId) as TicketRow | undefined;

    if (!row) return null;

    return this.mapRowToTicket(row);
  }

  findByProject(projectId: string, columnFilter?: Column): Ticket[] {
    let sql = `SELECT ${TICKET_COLUMNS} FROM tickets WHERE project_id = ?`;
    const params: string[] = [projectId];

    if (columnFilter) {
      sql += ' AND "column" = ?';
      params.push(columnFilter);
    }

    sql += " ORDER BY CAST(SUBSTR(id, INSTR(id, '-') + 1) AS INTEGER)";

    const rows = this.db.prepare(sql).all(...params) as TicketRow[];

    return rows.map((row) => this.mapRowToTicket(row));
  }

  findChildren(projectId: string, parentTicketId: string): Ticket[] {
    const rows = this.db
      .prepare(
        `SELECT ${TICKET_COLUMNS}
         FROM tickets
         WHERE project_id = ? AND UPPER(parent_id) = UPPER(?)
         ORDER BY CAST(SUBSTR(id, INSTR(id, '-') + 1) AS INTEGER)`,
      )
      .all(projectId, parentTicketId) as TicketRow[];

    return rows.map((row) => this.mapRowToTicket(row));
  }

  updateColumn(projectId: string, ticketId: string, column: Column): void {
    this.db
      .prepare(`UPDATE tickets SET "column" = ?, updated_at = ? WHERE project_id = ? AND id = ?`)
      .run(column, new Date().toISOString(), projectId, ticketId);
  }

  updateSubState(projectId: string, ticketId: string, subState: SubStateOrNull): void {
    // A ticket that has moved off ESCALATED/BLOCKED is no longer stalled for the
    // recorded reason, so drop it in the same write. Keeping it would let
    // `ticket show` report a stale "why" against a READY/WORKING ticket.
    const retainEscalation = subState === SubState.ESCALATED || subState === SubState.BLOCKED;
    if (retainEscalation) {
      this.db
        .prepare(`UPDATE tickets SET sub_state = ?, updated_at = ? WHERE project_id = ? AND id = ?`)
        .run(subState, new Date().toISOString(), projectId, ticketId);
    } else {
      this.db
        .prepare(
          `UPDATE tickets
           SET sub_state = ?, updated_at = ?,
               escalation_reason = NULL, escalation_message = NULL, escalation_artifact = NULL
           WHERE project_id = ? AND id = ?`,
        )
        .run(subState, new Date().toISOString(), projectId, ticketId);
    }
  }

  setEscalation(projectId: string, ticketId: string, escalation: TicketEscalation | null): void {
    this.db
      .prepare(
        `UPDATE tickets
         SET escalation_reason = ?, escalation_message = ?, escalation_artifact = ?, updated_at = ?
         WHERE project_id = ? AND id = ?`,
      )
      .run(
        escalation?.reason ?? null,
        escalation?.message ?? null,
        escalation?.artifactPath ?? null,
        new Date().toISOString(),
        projectId,
        ticketId,
      );
  }

  setPrUrl(projectId: string, ticketId: string, prUrl: string): void {
    this.db
      .prepare(`UPDATE tickets SET pr_url = ?, updated_at = ? WHERE project_id = ? AND id = ?`)
      .run(prUrl, new Date().toISOString(), projectId, ticketId);
  }

  setSpecCommit(projectId: string, ticketId: string, commit: string): void {
    this.db
      .prepare(`UPDATE tickets SET spec_commit = ?, updated_at = ? WHERE project_id = ? AND id = ?`)
      .run(commit, new Date().toISOString(), projectId, ticketId);
  }

  setContractChange(projectId: string, ticketId: string, change: ContractChange | null): void {
    this.db
      .prepare(
        `UPDATE tickets SET contract_change = ?, updated_at = ? WHERE project_id = ? AND id = ?`,
      )
      .run(change ? JSON.stringify(change) : null, new Date().toISOString(), projectId, ticketId);
  }
}
