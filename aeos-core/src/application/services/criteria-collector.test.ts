import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ArtefactTree } from '../../domain/ports/driven/artefact-tree.port.js';
import type { GitGateway } from '../../domain/ports/driven/git-gateway.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';
import type { TicketRepository } from '../../domain/ports/driven/ticket-repository.port.js';
import { CriteriaCollector } from './criteria-collector.js';

const PIN = { repo: 'EE-aeos', commit: 'c0ffee1', path: 'features/checkout' };
const TREE = '/project/.aeos';
const epic = { id: 'EE-1', projectId: 'p' };

describe('CriteriaCollector', () => {
  let spec: Record<string, string>;
  let code: Record<string, string>;
  let config: object | null;
  let collector: CriteriaCollector;

  beforeEach(() => {
    spec = {
      'features/checkout/spec.md': '- **AC-1** — a\n- **AC-2** — b\n- **NON-GOAL-1** — c',
      'features/checkout/features/pay.feature':
        'Feature: Pay\n\n  @AC-1\n  Scenario: Pays by card\n    Given a card\n',
    };
    code = {
      'src/pay.test.ts': "it('AC-2 refunds', () => {});",
      'src/pay.ts': "// 'AC-1' is handled here; it('AC-1 not a test file')",
      'tests/e2e/pay.spec.ts': '// @AC-1\n',
      'docs/notes.md': '# @AC-2',
    };
    config = null;
    const files = (dir: string): Record<string, string> => (dir === TREE ? spec : code);
    const gitGateway = {
      showFile: vi.fn((dir: string, _commit: string, file: string) => files(dir)[file]!),
      listFiles: vi.fn((dir: string, _commit: string, under: string) =>
        Object.keys(files(dir)).filter((file) => under === '.' || file.startsWith(`${under}/`)),
      ),
    };
    collector = new CriteriaCollector(
      {
        findChildren: () => [
          { id: 'EE-2', implements: ['AC-1'] },
          { id: 'EE-3', implements: null },
        ],
      } as unknown as TicketRepository,
      gitGateway as unknown as GitGateway,
      { root: () => TREE } as unknown as ArtefactTree,
      { readExecutorConfig: () => config } as unknown as ProjectRepository,
    );
  });

  it('traces the pinned criteria against task claims, scenario tags and tagged tests', () => {
    const trace = collector.collect('/project', epic, PIN);

    expect(trace.rows).toEqual([
      {
        id: 'AC-1',
        claimedBy: ['EE-2'],
        instruments: ['features/pay.feature: Pays by card', 'tests/e2e/pay.spec.ts'],
      },
      { id: 'AC-2', claimedBy: [], instruments: ['src/pay.test.ts: AC-2 refunds'] },
    ]);
    expect(trace.unclaimed).toEqual(['AC-2']);
    expect(trace.nonGoals).toEqual(['NON-GOAL-1']);
  });

  it('scans only the files criteria.testGlobs names', () => {
    config = { criteria: { testGlobs: ['docs/**'] } };

    expect(collector.collect('/project', epic, PIN).rows[1]!.instruments).toEqual([
      'docs/notes.md',
    ]);
  });
});
