import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Ticket } from '../../domain/model/ticket.js';
import type { ChecksRunner } from '../../domain/ports/driven/checks-runner.port.js';
import type { GitGateway } from '../../domain/ports/driven/git-gateway.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';
import type { TestReportReader } from '../../domain/ports/driven/test-report-reader.port.js';
import type { TicketRepository } from '../../domain/ports/driven/ticket-repository.port.js';
import { traceCriteria } from '../../domain/services/criteria-trace.js';
import { ConformanceService } from './conformance.service.js';
import type { CriteriaCollector } from './criteria-collector.js';

const PROJECT = path.resolve('/project');
const PIN = { repo: 'EE-aeos', commit: 'c0ffee1', path: 'features/checkout' };
const epic = { id: 'EE-1', projectId: 'shop', kind: 'EPIC', specPin: PIN } as Ticket;
const testReport = {
  command: 'npx vitest run --reporter=json --outputFile=.aeos/tmp/test-report.json',
  path: '.aeos/tmp/test-report.json',
  format: 'vitest-json',
};

describe('ConformanceService', () => {
  let config: object | null;
  let found: Ticket | null;
  let runner: { run: ReturnType<typeof vi.fn> };
  let reader: { read: ReturnType<typeof vi.fn> };
  let collector: { collect: ReturnType<typeof vi.fn> };
  let service: ConformanceService;

  beforeEach(() => {
    config = { criteria: { testReport } };
    found = epic;
    runner = {
      run: vi
        .fn()
        .mockResolvedValue({ exitCode: 1, durationMs: 9, timedOut: false, outputTail: 'x' }),
    };
    reader = {
      read: vi.fn().mockReturnValue([
        { name: 'AC-1 greets', file: path.join(PROJECT, 'src/a.test.ts'), status: 'pass' },
        { name: 'AC-2 remembers', file: path.join(PROJECT, 'src/a.test.ts'), status: 'fail' },
      ]),
    };
    collector = {
      collect: vi.fn().mockReturnValue(
        traceCriteria({
          criteria: ['AC-1', 'AC-2', 'AC-3'],
          nonGoals: ['NON-GOAL-1'],
          claims: new Map([['EE-2', ['AC-1']]]),
          instruments: new Map(),
        }),
      ),
    };
    service = new ConformanceService(
      {
        read: () => ({ id: 'shop', key: 'EE' }),
        readExecutorConfig: () => config,
      } as unknown as ProjectRepository,
      { findById: () => found } as unknown as TicketRepository,
      collector as unknown as CriteriaCollector,
      runner as ChecksRunner,
      reader as TestReportReader,
      { headCommit: () => 'deadbee' } as unknown as GitGateway,
    );
  });

  it('runs the test-report command through the checks runner, reads the report, and builds', async () => {
    const { report, yaml, markdown } = await service.buildConformance(PROJECT, 'EE-1');

    expect(runner.run).toHaveBeenCalledWith(
      { command: testReport.command, timeoutSeconds: 1800 },
      PROJECT,
    );
    expect(reader.read).toHaveBeenCalledWith(
      path.join(PROJECT, '.aeos/tmp/test-report.json'),
      'vitest-json',
    );
    expect(collector.collect).toHaveBeenCalledWith(PROJECT, epic, PIN);
    expect(report.meta).toMatchObject({
      feature: 'checkout',
      epic: 'EE-1',
      spec: PIN,
      code: { repo: 'shop', commit: 'deadbee' },
    });
    // A failing test run is a result, not an error.
    expect(report.criteria).toMatchObject([
      {
        id: 'AC-1',
        verdict: 'pass',
        claimed_by: ['EE-2'],
        instruments: [
          {
            kind: 'test',
            name: 'src/a.test.ts: AC-1 greets',
            evidence: '.aeos/tmp/test-report.json',
          },
        ],
      },
      { id: 'AC-2', verdict: 'fail' },
      { id: 'AC-3', verdict: 'unverified', instruments: [] },
    ]);
    expect(report.summary).toEqual({ total: 3, pass: 1, fail: 1, unverified: 1 });
    expect(yaml).toContain('schema_version: 0');
    expect(markdown).toContain('| AC-1 | pass |');
  });

  it('leaves every criterion unverified when no test report is configured', async () => {
    config = null;

    const { report } = await service.buildConformance(PROJECT, 'EE-1');

    expect(runner.run).not.toHaveBeenCalled();
    expect(report.summary).toEqual({ total: 3, pass: 0, fail: 0, unverified: 3 });
  });

  it('says what the command printed when it left no report to read', async () => {
    runner.run.mockResolvedValue({
      exitCode: 127,
      durationMs: 1,
      timedOut: false,
      outputTail: 'npx: not found',
    });
    reader.read.mockImplementation(() => {
      throw new Error('Cannot read the test report');
    });

    await expect(service.buildConformance(PROJECT, 'EE-1')).rejects.toThrow(
      /Cannot read the test report[\s\S]*npx: not found/,
    );
  });

  it('refuses a ticket that is not a spec-backed epic', async () => {
    found = { ...epic, specPin: null };
    await expect(service.buildConformance(PROJECT, 'EE-1')).rejects.toThrow(
      /not a spec-backed epic/,
    );

    found = null;
    await expect(service.buildConformance(PROJECT, 'EE-1')).rejects.toThrow(/EE-1 not found/);
  });
});
