import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GateRecord } from '../../domain/model/gate-record.js';
import type { Ticket } from '../../domain/model/ticket.js';
import type { ArtefactTree } from '../../domain/ports/driven/artefact-tree.port.js';
import type { DecisionsFile } from '../../domain/ports/driven/decisions-file.port.js';
import type { DecisionsLint } from '../../domain/ports/driven/decisions-lint.port.js';
import type { GateRecordStore } from '../../domain/ports/driven/gate-record-store.port.js';
import type { GitGateway } from '../../domain/ports/driven/git-gateway.port.js';
import { SpecAmendmentService } from './spec-amendment.service.js';

const PIN = { repo: 'AEOS-aeos', commit: 'c0ffee1', path: 'features/checkout' };
const TREE = '/project/.aeos';
const DECISIONS = 'features/checkout/decisions.yaml';
const task = { id: 'AEOS-2', column: 'IMPLEMENTATION' } as Ticket;
const answered = [{ id: 'Q-001', question: 'Night greeting?', answer: 'The same.' }];

describe('SpecAmendmentService', () => {
  let gates: GateRecord[];
  let lint: ReturnType<typeof vi.fn>;
  let decisionsFile: { amend: ReturnType<typeof vi.fn> };
  let gitGateway: {
    changedFiles: ReturnType<typeof vi.fn>;
    restoreFiles: ReturnType<typeof vi.fn>;
    commitFiles: ReturnType<typeof vi.fn>;
  };
  let service: SpecAmendmentService;

  beforeEach(() => {
    gates = [];
    lint = vi.fn().mockReturnValue({ schemaErrors: [], lintErrors: [], escalated: [] });
    decisionsFile = { amend: vi.fn().mockReturnValue([{ absence: 'NEW-1', becomes: 'AC-2' }]) };
    gitGateway = {
      changedFiles: vi.fn().mockReturnValue([]),
      restoreFiles: vi.fn(),
      commitFiles: vi.fn(),
    };
    service = new SpecAmendmentService(
      {
        root: () => TREE,
        featureDir: () => `${TREE}/features/checkout`,
      } as unknown as ArtefactTree,
      decisionsFile as DecisionsFile,
      { lint } as unknown as DecisionsLint,
      gitGateway as unknown as GitGateway,
      { list: () => gates } as unknown as GateRecordStore,
    );
  });

  it('writes each answer as an amendment citing the ticket, lints, then commits', () => {
    const result = service.amend('/project', task, PIN, answered);

    expect(result).toEqual({ ok: true, decisions: [{ absence: 'NEW-1', becomes: 'AC-2' }] });
    expect(decisionsFile.amend).toHaveBeenCalledWith(`${TREE}/features/checkout`, [
      {
        question: 'Night greeting?',
        resolution: 'The same.',
        evidence: 'AEOS-2: tickets/AEOS-2/AEOS-2-questions.md#Q-001',
      },
    ]);
    expect(lint).toHaveBeenCalledWith(TREE, 'checkout');
    expect(gitGateway.commitFiles).toHaveBeenCalledWith(
      TREE,
      [`${TREE}/${DECISIONS}`],
      'decide(checkout): amendment from AEOS-2',
    );
  });

  it('puts decisions.yaml back and shows the linter output when the lint fails', () => {
    lint.mockReturnValue({
      schemaErrors: ['decisions.schema.json: decisions/1: bad'],
      lintErrors: ['NEW-1 never reached the register'],
      escalated: [],
    });

    const result = service.amend('/project', task, PIN, answered);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toContain('decisions.schema.json: decisions/1: bad');
    expect(!result.ok && result.error).toContain('NEW-1 never reached the register');
    expect(gitGateway.restoreFiles).toHaveBeenCalledWith(TREE, [DECISIONS]);
    expect(gitGateway.commitFiles).not.toHaveBeenCalled();
  });

  it('puts decisions.yaml back when the linter cannot run', () => {
    lint.mockImplementation(() => {
      throw new Error('python3 is not on PATH');
    });

    expect(() => service.amend('/project', task, PIN, answered)).toThrow('python3');
    expect(gitGateway.restoreFiles).toHaveBeenCalledWith(TREE, [DECISIONS]);
  });

  it('refuses a second amendment while one is not repinned, and says whose', () => {
    gates = [{ gate: 'amendment', ticket: 'AEOS-3', spec_pin: PIN } as GateRecord];

    const result = service.amend('/project', task, PIN, answered);

    expect(!result.ok && result.error).toMatch(/AEOS-3.*aeos ticket repin AEOS-3/s);
    expect(decisionsFile.amend).not.toHaveBeenCalled();
  });

  it('allows an amendment once the earlier one was repinned', () => {
    gates = [
      {
        gate: 'amendment',
        ticket: 'AEOS-3',
        spec_pin: { ...PIN, commit: 'abc1234' },
      } as GateRecord,
    ];

    expect(service.amend('/project', task, PIN, answered).ok).toBe(true);
  });

  it('refuses when decisions.yaml has uncommitted changes', () => {
    gitGateway.changedFiles.mockReturnValue([DECISIONS]);

    const result = service.amend('/project', task, PIN, answered);

    expect(!result.ok && result.error).toContain('uncommitted');
    expect(decisionsFile.amend).not.toHaveBeenCalled();
  });
});
