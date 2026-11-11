// Driven port — PipelineStateRepository: the pipeline last accepted for each kind

import type { Column } from '../../model/column.js';
import type { TicketKind } from '../../model/ticket-kind.js';

export interface PipelineStateRepository {
  /** The accepted columns of a kind, or null for a project not seen yet. */
  find(projectId: string, kind: TicketKind): readonly Column[] | null;
  save(projectId: string, kind: TicketKind, columns: readonly Column[], acceptedAt: string): void;
}
