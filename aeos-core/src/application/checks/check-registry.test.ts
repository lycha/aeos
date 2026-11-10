import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ticket } from '../../domain/model/ticket.js';
import type { ArtifactStore } from '../../domain/ports/driven/artifact-store.port.js';
import { traceCriteria, type CriteriaTrace } from '../../domain/services/criteria-trace.js';
import type { CriteriaCollector } from '../services/criteria-collector.js';
import type { Check } from '../../domain/model/check.js';
import type { ChecksRunner } from '../../domain/ports/driven/checks-runner.port.js';
import type { ProjectRepository } from '../../domain/ports/driven/project-repository.port.js';
import { CheckRegistry } from './check-registry.js';

function registryWith(checks: unknown, runner: ChecksRunner): CheckRegistry {
  return new CheckRegistry(
    { readExecutorConfig: () => (checks ? { checks } : null) } as unknown as ProjectRepository,
    runner,
    collector as unknown as CriteriaCollector,
    artifactStore as unknown as ArtifactStore,
  );
}

const PIN = { repo: 'EE-aeos', commit: 'c0ffee1', path: 'features/checkout' };
const epic = { id: 'EE-1', projectId: 'p', kind: 'EPIC', column: 'INTEGRATION_REVIEW' } as Ticket;
const collector = { collect: vi.fn() };
const artifactStore = { writeArtifact: vi.fn() };
const anyRunner: ChecksRunner = { run: vi.fn() };
const traceOf = (claims: string[]): CriteriaTrace =>
  traceCriteria({
    criteria: ['AC-1', 'AC-2'],
    nonGoals: [],
    claims: new Map([['EE-2', claims]]),
    instruments: new Map([
      ['AC-1', ['a.test.ts']],
      ['AC-2', ['b.test.ts']],
    ]),
  });

describe('CheckRegistry — pre-worker checks', () => {
  beforeEach(() => {
    collector.collect.mockReset();
    artifactStore.writeArtifact.mockReset();
  });

  it('adds criterion tracing for a spec-backed epic at integration review, whatever is configured', () => {
    const checks = registryWith(null, anyRunner).preWorkerChecksFor(epic, PIN, 'integration');

    expect(checks.map((check) => [check.name, check.phase])).toEqual([
      ['criteria-trace', 'pre-worker'],
    ]);
  });

  it('goes by the role of the column, not its name', () => {
    const elsewhere = { ...epic, column: 'TECH_SPEC' as const };

    expect(
      registryWith(null, anyRunner).preWorkerChecksFor(elsewhere, PIN, 'integration'),
    ).toHaveLength(1);
  });

  it('has none for an epic with no spec, another role, or a task', () => {
    const registry = registryWith(null, anyRunner);

    expect(registry.preWorkerChecksFor(epic, null, 'integration')).toEqual([]);
    expect(registry.preWorkerChecksFor(epic, PIN, 'standard')).toEqual([]);
    expect(registry.preWorkerChecksFor({ ...epic, kind: 'TASK' }, PIN, 'integration')).toEqual([]);
  });

  it('fails in process when a criterion is unclaimed, and writes the report both ways', async () => {
    collector.collect.mockReturnValue(traceOf(['AC-1']));
    const [check] = registryWith(null, anyRunner).preWorkerChecksFor(epic, PIN, 'integration');

    const result = await check!.run({ projectPath: '/project' });

    expect(result).toMatchObject({
      name: 'criteria-trace',
      passed: false,
      artifacts: ['EE-1-criteria-trace.md', 'EE-1-criteria-trace.json'],
    });
    expect(result.outputTail).toContain('Unclaimed: AC-2');
    expect(collector.collect).toHaveBeenCalledWith('/project', epic, PIN);
    expect(anyRunner.run).not.toHaveBeenCalled();
    const written = Object.fromEntries(
      artifactStore.writeArtifact.mock.calls.map((call) => [call[2], call[3]]),
    ) as Record<string, string>;
    expect(written['EE-1-criteria-trace.md']).toContain('| AC-2 | — | b.test.ts |');
    expect(JSON.parse(written['EE-1-criteria-trace.json']!)).toMatchObject({ unclaimed: ['AC-2'] });
  });

  it('passes when every criterion is claimed and tagged', async () => {
    collector.collect.mockReturnValue(traceOf(['AC-1', 'AC-2']));
    const [check] = registryWith(null, anyRunner).preWorkerChecksFor(epic, PIN, 'integration');

    expect((await check!.run({ projectPath: '/project' })).passed).toBe(true);
  });
});

const runnerReturning = (result: Awaited<ReturnType<ChecksRunner['run']>>): ChecksRunner => ({
  run: vi.fn().mockResolvedValue(result),
});

describe('CheckRegistry', () => {
  it('turns each project.json entry into a post-worker check, in order', () => {
    const registry = registryWith(
      [
        { name: 'lint', command: 'npm run lint', timeoutSeconds: 120 },
        { name: 'test', command: 'npm test', timeoutSeconds: 600 },
      ],
      runnerReturning({ exitCode: 0, durationMs: 1, timedOut: false, outputTail: '' }),
    );

    const checks = registry.checksFor('/project');

    expect(checks.map((check) => check.name)).toEqual(['lint', 'test']);
    expect(checks.every((check) => check.phase === 'post-worker')).toBe(true);
  });

  it('has no checks when the project configures none', () => {
    const runner = runnerReturning({ exitCode: 0, durationMs: 1, timedOut: false, outputTail: '' });

    expect(registryWith(null, runner).checksFor('/project')).toEqual([]);
  });

  it('runs a registered check after the configured ones', () => {
    const inProcess: Check = { name: 'in-process', phase: 'post-worker', run: vi.fn() };
    const registry = registryWith(
      [{ name: 'lint', command: 'npm run lint', timeoutSeconds: 120 }],
      runnerReturning({ exitCode: 0, durationMs: 1, timedOut: false, outputTail: '' }),
    );

    registry.register(inProcess);

    expect(registry.checksFor('/project').map((check) => check.name)).toEqual([
      'lint',
      'in-process',
    ]);
  });

  describe('a shell check', () => {
    const entry = { name: 'test', command: 'npm test', timeoutSeconds: 600 };

    it('passes on exit code 0, running its command in the project root', async () => {
      const runner = runnerReturning({
        exitCode: 0,
        durationMs: 42,
        timedOut: false,
        outputTail: 'ok',
      });
      const [check] = registryWith([entry], runner).checksFor('/project');

      const result = await check!.run({ projectPath: '/project' });

      expect(runner.run).toHaveBeenCalledWith(
        { command: 'npm test', timeoutSeconds: 600 },
        '/project',
      );
      expect(result).toEqual({
        name: 'test',
        passed: true,
        durationMs: 42,
        timedOut: false,
        outputTail: 'ok',
      });
    });

    it('fails on a non-zero exit code', async () => {
      const runner = runnerReturning({
        exitCode: 1,
        durationMs: 5,
        timedOut: false,
        outputTail: 'boom',
      });
      const [check] = registryWith([entry], runner).checksFor('/project');

      expect(await check!.run({ projectPath: '/project' })).toMatchObject({
        passed: false,
        timedOut: false,
        outputTail: 'boom',
      });
    });

    it('fails with timedOut when the runner killed it', async () => {
      const runner = runnerReturning({
        exitCode: null,
        durationMs: 600_000,
        timedOut: true,
        outputTail: '',
      });
      const [check] = registryWith([entry], runner).checksFor('/project');

      expect(await check!.run({ projectPath: '/project' })).toMatchObject({
        passed: false,
        timedOut: true,
      });
    });
  });
});
