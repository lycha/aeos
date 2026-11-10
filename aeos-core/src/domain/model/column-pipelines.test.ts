import { describe, it, expect } from 'vitest';

import { templatePipelines } from '../../infrastructure/spec-loader/yaml-pipeline-loader.adapter.js';
import { columnOrderFor, isColumnInPipeline, nextColumnFor } from './column.js';
import { TicketKind } from './ticket-kind.js';

const pipelines = templatePipelines();

describe('the template pipelines', () => {
  it('route an epic through spec review, tech spec and decomposition — never implementation', () => {
    expect(columnOrderFor(pipelines, TicketKind.EPIC)).toEqual([
      'BACKLOG',
      'SPEC_REVIEW',
      'TECH_SPEC',
      'TASK_BREAKDOWN',
      'INTEGRATION_REVIEW',
      'DOD_GATE',
      'DONE',
    ]);
    expect(isColumnInPipeline(pipelines, TicketKind.EPIC, 'IMPLEMENTATION')).toBe(false);
    expect(isColumnInPipeline(pipelines, TicketKind.EPIC, 'INTEGRATION_REVIEW')).toBe(true);
  });

  it('route a task straight to building — it is already specified', () => {
    expect(columnOrderFor(pipelines, TicketKind.TASK)).toEqual([
      'BACKLOG',
      'IMPLEMENTATION',
      'CODE_REVIEW',
      'QA',
      'DONE',
    ]);
    expect(isColumnInPipeline(pipelines, TicketKind.TASK, 'TECH_SPEC')).toBe(false);
  });

  describe('nextColumnFor', () => {
    it('advances an epic from TASK_BREAKDOWN to INTEGRATION_REVIEW, then DOD_GATE', () => {
      expect(nextColumnFor(pipelines, TicketKind.EPIC, 'TASK_BREAKDOWN')).toBe(
        'INTEGRATION_REVIEW',
      );
      expect(nextColumnFor(pipelines, TicketKind.EPIC, 'INTEGRATION_REVIEW')).toBe('DOD_GATE');
    });

    it('advances a task from BACKLOG to IMPLEMENTATION and from QA to DONE', () => {
      expect(nextColumnFor(pipelines, TicketKind.TASK, 'BACKLOG')).toBe('IMPLEMENTATION');
      expect(nextColumnFor(pipelines, TicketKind.TASK, 'QA')).toBe('DONE');
    });

    it('returns null at the end of either pipeline', () => {
      expect(nextColumnFor(pipelines, TicketKind.EPIC, 'DONE')).toBeNull();
      expect(nextColumnFor(pipelines, TicketKind.TASK, 'DONE')).toBeNull();
    });

    it('returns null when the column is not in that kind pipeline', () => {
      // An epic parked in IMPLEMENTATION has no next column — the caller must
      // surface that rather than guessing.
      expect(nextColumnFor(pipelines, TicketKind.EPIC, 'IMPLEMENTATION')).toBeNull();
      expect(nextColumnFor(pipelines, TicketKind.TASK, 'TECH_SPEC')).toBeNull();
    });
  });
});
