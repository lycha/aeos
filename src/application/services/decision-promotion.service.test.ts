import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DecisionPromotionService } from './decision-promotion.service.js';
import type { ArtifactStore } from '../../domain/ports/driven/artifact-store.port.js';

function createMockArtifactStore(): ArtifactStore {
  return {
    artifactExists: vi.fn().mockReturnValue(false),
    readArtifact: vi.fn(),
    getArtifactMtime: vi.fn().mockReturnValue(null),
    writeArtifact: vi.fn(),
    removeArtifact: vi.fn(),
    listArtifacts: vi.fn().mockReturnValue([]),
  };
}

const TEXT_FENCE = '```text';
const END_FENCE = '```';

describe('DecisionPromotionService', () => {
  let artifactStore: ReturnType<typeof createMockArtifactStore>;
  let service: DecisionPromotionService;

  beforeEach(() => {
    artifactStore = createMockArtifactStore();
    service = new DecisionPromotionService(artifactStore);
  });

  it('returns legacy-skipped for unversioned questions files', () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue(
      '1. Which executor should we support?\n2. Do we need retries?',
    );

    const result = service.promote({
      projectPath: '/project',
      ticketId: 'AEOS-1',
      stage: 'ARCH_SPIKE',
      settledBy: 'human',
    });

    expect(result.status).toBe('legacy-skipped');
    expect(result.warnings[0]).toContain('legacy');
    expect(artifactStore.writeArtifact).not.toHaveBeenCalled();
  });

  it('promotes structured v2 questions into a new decisions artifact verbatim', () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue(
      [
        '# AEOS Questions',
        'Format-Version: 2',
        'Ticket: AEOS-1',
        'Stage: ARCH_SPIKE',
        'Generated-By: preflight',
        '',
        '## Q-001',
        'Status: OPEN',
        'Topic: executor-scope',
        'Required: yes',
        '',
        '### Question',
        TEXT_FENCE,
        'Which executors are in scope for v1?',
        END_FENCE,
        '',
        '### Answer',
        TEXT_FENCE,
        'Support `claude` and `stub` only in v1.',
        '',
        '- No third executor in v1.',
        END_FENCE,
      ].join('\n'),
    );

    const result = service.promote({
      projectPath: '/project',
      ticketId: 'AEOS-1',
      stage: 'ARCH_SPIKE',
      settledBy: 'human',
      settledAt: '2026-04-20T12:00:00Z',
    });

    expect(result).toMatchObject({
      status: 'promoted',
      decisionsPath: 'AEOS-1-decisions.md',
      createdDecisionIds: ['D-001'],
    });
    expect(artifactStore.writeArtifact).toHaveBeenCalledWith(
      '/project',
      'AEOS-1',
      'AEOS-1-decisions.md',
      expect.stringContaining(
        'Support `claude` and `stub` only in v1.\n\n- No third executor in v1.',
      ),
    );
  });

  it('returns validation-error when a required question has an empty answer', () => {
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockReturnValue(
      [
        '# AEOS Questions',
        'Format-Version: 2',
        'Ticket: AEOS-1',
        'Stage: ARCH_SPIKE',
        'Generated-By: preflight',
        '',
        '## Q-001',
        'Status: OPEN',
        'Topic: executor-scope',
        'Required: yes',
        '',
        '### Question',
        TEXT_FENCE,
        'Which executors are in scope for v1?',
        END_FENCE,
        '',
        '### Answer',
        TEXT_FENCE,
        END_FENCE,
      ].join('\n'),
    );

    const result = service.promote({
      projectPath: '/project',
      ticketId: 'AEOS-1',
      stage: 'ARCH_SPIKE',
      settledBy: 'human',
    });

    expect(result).toMatchObject({ status: 'validation-error' });
    expect(result.error).toContain('Missing required answers');
    expect(artifactStore.writeArtifact).not.toHaveBeenCalled();
  });

  it('updates an existing decision when the same source question is promoted again', () => {
    (artifactStore.artifactExists as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockImplementation(
      (_projectPath: string, _ticketId: string, filename: string) => {
        if (filename === 'AEOS-1-questions.md') {
          return [
            '# AEOS Questions',
            'Format-Version: 2',
            'Ticket: AEOS-1',
            'Stage: ARCH_SPIKE',
            'Generated-By: preflight',
            '',
            '## Q-001',
            'Status: OPEN',
            'Topic: executor-scope',
            'Required: yes',
            '',
            '### Question',
            TEXT_FENCE,
            'Which executors are in scope for v1?',
            END_FENCE,
            '',
            '### Answer',
            TEXT_FENCE,
            'Support `claude` only.',
            END_FENCE,
          ].join('\n');
        }

        return [
          '# AEOS Decisions',
          'Format-Version: 1',
          'Ticket: AEOS-1',
          '',
          '## D-001',
          'Source: Q-001',
          'Topic: executor-scope',
          'Status: SETTLED',
          'StageSettled: ARCH_SPIKE',
          'SettledBy: human',
          'SettledAt: 2026-04-20T10:00:00Z',
          '',
          '### Decision',
          TEXT_FENCE,
          'Support `stub` only.',
          END_FENCE,
        ].join('\n');
      },
    );

    const result = service.promote({
      projectPath: '/project',
      ticketId: 'AEOS-1',
      stage: 'ARCH_SPIKE',
      settledBy: 'human',
      settledAt: '2026-04-20T12:00:00Z',
    });

    expect(result).toMatchObject({
      status: 'promoted',
      updatedDecisionIds: ['D-001'],
    });
    expect(artifactStore.writeArtifact).toHaveBeenCalledWith(
      '/project',
      'AEOS-1',
      'AEOS-1-decisions.md',
      expect.stringContaining('Support `claude` only.'),
    );
  });

  it('supersedes the prior active decision when a topic is re-decided by a new source question', () => {
    (artifactStore.artifactExists as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (artifactStore.readArtifact as ReturnType<typeof vi.fn>).mockImplementation(
      (_projectPath: string, _ticketId: string, filename: string) => {
        if (filename === 'AEOS-1-questions.md') {
          return [
            '# AEOS Questions',
            'Format-Version: 2',
            'Ticket: AEOS-1',
            'Stage: TECH_SPEC',
            'Generated-By: preflight',
            '',
            '## Q-002',
            'Status: OPEN',
            'Topic: executor-scope',
            'Required: yes',
            '',
            '### Question',
            TEXT_FENCE,
            'Confirm executor scope after architecture review.',
            END_FENCE,
            '',
            '### Answer',
            TEXT_FENCE,
            'Support `claude` and `stub` in v1.',
            END_FENCE,
          ].join('\n');
        }

        return [
          '# AEOS Decisions',
          'Format-Version: 1',
          'Ticket: AEOS-1',
          '',
          '## D-001',
          'Source: Q-001',
          'Topic: executor-scope',
          'Status: SETTLED',
          'StageSettled: ARCH_SPIKE',
          'SettledBy: human',
          'SettledAt: 2026-04-20T10:00:00Z',
          '',
          '### Decision',
          TEXT_FENCE,
          'Support `stub` only.',
          END_FENCE,
        ].join('\n');
      },
    );

    const result = service.promote({
      projectPath: '/project',
      ticketId: 'AEOS-1',
      stage: 'TECH_SPEC',
      settledBy: 'human',
      settledAt: '2026-04-20T12:00:00Z',
    });

    expect(result).toMatchObject({
      status: 'promoted',
      createdDecisionIds: ['D-002'],
      supersededDecisionIds: ['D-001'],
    });
    expect(artifactStore.writeArtifact).toHaveBeenCalledWith(
      '/project',
      'AEOS-1',
      'AEOS-1-decisions.md',
      expect.stringContaining('Supersedes: D-001'),
    );
  });
});
